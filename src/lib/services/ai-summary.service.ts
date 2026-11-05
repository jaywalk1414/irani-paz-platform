import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  aiDailySummaries,
  menuItems,
  orderItems,
  orders,
  restaurants,
} from '@/lib/db/schema';
import { shiftDate } from '@/lib/business-day';

// ---------------------------------------------------------------------------
// Aggregation (pure DB — no AI)
// ---------------------------------------------------------------------------

export interface DailyStats {
  businessDate: string;
  orderCount: number;
  revenueToman: number;
  itemCount: number;
  topItems: { name: string; qty: number }[];
  /** 'HH:00–HH:00' ranges ranked by order count. */
  busyRanges: { range: string; orders: number }[];
  yesterday: { orderCount: number; revenueToman: number } | null;
}

/**
 * Compute today's aggregated stats. Deliberately small and PII-free —
 * this is the *only* payload that would be sent to an AI provider.
 */
export async function aggregateDailyStats(
  restaurantId: string,
  businessDate: string,
  timezone: string,
  cutoffHour: number,
): Promise<DailyStats> {
  const windowStart = toZonedUtc(businessDate, cutoffHour, timezone);
  const windowEnd = toZonedUtc(shiftDate(businessDate, 1), cutoffHour, timezone);

  const todayRows = await db
    .select({
      orderId: orders.id,
      confirmedAt: orders.confirmedAt,
      itemName: orderItems.nameSnapshot,
      quantity: orderItems.quantity,
      priceSnapshot: orderItems.unitPriceTomanSnapshot,
      itemStatus: orderItems.status,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        gte(orders.confirmedAt, windowStart),
        lte(orders.confirmedAt, windowEnd),
      ),
    );

  const orderIds = new Set<string>();
  const itemQty: Record<string, number> = {};
  const hourBuckets: Record<number, Set<string>> = {};
  let revenueToman = 0;
  let itemCount = 0;

  for (const row of todayRows) {
    orderIds.add(row.orderId);
    if (row.itemStatus === 'cancelled') continue;

    revenueToman += row.priceSnapshot * row.quantity;
    itemCount += row.quantity;
    itemQty[row.itemName] = (itemQty[row.itemName] ?? 0) + row.quantity;

    const hour = toLocalHour(row.confirmedAt, timezone);
    (hourBuckets[hour] ??= new Set()).add(row.orderId);
  }

  const topItems = Object.entries(itemQty)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const busyRanges = Object.entries(hourBuckets)
    .map(([h, set]) => ({
      range: `${String(h).padStart(2, '0')}:00–${String(
        (Number(h) + 1) % 24,
      ).padStart(2, '0')}:00`,
      orders: set.size,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 3);

  // Yesterday comparison (best-effort; skip if empty)
  const yWindowStart = toZonedUtc(
    shiftDate(businessDate, -1),
    cutoffHour,
    timezone,
  );
  const [yRow] = await db
    .select({
      orderCount: sql<number>`count(distinct ${orders.id})::int`,
      revenue: sql<number>`coalesce(sum(case when ${orderItems.status} <> 'cancelled' then ${orderItems.unitPriceTomanSnapshot} * ${orderItems.quantity} else 0 end), 0)::int`,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        gte(orders.confirmedAt, yWindowStart),
        lte(orders.confirmedAt, windowStart),
      ),
    );

  const yesterday =
    yRow && (yRow.orderCount > 0 || yRow.revenue > 0)
      ? { orderCount: yRow.orderCount, revenueToman: yRow.revenue }
      : null;

  return {
    businessDate,
    orderCount: orderIds.size,
    revenueToman,
    itemCount,
    topItems,
    busyRanges,
    yesterday,
  };
}

// ---------------------------------------------------------------------------
// Generation (AI + fallback)
// ---------------------------------------------------------------------------

export interface GeneratedSummary {
  content: string;
  model: string;
}

function templateSummary(stats: DailyStats, restaurantName: string): GeneratedSummary {
  if (stats.orderCount === 0) {
    return {
      model: 'template',
      content: `No orders yet today at ${restaurantName}. Once service starts, you'll see your top sellers and busiest hours here.`,
    };
  }

  const parts: string[] = [];
  parts.push(
    `${stats.orderCount} order${stats.orderCount === 1 ? '' : 's'} today for ${stats.revenueToman.toLocaleString('fa-IR')} toman across ${stats.itemCount} portion${stats.itemCount === 1 ? '' : 's'}.`,
  );

  if (stats.topItems.length > 0) {
    const top = stats.topItems
      .slice(0, 3)
      .map((i) => `${i.name} (${i.qty})`)
      .join(', ');
    parts.push(`Top sellers: ${top}.`);
  }

  if (stats.busyRanges.length > 0) {
    parts.push(`Busiest window: ${stats.busyRanges[0].range}.`);
  }

  if (stats.yesterday) {
    const delta = stats.revenueToman - stats.yesterday.revenueToman;
    if (stats.yesterday.revenueToman > 0) {
      const pct = Math.round((delta / stats.yesterday.revenueToman) * 100);
      const verb = delta >= 0 ? 'up' : 'down';
      parts.push(
        `Revenue is ${verb} ${Math.abs(pct)}% compared to yesterday's ${stats.yesterday.revenueToman.toLocaleString('fa-IR')} toman.`,
      );
    }
  }

  return { model: 'template', content: parts.join(' ') };
}

async function aiSummary(
  stats: DailyStats,
  restaurantName: string,
): Promise<GeneratedSummary | null> {
  const url = process.env.AI_SUMMARY_API_URL;
  const key = process.env.AI_SUMMARY_API_KEY;
  const model = process.env.AI_SUMMARY_MODEL ?? 'gpt-4o-mini';
  if (!url || !key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'You summarize one day of restaurant operations for the owner in 2–3 short sentences. Be concrete, use the provided numbers, and mention the busiest window and top sellers. Never invent data. Never give operational advice that changes orders, prices, or stock.',
          },
          {
            role: 'user',
            content: `Restaurant: ${restaurantName}. Today's stats (JSON): ${JSON.stringify(stats)}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return { content, model };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Cache read/write
// ---------------------------------------------------------------------------

export async function getCachedSummary(
  restaurantId: string,
  businessDate: string,
): Promise<{ content: string; model: string } | null> {
  const [row] = await db
    .select({ content: aiDailySummaries.content, model: aiDailySummaries.model })
    .from(aiDailySummaries)
    .where(
      and(
        eq(aiDailySummaries.restaurantId, restaurantId),
        eq(aiDailySummaries.businessDate, businessDate),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Generate (or regenerate) the summary for a business day.
 *
 * Isolation guarantees from SCOPE §9:
 *   - only aggregated, PII-free data leaves the server;
 *   - AI failure never throws — falls back to a deterministic template;
 *   - the result is purely informational (stored in its own table).
 */
export async function generateDailySummary(
  restaurantId: string,
  businessDate: string,
  timezone: string,
  cutoffHour: number,
): Promise<{ content: string; model: string }> {
  const [restaurant] = await db
    .select({ name: restaurants.name })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const name = restaurant?.name ?? 'the restaurant';

  const stats = await aggregateDailyStats(
    restaurantId,
    businessDate,
    timezone,
    cutoffHour,
  );

  const ai = await aiSummary(stats, name);
  const final = ai ?? templateSummary(stats, name);

  await db
    .insert(aiDailySummaries)
    .values({
      restaurantId,
      businessDate,
      content: final.content,
      model: final.model,
    })
    .onConflictDoUpdate({
      target: [aiDailySummaries.restaurantId, aiDailySummaries.businessDate],
      set: { content: final.content, model: final.model, createdAt: new Date() },
    });

  return final;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toZonedUtc(dateStr: string, hour: number, timeZone: string): Date {
  const naive = new Date(
    `${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`,
  );
  const offset = getOffsetMinutes(timeZone, naive);
  return new Date(naive.getTime() - offset * 60_000);
}

function getOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  return (asUtc - date.getTime()) / 60_000;
}

function toLocalHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
  }).formatToParts(date);
  const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  return h === 24 ? 0 : h;
}
import { requireRole } from '@/lib/auth/require';
import {
  getBusinessContext,
  listMenuWithAvailability,
} from '@/lib/services/availability.service';
import {
  aggregateDailyStats,
  getCachedSummary,
} from '@/lib/services/ai-summary.service';
import { listRecentAdjustments } from '@/lib/services/availability.service';
import { DailySummaryCard } from './DailySummaryCard';

export const dynamic = 'force-dynamic';

export default async function OwnerDashboardPage() {
  const user = await requireRole(['owner']);
  const ctx = await getBusinessContext(user.restaurantId);

  const [stats, cachedSummary, adjustments, menu] = await Promise.all([
    aggregateDailyStats(user.restaurantId, ctx.businessDate, ctx.timezone, ctx.cutoffHour),
    getCachedSummary(user.restaurantId, ctx.businessDate),
    listRecentAdjustments(user.restaurantId, 5),
    listMenuWithAvailability(user.restaurantId, ctx.businessDate),
  ]);

  const lowStock = menu.filter(
    (m) => m.isActive && m.availableQuantity > 0 && m.availableQuantity <= 3,
  );
  const soldOut = menu.filter((m) => m.isActive && m.availableQuantity === 0);
  const totalAvailable = menu.reduce((s, m) => s + m.availableQuantity, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Today at a glance</h1>
        <p className="text-sm text-zinc-500">
          Business day {ctx.businessDate} · cutoff {String(ctx.cutoffHour).padStart(2, '0')}:00 Tehran
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Orders" value={stats.orderCount.toString()} />
        <KPI
          label="Revenue"
          value={`${stats.revenueToman.toLocaleString('fa-IR')}`}
          suffix="toman"
        />
        <KPI label="Portions sold" value={stats.itemCount.toString()} />
        <KPI
          label="Available now"
          value={totalAvailable.toString()}
          suffix="portions"
        />
      </div>

      {/* AI summary */}
      <DailySummaryCard
        initialSummary={cachedSummary}
        businessDate={ctx.businessDate}
      />

      {/* Top items + busy + adjustments + stock alerts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Top sellers today">
          {stats.topItems.length === 0 ? (
            <Empty>No orders yet.</Empty>
          ) : (
            <ol className="space-y-1.5">
              {stats.topItems.map((it, i) => (
                <li
                  key={it.name}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-sm odd:bg-zinc-50"
                >
                  <span>
                    <span className="mr-2 inline-block w-4 text-xs text-zinc-400">
                      {i + 1}.
                    </span>
                    {it.name}
                  </span>
                  <span className="font-medium tabular-nums">{it.qty}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Busiest windows">
          {stats.busyRanges.length === 0 ? (
            <Empty>No data yet.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {stats.busyRanges.map((b) => (
                <li
                  key={b.range}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-sm odd:bg-zinc-50"
                >
                  <span className="tabular-nums">{b.range}</span>
                  <span className="text-zinc-500">
                    {b.orders} order{b.orders === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Stock alerts">
          {soldOut.length === 0 && lowStock.length === 0 ? (
            <Empty>All items in stock.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {soldOut.map((m) => (
                <li
                  key={m.menuItemId}
                  className="flex justify-between rounded bg-rose-50 px-2 py-1.5 text-rose-800"
                >
                  <span>{m.name}</span>
                  <span className="font-medium">Sold out</span>
                </li>
              ))}
              {lowStock.map((m) => (
                <li
                  key={m.menuItemId}
                  className="flex justify-between rounded bg-amber-50 px-2 py-1.5 text-amber-800"
                >
                  <span>{m.name}</span>
                  <span className="font-medium">{m.availableQuantity} left</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent adjustments">
          {adjustments.length === 0 ? (
            <Empty>No adjustments yet today.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {adjustments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded px-2 py-1.5 odd:bg-zinc-50"
                >
                  <span className="truncate">
                    {a.menuItemName}
                    {a.reason && (
                      <span className="ml-1 text-xs text-zinc-500">— {a.reason}</span>
                    )}
                  </span>
                  <span
                    className={`font-medium tabular-nums ${
                      a.deltaConfigured > 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {a.deltaConfigured > 0 ? '+' : ''}
                    {a.deltaConfigured}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {value}
        {suffix && <span className="ml-1 text-xs font-normal text-zinc-500">{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-zinc-700">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-4 text-center text-sm text-zinc-400">{children}</div>;
}
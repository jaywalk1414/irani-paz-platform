import "./load-env";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as s from "./schema";
// Seed runs in plain Node (not on Workers), so the WebSocket Pool is fine here.
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema: s });

// ---------- helpers ----------

// Asia/Tehran is UTC+3:30 (no DST since 2022).
const TEHRAN_OFFSET_MIN = 3 * 60 + 30;

function getTehranBusinessDate(cutoffHour: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = parseInt(get("hour") === "24" ? "0" : get("hour"), 10);
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  if (hour < cutoffHour) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return dateStr;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function tehranTime(businessDate: string, hour: number, minute: number): Date {
  const [y, m, d] = businessDate.split("-").map(Number);
  return new Date(
    Date.UTC(y, m - 1, d, hour, minute) - TEHRAN_OFFSET_MIN * 60 * 1000,
  );
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- seed data ----------

const CUTOFF_HOUR = 4; // matches restaurants.business_day_cutoff = '04:00:00'

const MENU = [
  {
    key: "koobideh",
    name: "چلو کباب کوبیده",
    description:
      "دو سیخ کباب کوبیده گوشت چرخ‌کرده همراه با برنج زعفرانی و گوجه کبابی.",
    ingredients: [
      "گوشت چرخ‌کرده",
      "پیاز",
      "زعفران",
      "برنج باسماتی",
      "کره",
      "گوجه",
    ],
    priceToman: 180_000,
    prepTimeMinutes: 15,
    prepGroup: "grill" as const,
    dailyQuantityDefault: 25,
  },
  {
    key: "joojeh",
    name: "کباب جوجه",
    description:
      "کباب جوجه مرینیت‌شده با زعفران، همراه با برنج و گوجه کبابی.",
    ingredients: [
      "مرغ",
      "زعفران",
      "ماست",
      "پیاز",
      "برنج باسماتی",
      "کره",
    ],
    priceToman: 220_000,
    prepTimeMinutes: 18,
    prepGroup: "grill" as const,
    dailyQuantityDefault: 20,
  },
  {
    key: "barg",
    name: "کباب برگ",
    description:
      "کباب برگ فیله گوساله مرینیت‌شده با زعفران، همراه با برنج و کره.",
    ingredients: [
      "فیله گوساله",
      "زعفران",
      "برنج باسماتی",
      "کره",
      "گوجه کبابی",
    ],
    priceToman: 320_000,
    prepTimeMinutes: 15,
    prepGroup: "grill" as const,
    dailyQuantityDefault: 12,
  },
  {
    key: "ghormeh",
    name: "قورمه سبزی",
    description:
      "خورش سبزی با گوشت گوساله، لوبیا قرمز و لیمو عمانی؛ همراه با برنج.",
    ingredients: [
      "سبزی",
      "گوشت گوساله",
      "لوبیا قرمز",
      "لیمو عمانی",
      "برنج باسماتی",
    ],
    priceToman: 240_000,
    prepTimeMinutes: 8,
    prepGroup: "stew_rice" as const,
    dailyQuantityDefault: 15,
  },
  {
    key: "gheymeh",
    name: "قیمه",
    description:
      "خورش قیمه با لپه، گوشت گوساله، رب گوجه، لیمو عمانی و سیب‌زمینی سرخ‌کرده؛ همراه با برنج.",
    ingredients: [
      "لپه",
      "گوشت گوساله",
      "رب گوجه",
      "لیمو عمانی",
      "سیب‌زمینی",
      "برنج باسماتی",
    ],
    priceToman: 220_000,
    prepTimeMinutes: 8,
    prepGroup: "stew_rice" as const,
    dailyQuantityDefault: 15,
  },
  {
    key: "fesenjan",
    name: "فسنجان",
    description: "خورش فسنجان با گردو و رب انار همراه با مرغ؛ همراه با برنج.",
    ingredients: ["گردو", "رب انار", "مرغ", "برنج باسماتی"],
    priceToman: 260_000,
    prepTimeMinutes: 10,
    prepGroup: "stew_rice" as const,
    dailyQuantityDefault: 10,
  },
  {
    key: "fries",
    name: "سیب‌زمینی سرخ‌کرده",
    description: "سیب‌زمینی سرخ‌کرده دست‌برش با نمک دریایی.",
    ingredients: ["سیب‌زمینی", "نمک", "روغن"],
    priceToman: 80_000,
    prepTimeMinutes: 6,
    prepGroup: "fryer" as const,
    dailyQuantityDefault: 40,
  },
  {
    key: "fried_chicken",
    name: "مرغ سوخاری",
    description: "تکه‌های مرغ سوخاری با پوشش ترد.",
    ingredients: ["مرغ", "آرد", "پودر سوخاری", "ادویه"],
    priceToman: 190_000,
    prepTimeMinutes: 12,
    prepGroup: "fryer" as const,
    dailyQuantityDefault: 20,
  },
  {
    key: "pizza",
    name: "پیتزا مارگاریتا",
    description: "پیتزا پخته‌شده در تنور با گوجه، موزارلا و ریحان.",
    ingredients: ["خمیر", "گوجه", "موزارلا", "ریحان"],
    priceToman: 260_000,
    prepTimeMinutes: 14,
    prepGroup: "other" as const,
    dailyQuantityDefault: 15,
  },
  {
    key: "shirazi",
    name: "سالاد شیرازی",
    description: "خیار، گوجه و پیاز با نعناع و آبلیمو.",
    ingredients: ["خیار", "گوجه", "پیاز", "نعناع", "آبلیمو"],
    priceToman: 60_000,
    prepTimeMinutes: 4,
    prepGroup: "cold" as const,
    dailyQuantityDefault: 30,
  },
  {
    key: "mast",
    name: "ماست‌و‌خیار",
    description: "ماست با خیار و نعناع خشک.",
    ingredients: ["ماست", "خیار", "نعناع خشک"],
    priceToman: 45_000,
    prepTimeMinutes: 3,
    prepGroup: "cold" as const,
    dailyQuantityDefault: 30,
  },
  {
    key: "doogh",
    name: "دوغ خانگی",
    description: "نوشیدنی دوغ گازدار با نعناع و نمک.",
    ingredients: ["ماست", "آب", "نعناع", "نمک"],
    priceToman: 35_000,
    prepTimeMinutes: 1,
    prepGroup: "beverage" as const,
    dailyQuantityDefault: 50,
  },
  {
    key: "coke",
    name: "کوکاکولا (قوطی)",
    description: "قوطی ۳۳۰ میلی‌لیتری سرد.",
    ingredients: [],
    priceToman: 25_000,
    prepTimeMinutes: 1,
    prepGroup: "beverage" as const,
    dailyQuantityDefault: 100,
  },
] as const;

const TABLES = [
  { label: "میز ۱", seats: 2 },
  { label: "میز ۲", seats: 2 },
  { label: "میز ۳", seats: 4 },
  { label: "میز ۴", seats: 4 },
  { label: "میز ۵", seats: 4 },
  { label: "میز ۶", seats: 6 },
  { label: "میز ۷", seats: 6 },
  { label: "میز ۸", seats: 8 },
];

const DEMO_PASSWORD = "demo1234";

// ---------- main ----------

async function main() {
  const allowSeed =
    process.env.ALLOW_SEED === "true" || process.env.NODE_ENV !== "production";
  if (!allowSeed) {
    console.error(
      "Refusing to seed when NODE_ENV=production. Set ALLOW_SEED=true to override.",
    );
    process.exit(1);
  }

  const businessDate = getTehranBusinessDate(CUTOFF_HOUR);
  console.log(
    `Business date: ${businessDate} (cutoff ${CUTOFF_HOUR}:00 Tehran)`,
  );

  // ---- 1. Reset (safe in dev/demo; CASCADE handles FK order) ----
  console.log("Truncating existing data…");
  await db.execute(sql`
    TRUNCATE TABLE
      ai_daily_summaries,
      availability_adjustments,
      daily_availability,
      order_submissions,
      order_status_history,
      order_items,
      orders,
      tables,
      menu_items,
      users,
      branches,
      restaurants
    CASCADE
  `);

  // ---- 2. Restaurant + branch ----
  const [restaurant] = await db
    .insert(s.restaurants)
    .values({
      name: "رستوران شبستان",
      timezone: "Asia/Tehran",
      businessDayCutoff: `${String(CUTOFF_HOUR).padStart(2, "0")}:00:00`,
    })
    .returning();

  const [branch] = await db
    .insert(s.branches)
    .values({
      restaurantId: restaurant.id,
      name: "شعبه اصلی",
      address: "خیابان ولیعصر، تهران",
    })
    .returning();

  console.log(`Restaurant ${restaurant.id} · branch ${branch.id}`);

  // ---- 3. Users (bcrypt cost 10) ----
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [owner, waiter1, waiter2, kitchen] = await db
    .insert(s.users)
    .values([
      {
        restaurantId: restaurant.id,
        branchId: null,
        email: "owner@demo.local",
        passwordHash,
        fullName: "نادیا احمدی",
        role: "owner",
      },
      {
        restaurantId: restaurant.id,
        branchId: branch.id,
        email: "waiter@demo.local",
        passwordHash,
        fullName: "سارا کریمی",
        role: "waiter",
      },
      {
        restaurantId: restaurant.id,
        branchId: branch.id,
        email: "waiter2@demo.local",
        passwordHash,
        fullName: "رضا جعفری",
        role: "waiter",
      },
      {
        restaurantId: restaurant.id,
        branchId: branch.id,
        email: "kitchen@demo.local",
        passwordHash,
        fullName: "حسین مرادی",
        role: "kitchen",
      },
    ])
    .returning();

  console.log(
    "Users:",
    owner.email,
    waiter1.email,
    waiter2.email,
    kitchen.email,
  );

  // ---- 4. Menu items ----
  const menuRows = await db
    .insert(s.menuItems)
    .values(
      MENU.map((m) => ({
        restaurantId: restaurant.id,
        name: m.name,
        description: m.description,
        ingredients: [...m.ingredients],
        priceToman: m.priceToman,
        prepTimeMinutes: m.prepTimeMinutes,
        prepGroup: m.prepGroup,
        dailyQuantityDefault: m.dailyQuantityDefault,
      })),
    )
    .returning();

  const menuByKey = Object.fromEntries(
    MENU.map((m, i) => [m.key, menuRows[i]]),
  ) as Record<(typeof MENU)[number]["key"], (typeof menuRows)[number]>;

  console.log(`Menu items: ${menuRows.length}`);

  // ---- 5. Tables ----
  const tableRows = await db
    .insert(s.tables)
    .values(
      TABLES.map((t) => ({
        restaurantId: restaurant.id,
        branchId: branch.id,
        label: t.label,
        seats: t.seats,
      })),
    )
    .returning();

  const tableByLabel = Object.fromEntries(
    tableRows.map((t) => [t.label, t]),
  ) as Record<string, (typeof tableRows)[number]>;

  console.log(`Tables: ${tableRows.length}`);

  // ---- 6. Today's active orders (hand-crafted) ----
  // Order A: table "میز ۳", Sara, already in the kitchen (preparing).
  // Order B: table "میز ۵", Reza, just confirmed (pending).
  const now = Date.now();
  const tA = new Date(now - 8 * 60 * 1000);
  const tB = new Date(now - 2 * 60 * 1000);

  const activeOrderPlans = [
    {
      tableLabel: "میز ۳",
      createdByUserId: waiter1.id,
      status: "preparing" as const,
      idempotencyKey: `seed-${businessDate}-active-A`,
      confirmedAt: tA,
      estimatedReadyAt: new Date(now + 15 * 60 * 1000),
      items: [
        { key: "koobideh", qty: 1, instructions: null },
        { key: "shirazi", qty: 1, instructions: null },
        { key: "doogh", qty: 2, instructions: null },
      ],
      itemStatus: "preparing" as const,
    },
    {
      tableLabel: "میز ۵",
      createdByUserId: waiter2.id,
      status: "confirmed" as const,
      idempotencyKey: `seed-${businessDate}-active-B`,
      confirmedAt: tB,
      estimatedReadyAt: new Date(now + 20 * 60 * 1000),
      items: [
        { key: "ghormeh", qty: 2, instructions: null },
        { key: "mast", qty: 1, instructions: null },
      ],
      itemStatus: "pending" as const,
    },
  ];

  // Reserved quantities per menu item from today's active orders.
  const reservedToday: Record<string, number> = {};
  for (const plan of activeOrderPlans) {
    for (const it of plan.items) {
      const id = menuByKey[it.key as keyof typeof menuByKey].id;
      reservedToday[id] = (reservedToday[id] ?? 0) + it.qty;
    }
  }

  // ---- 7. Today's availability (with reserved already applied) ----
  // Owner reduced Koobideh from 25 to 20 (grill running slow).
  const koobidehAdjustedTo = 20;

  const availabilityRows = await db
    .insert(s.dailyAvailability)
    .values(
      menuRows.map((item) => ({
        restaurantId: restaurant.id,
        menuItemId: item.id,
        businessDate,
        // Compare by id, not by name — resilient to future translations.
        configuredQuantity:
          item.id === menuByKey.koobideh.id
            ? koobidehAdjustedTo
            : item.dailyQuantityDefault,
        reservedQuantity: reservedToday[item.id] ?? 0,
      })),
    )
    .returning();

  const availabilityByItemId = Object.fromEntries(
    availabilityRows.map((r) => [r.menuItemId, r]),
  ) as Record<string, (typeof availabilityRows)[number]>;

  console.log(`Daily availability rows: ${availabilityRows.length}`);

  // ---- 8. Owner adjustment audit record ----
  await db.insert(s.availabilityAdjustments).values({
    restaurantId: restaurant.id,
    dailyAvailabilityId: availabilityByItemId[menuByKey.koobideh.id].id,
    adjustedByUserId: owner.id,
    previousConfigured: 25,
    newConfigured: koobidehAdjustedTo,
    deltaConfigured: koobidehAdjustedTo - 25,
    reason: "گریل کندتر از حد انتظار بود؛ رزرو بافر برای شلوغی ناهار.",
  });

  // ---- 9. Historical orders (yesterday, day before) ----
  const rng = mulberry32(20260101);
  const pickItem = () => menuRows[Math.floor(rng() * menuRows.length)];
  const pickQty = () => 1 + Math.floor(rng() * 3); // 1..3
  const pickItemsCount = () => 1 + Math.floor(rng() * 3); // 1..3

  const HISTORICAL = [
    { businessDate: shiftDate(businessDate, -1), count: 10 },
    { businessDate: shiftDate(businessDate, -2), count: 8 },
  ];

  let historicalOrders = 0;

  for (const day of HISTORICAL) {
    for (let i = 0; i < day.count; i++) {
      // Spread orders across 12:00 – 22:00 Tehran.
      const hour = 12 + Math.floor((i * 10) / day.count);
      const minute = Math.floor(rng() * 60);
      const confirmedAt = tehranTime(day.businessDate, hour, minute);
      const readyAt = new Date(
        confirmedAt.getTime() + (20 + rng() * 15) * 60_000,
      );
      const servedAt = new Date(readyAt.getTime() + (5 + rng() * 10) * 60_000);

      const table = tableRows[Math.floor(rng() * tableRows.length)];
      const createdByUserId = rng() < 0.5 ? waiter1.id : waiter2.id;

      const [order] = await db
        .insert(s.orders)
        .values({
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableId: table.id,
          createdByUserId,
          status: "served",
          idempotencyKey: `seed-${day.businessDate}-${i}`,
          confirmedAt,
          estimatedReadyAt: readyAt,
          readyAt,
          servedAt,
          createdAt: confirmedAt,
        })
        .returning();

      const itemsCount = pickItemsCount();
      const itemsValues = Array.from({ length: itemsCount }).map(() => {
        const item = pickItem();
        return {
          orderId: order.id,
          restaurantId: restaurant.id,
          menuItemId: item.id,
          nameSnapshot: item.name,
          unitPriceTomanSnapshot: item.priceToman,
          descriptionSnapshot: item.description,
          prepTimeMinutesSnapshot: item.prepTimeMinutes,
          prepGroupSnapshot: item.prepGroup,
          quantity: pickQty(),
          status: "ready" as const,
          startedAt: confirmedAt,
          readyAt,
          createdAt: confirmedAt,
        };
      });

      await db.insert(s.orderItems).values(itemsValues);

      await db.insert(s.orderStatusHistory).values([
        {
          orderId: order.id,
          fromStatus: null,
          toStatus: "confirmed",
          changedByUserId: createdByUserId,
          createdAt: confirmedAt,
        },
        {
          orderId: order.id,
          fromStatus: "confirmed",
          toStatus: "ready",
          changedByUserId: kitchen.id,
          createdAt: readyAt,
        },
        {
          orderId: order.id,
          fromStatus: "ready",
          toStatus: "served",
          changedByUserId: createdByUserId,
          createdAt: servedAt,
        },
      ]);

      historicalOrders++;
    }
  }

  console.log(`Historical orders: ${historicalOrders}`);

  // ---- 10. Insert today's active orders ----
  for (const plan of activeOrderPlans) {
    const table = tableByLabel[plan.tableLabel];
    if (!table) throw new Error(`Missing table ${plan.tableLabel}`);

    const [order] = await db
      .insert(s.orders)
      .values({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        createdByUserId: plan.createdByUserId,
        status: plan.status,
        idempotencyKey: plan.idempotencyKey,
        confirmedAt: plan.confirmedAt,
        estimatedReadyAt: plan.estimatedReadyAt,
        createdAt: plan.confirmedAt,
      })
      .returning();

    await db.insert(s.orderSubmissions).values({
      restaurantId: restaurant.id,
      idempotencyKey: plan.idempotencyKey,
      orderId: order.id,
    });

    const itemsValues = plan.items.map((it) => {
      const item = menuByKey[it.key as keyof typeof menuByKey];
      return {
        orderId: order.id,
        restaurantId: restaurant.id,
        menuItemId: item.id,
        nameSnapshot: item.name,
        unitPriceTomanSnapshot: item.priceToman,
        descriptionSnapshot: item.description,
        prepTimeMinutesSnapshot: item.prepTimeMinutes,
        prepGroupSnapshot: item.prepGroup,
        quantity: it.qty,
        specialInstructions: it.instructions,
        status: plan.itemStatus,
        startedAt: plan.itemStatus === "preparing" ? plan.confirmedAt : null,
        createdAt: plan.confirmedAt,
      };
    });

    await db.insert(s.orderItems).values(itemsValues);

    type OrderStatusHistoryInsert = typeof s.orderStatusHistory.$inferInsert;

    const history: OrderStatusHistoryInsert[] = [
      {
        orderId: order.id,
        fromStatus: null,
        toStatus: "confirmed",
        changedByUserId: plan.createdByUserId,
        createdAt: plan.confirmedAt,
      },
    ];
    if (plan.status === "preparing") {
      history.push({
        orderId: order.id,
        fromStatus: "confirmed",
        toStatus: "preparing",
        changedByUserId: kitchen.id,
        createdAt: new Date(plan.confirmedAt.getTime() + 60_000),
      });
    }
    await db.insert(s.orderStatusHistory).values(history);

    // Reflect the occupied status on the table.
    await db
      .update(s.tables)
      .set({ status: "occupied" })
      .where(sql`${s.tables.id} = ${table.id}`);
  }

  // ---- 11. Summary ----
  const counts = {
    restaurants: (await db.select().from(s.restaurants)).length,
    branches: (await db.select().from(s.branches)).length,
    users: (await db.select().from(s.users)).length,
    menuItems: (await db.select().from(s.menuItems)).length,
    tables: (await db.select().from(s.tables)).length,
    dailyAvailability: (await db.select().from(s.dailyAvailability)).length,
    availabilityAdjustments: (await db.select().from(s.availabilityAdjustments))
      .length,
    orders: (await db.select().from(s.orders)).length,
    orderItems: (await db.select().from(s.orderItems)).length,
    orderSubmissions: (await db.select().from(s.orderSubmissions)).length,
    orderStatusHistory: (await db.select().from(s.orderStatusHistory)).length,
  };

  console.log("\nSeed complete.");
  console.table(counts);
  console.log("\nDemo credentials (password for all):", DEMO_PASSWORD);
  console.log("  owner   → owner@demo.local   (نادیا احمدی)");
  console.log("  waiter  → waiter@demo.local  (سارا کریمی — سفارش فعال روی میز ۳)");
  console.log("  waiter2 → waiter2@demo.local (رضا جعفری — سفارش فعال روی میز ۵)");
  console.log("  kitchen → kitchen@demo.local (حسین مرادی)");
  console.log(`\nBusiness date: ${businessDate}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
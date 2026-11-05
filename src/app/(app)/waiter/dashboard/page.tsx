import Link from 'next/link';
import { and, eq, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { tables } from '@/lib/db/schema';

interface TableCard {
  id: string;
  label: string;
  seats: number;
  status: string;
  activeOrderId: string | null;
  activeOrderStatus: string | null;
  estimatedReadyAt: Date | null;
}

async function loadTables(restaurantId: string, branchId: string): Promise<TableCard[]> {
  const rows = await db
    .select({
      id: tables.id,
      label: tables.label,
      seats: tables.seats,
      status: tables.status,
      activeOrderId: sql<string | null>`(
        SELECT o.id::text FROM orders o
        WHERE o.table_id = ${tables.id}
          AND o.status IN ('confirmed','preparing','ready')
        ORDER BY o.created_at DESC LIMIT 1
      )`,
      activeOrderStatus: sql<string | null>`(
        SELECT o.status::text FROM orders o
        WHERE o.table_id = ${tables.id}
          AND o.status IN ('confirmed','preparing','ready')
        ORDER BY o.created_at DESC LIMIT 1
      )`,
      estimatedReadyAt: sql<Date | null>`(
        SELECT o.estimated_ready_at FROM orders o
        WHERE o.table_id = ${tables.id}
          AND o.status IN ('confirmed','preparing','ready')
        ORDER BY o.created_at DESC LIMIT 1
      )`,
    })
    .from(tables)
    .where(and(eq(tables.restaurantId, restaurantId), eq(tables.branchId, branchId)))
    .orderBy(tables.label);
  return rows as TableCard[];
}

const statusStyle: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  occupied: 'bg-amber-50 text-amber-700 border-amber-200',
  reserved: 'bg-sky-50 text-sky-700 border-sky-200',
};

const orderStatusLabel: Record<string, string> = {
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready to serve',
};

export default async function WaiterDashboard() {
  const user = await requireRole(['waiter']);
  const rows = await loadTables(user.restaurantId, user.branchId!);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tables</h1>
        <Link
          href="/waiter/orders/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
        >
          + New order
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {rows.map((t) => {
          const active = !!t.activeOrderId;
          const href = active
            ? `/waiter/orders/${t.activeOrderId}`
            : `/waiter/orders/new?tableId=${t.id}`;

          return (
            <Link
              key={t.id}
              href={href}
              className={`flex flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md ${
                active ? 'ring-2 ring-amber-300' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{t.label}</span>
                <span
                  className={`rounded border px-2 py-0.5 text-[11px] ${
                    statusStyle[t.status] ?? 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {t.status}
                </span>
              </div>
              <span className="text-xs text-zinc-500">{t.seats} seats</span>

              {active ? (
                <div className="mt-1 space-y-1 border-t pt-2">
                  <div className="text-xs font-medium text-amber-700">
                    {orderStatusLabel[t.activeOrderStatus ?? ''] ?? 'In progress'}
                  </div>
                  {t.estimatedReadyAt && (
                    <div className="text-[11px] text-zinc-500">
                      Ready ~{formatTime(t.estimatedReadyAt)}
                    </div>
                  )}
                  <div className="text-xs text-zinc-600 underline">View order →</div>
                </div>
              ) : (
                <div className="mt-1 text-xs text-zinc-500">Tap to start order →</div>
              )}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          No tables configured.
        </div>
      )}
    </div>
  );
}

function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
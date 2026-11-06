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

const fa = (n: number) => n.toLocaleString('fa-IR');

const tableStatusLabel: Record<string, string> = {
  available: 'آزاد',
  occupied: 'اشغال',
  reserved: 'رزرو شده',
};

const statusStyle: Record<string, string> = {
  available: 'border-[#27845A]/30 bg-[#27845A]/10 text-[#27845A]',
  occupied: 'border-[#D99A32]/40 bg-[#D99A32]/10 text-[#252B28]',
  reserved: 'border-[#4F7FA5]/30 bg-[#4F7FA5]/10 text-[#4F7FA5]',
};

const orderStatusLabel: Record<string, string> = {
  confirmed: 'تأیید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده سرو',
};

export default async function WaiterDashboard() {
  const user = await requireRole(['waiter']);
  const rows = await loadTables(user.restaurantId, user.branchId!);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[#252B28]">میزها</h1>
        <Link
          href="/waiter/orders/new"
          className="rounded-lg bg-[#234B3B] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#193A2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B] focus-visible:ring-offset-2"
        >
          + سفارش جدید
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
              className={`flex flex-col gap-2 rounded-xl border bg-white p-3.5 shadow-sm transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/50 ${
                active ? 'border-[#D99A32] ring-1 ring-[#D99A32]/60' : 'border-[#E5E9E5]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-bold text-[#252B28]">{t.label}</span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    statusStyle[t.status] ?? 'border-[#E5E9E5] bg-[#F8F9F6] text-[#737B75]'
                  }`}
                >
                  {tableStatusLabel[t.status] ?? t.status}
                </span>
              </div>
              <span className="text-xs text-[#737B75]">{fa(t.seats)} صندلی</span>

              {active ? (
                <div className="mt-1 space-y-1 border-t border-[#E5E9E5] pt-2">
                  <div className="text-xs font-semibold text-[#C87952]">
                    {orderStatusLabel[t.activeOrderStatus ?? ''] ?? 'در جریان'}
                  </div>
                  {t.estimatedReadyAt && (
                    <div className="text-[11px] text-[#737B75]">
                      آماده تا حدود {formatTime(t.estimatedReadyAt)}
                    </div>
                  )}
                  <div className="text-xs font-medium text-[#234B3B] underline underline-offset-2">
                    مشاهده سفارش
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-xs text-[#737B75]">برای ثبت سفارش بزنید</div>
              )}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#E5E9E5] bg-white p-10 text-center text-sm text-[#737B75]">
          هنوز میزی تعریف نشده است.
        </div>
      )}
    </div>
  );
}

function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tehran',
  });
}
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { loadOrderView } from '@/lib/services/order.service';
import { markServedAction } from '../actions';

const fa = (n: number) => n.toLocaleString('fa-IR');

const orderStatusLabel: Record<string, string> = {
  pending: 'در انتظار',
  confirmed: 'تأیید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده سرو',
};

const orderStatusStyle: Record<string, string> = {
  confirmed: 'border-[#4F7FA5]/30 bg-[#4F7FA5]/10 text-[#4F7FA5]',
  preparing: 'border-[#D99A32]/40 bg-[#D99A32]/10 text-[#252B28]',
  ready: 'border-[#27845A]/30 bg-[#27845A]/10 text-[#27845A]',
};

const itemStatusLabel: Record<string, string> = {
  pending: 'در انتظار',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده',
  cancelled: 'لغو شده',
};

export default async function OrderDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await requireRole(['waiter']);

  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.restaurantId, user.restaurantId)))
    .limit(1);
  if (!row) notFound();

  const order = await loadOrderView(db, id);
  if (!order) notFound();

  if (order.status === 'served' || order.status === 'cancelled') {
    // Historic orders route back to the dashboard for now.
    redirect('/waiter/dashboard');
  }

  async function handleServe() {
    'use server';
    await markServedAction(id);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 sm:p-6 sm:pb-28">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-[#252B28]">
            سفارش ـ میز {order.tableLabel}
          </h1>
          <p className="text-sm text-[#737B75]">
            {fa(order.items.length)} آیتم ـ {fa(order.totalToman)} تومان
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium ${
            orderStatusStyle[order.status] ??
            'border-[#E5E9E5] bg-white text-[#737B75]'
          }`}
        >
          {orderStatusLabel[order.status] ?? order.status}
        </span>
      </div>

      {order.estimatedReadyAt && order.status !== 'ready' && (
        <div className="rounded-xl border border-[#27845A]/30 bg-[#27845A]/10 p-3 text-sm text-[#252B28]">
          <span className="font-semibold text-[#27845A]">زمان تقریبی آماده شدن:</span>{' '}
          {new Date(order.estimatedReadyAt).toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tehran',
          })}
        </div>
      )}

      <ul className="space-y-2">
        {order.items.map((i) => (
          <li
            key={i.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-[#E5E9E5] bg-white p-3.5 shadow-sm"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-[#252B28]">
                {fa(i.quantity)} عدد {i.name}
              </div>
              {i.specialInstructions && (
                <div className="mt-1 text-xs leading-6 font-medium text-[#C87952]">
                  توضیح: {i.specialInstructions}
                </div>
              )}
            </div>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${itemStatusStyle(
                i.status,
              )}`}
            >
              {itemStatusLabel[i.status] ?? i.status}
            </span>
          </li>
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E9E5] bg-white p-3 shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href={`/waiter/orders/new?tableId=${order.tableId}`}
            className="rounded-lg border border-[#E5E9E5] bg-white px-4 py-2.5 text-sm font-medium text-[#252B28] transition-colors duration-150 hover:border-[#234B3B] hover:text-[#234B3B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
          >
            + افزودن آیتم
          </Link>

          {order.status === 'ready' ? (
            <form action={handleServe}>
              <button
                type="submit"
                className="rounded-lg bg-[#234B3B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#193A2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B] focus-visible:ring-offset-2"
              >
                ثبت تحویل سفارش
              </button>
            </form>
          ) : (
            <Link
              href="/waiter/dashboard"
              className="rounded-lg border border-[#E5E9E5] bg-white px-4 py-2.5 text-sm text-[#737B75] transition-colors duration-150 hover:bg-[#F7F5EF] hover:text-[#252B28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
            >
              بازگشت به میزها
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function itemStatusStyle(status: string): string {
  switch (status) {
    case 'preparing':
      return 'bg-[#D99A32]/15 text-[#252B28]';
    case 'ready':
      return 'bg-[#27845A]/10 text-[#27845A]';
    case 'cancelled':
      return 'bg-[#D9534F]/10 text-[#D9534F]';
    case 'pending':
    default:
      return 'bg-[#F8F9F6] text-[#737B75]';
  }
}
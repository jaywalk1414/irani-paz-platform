import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { loadOrderView } from '@/lib/services/order.service';
import { markServedAction } from '../actions';


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
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Order · {order.tableLabel}</h1>
          <p className="text-sm text-zinc-500">
            {order.items.length} item{order.items.length === 1 ? '' : 's'} ·{' '}
            {order.totalToman.toLocaleString('fa-IR')} toman
          </p>
        </div>
        <span className="rounded border bg-white px-2 py-1 text-xs font-medium">
          {order.status}
        </span>
      </div>

      {order.estimatedReadyAt && order.status !== 'ready' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span className="font-medium">Estimated ready</span> at{' '}
          {new Date(order.estimatedReadyAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}

      <ul className="space-y-2">
        {order.items.map((i) => (
          <li
            key={i.id}
            className="flex items-start justify-between gap-3 rounded-lg border bg-white p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {i.quantity}× {i.name}
              </div>
              {i.specialInstructions && (
                <div className="mt-0.5 text-xs text-amber-700">
                  Note: {i.specialInstructions}
                </div>
              )}
            </div>
            <span
              className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${itemStatusStyle(
                i.status,
              )}`}
            >
              {i.status}
            </span>
          </li>
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white p-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href={`/waiter/orders/new?tableId=${order.tableId}`}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            + Add items
          </Link>

          {order.status === 'ready' ? (
            <form action={handleServe}>
              <button className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white">
                Mark as served
              </button>
            </form>
          ) : (
            <Link
              href="/waiter/dashboard"
              className="rounded-md border px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Back to tables
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function itemStatusStyle(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-zinc-100 text-zinc-700';
    case 'preparing':
      return 'bg-amber-100 text-amber-700';
    case 'ready':
      return 'bg-emerald-100 text-emerald-700';
    case 'cancelled':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-zinc-100 text-zinc-700';
  }
}
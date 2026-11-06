'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  KitchenItemPayload,
  KitchenOrderPayload,
} from '@/app/api/kitchen/orders/route';
import {
  startItemAction,
  readyItemAction,
  cancelItemAction,
} from './actions';

export type { KitchenItemPayload, KitchenOrderPayload };

const POLL_MS = 5000;

const fa = (n: number) => n.toLocaleString('fa-IR');
const fa1 = (n: number) =>
  n.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const orderStatusLabel: Record<string, string> = {
  pending: 'در انتظار',
  confirmed: 'تأیید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده',
};

const secondaryBtn =
  'rounded-lg border border-[#E5E9E5] bg-white px-3 py-1.5 text-xs font-medium text-[#252B28] ' +
  'transition-colors duration-150 hover:border-[#234B3B] hover:text-[#234B3B] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export function KitchenBoard({ initialOrders }: { initialOrders: KitchenOrderPayload[] }) {
  const [orders, setOrders] = useState<KitchenOrderPayload[]>(initialOrders);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [busyItems, setBusyItems] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{
    orderId: string;
    itemId: string;
    name: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const knownOrderIds = useRef<Set<string>>(new Set(initialOrders.map((o) => o.id)));

  // 1s tick so pending minutes update between polls.
  // First value arrives on the first interval tick (no setState in effect body).
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 5s poll for the server payload.
  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/kitchen/orders', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { orders: KitchenOrderPayload[] };
        if (stopped) return;
        setOrders(data.orders);
        setLastUpdated(new Date());
      } catch {
        /* keep last known */
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const refreshNow = async () => {
    try {
      const res = await fetch('/api/kitchen/orders', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { orders: KitchenOrderPayload[] };
      setOrders(data.orders);
      setLastUpdated(new Date());
    } catch {
      /* ignore */
    }
  };

  const totals = useMemo(() => {
    const items = orders.flatMap((o) => o.items);
    return {
      orders: orders.length,
      pending: items.filter((i) => i.status === 'pending').length,
      preparing: items.filter((i) => i.status === 'preparing').length,
      ready: items.filter((i) => i.status === 'ready').length,
      late: items.filter((i) => i.urgency === 'late').length,
    };
  }, [orders]);

  async function runItemAction(
    itemId: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusyItems((b) => ({ ...b, [itemId]: true }));
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'انجام نشد.');
      }
    } finally {
      setBusyItems((b) => {
        const next = { ...b };
        delete next[itemId];
        return next;
      });
      await refreshNow();
    }
  }

  async function submitCancel() {
    if (!cancelTarget) return;
    const target = cancelTarget;
    setCancelTarget(null);
    await runItemAction(target.itemId, () =>
      cancelItemAction(target.itemId, cancelReason.trim() || null),
    );
    setCancelReason('');
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E9E5] bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Stat label="سفارش‌ها" value={totals.orders} />
          <Stat label="در انتظار" value={totals.pending} tone="neutral" />
          <Stat label="در حال آماده‌سازی" value={totals.preparing} tone="amber" />
          <Stat label="آماده" value={totals.ready} tone="emerald" />
          {totals.late > 0 && <Stat label="با تأخیر" value={totals.late} tone="rose" />}
        </div>
        <div className="flex items-center gap-3 text-xs text-[#737B75]">
          <span>
            به‌روزرسانی:{' '}
            {lastUpdated
              ? lastUpdated.toLocaleTimeString('fa-IR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZone: 'Asia/Tehran',
                })
              : '—'}
          </span>
          <button type="button" onClick={refreshNow} className={secondaryBtn}>
            بازخوانی
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[#D9534F]/30 bg-[#D9534F]/10 px-3.5 py-2.5 text-sm leading-6 text-[#D9534F]"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            بستن
          </button>
        </div>
      )}

      {orders.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#E5E9E5] bg-white p-12 text-center text-sm leading-7 text-[#737B75]">
          سفارش فعالی وجود ندارد. سفارش‌هایی که پیشخدمت‌ها ثبت کنند همین‌جا نمایش داده می‌شوند.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            nowTick={nowTick}
            busyItems={busyItems}
            onStart={(itemId) =>
              runItemAction(itemId, () => startItemAction(itemId))
            }
            onReady={(itemId) =>
              runItemAction(itemId, () => readyItemAction(itemId))
            }
            onCancel={(itemId, name) =>
              setCancelTarget({ orderId: order.id, itemId, name })
            }
          />
        ))}
      </div>

      {/* Cancel dialog */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#252B28]/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-dialog-title"
            className="w-full max-w-sm space-y-4 rounded-xl border border-[#E5E9E5] bg-white p-5 shadow-xl"
          >
            <div className="space-y-0.5">
              <div id="cancel-dialog-title" className="text-sm font-bold text-[#252B28]">
                لغو آیتم
              </div>
              <div className="text-xs text-[#737B75]">{cancelTarget.name}</div>
            </div>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="دلیل (اختیاری) ـ مثلاً تمام شدن موجودی یا تغییر نظر مشتری"
              aria-label="دلیل لغو"
              rows={3}
              className="block w-full rounded-lg border border-[#E5E9E5] bg-white px-3 py-2 text-sm leading-6 text-[#252B28] placeholder:text-[#737B75]/70 transition-colors duration-150 hover:border-[#737B75]/50 focus:border-[#234B3B] focus:outline-none focus:ring-2 focus:ring-[#234B3B]/20"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason('');
                }}
                className="rounded-lg border border-[#E5E9E5] bg-white px-4 py-2 text-sm font-medium text-[#252B28] transition-colors duration-150 hover:bg-[#F7F5EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
              >
                بازگشت
              </button>
              <button
                type="button"
                onClick={submitCancel}
                className="rounded-lg bg-[#D9534F] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#C4443F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9534F] focus-visible:ring-offset-2"
              >
                لغو آیتم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order card
// ---------------------------------------------------------------------------

function OrderCard({
  order,
  nowTick,
  busyItems,
  onStart,
  onReady,
  onCancel,
}: {
  order: KitchenOrderPayload;
  nowTick: number;
  busyItems: Record<string, boolean>;
  onStart: (itemId: string) => void;
  onReady: (itemId: string) => void;
  onCancel: (itemId: string, name: string) => void;
}) {
  const allReady = order.items.every(
    (i) => i.status === 'ready' || i.status === 'cancelled',
  );
  const anyLate = order.items.some((i) => i.urgency === 'late');
  const ageMinutes: number | null =
    nowTick === 0
      ? null
      : Math.max(
          0,
          Math.round(
            ((nowTick - new Date(order.confirmedAt).getTime()) / 60_000) * 10,
          ) / 10,
        );

  return (
    <div
      className={`flex flex-col rounded-xl border bg-white shadow-sm ${
        anyLate
          ? 'border-[#D9534F]'
          : allReady
            ? 'border-[#27845A]'
            : 'border-[#E5E9E5]'
      }`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-[#E5E9E5] p-3.5">
        <div>
          <div className="text-lg font-bold text-[#252B28]">{order.tableLabel}</div>
          <div className="text-xs text-[#737B75]">
            {fa(order.items.filter((i) => i.status !== 'cancelled').length)} آیتم
            {ageMinutes !== null && ` ـ ${fa1(ageMinutes)} دقیقه پیش`}
          </div>
        </div>
        <div className="text-end">
          <StatusPill status={order.status} allReady={allReady} />
          {order.estimatedReadyAt && (
            <div className="mt-1 text-[11px] text-[#737B75]">
              تخمین:{' '}
              {new Date(order.estimatedReadyAt).toLocaleTimeString('fa-IR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Tehran',
              })}
            </div>
          )}
        </div>
      </header>

      <ul className="flex-1 divide-y divide-[#E5E9E5]">
        {order.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            busy={!!busyItems[item.id]}
            onStart={() => onStart(item.id)}
            onReady={() => onReady(item.id)}
            onCancel={() => onCancel(item.id, item.name)}
          />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item row
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  busy,
  onStart,
  onReady,
  onCancel,
}: {
  item: KitchenItemPayload;
  busy: boolean;
  onStart: () => void;
  onReady: () => void;
  onCancel: () => void;
}) {
  const elapsedMinutes: number | null = item.elapsedMinutes;
  const overBy: number | null = item.overBy;
  const urgency: 'fresh' | 'due' | 'late' | null = item.urgency;

  const terminal = item.status === 'ready' || item.status === 'cancelled';

  return (
    <li className="flex items-start gap-3 p-3.5">
      <div
        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${urgencyDot(urgency, item.status)}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-base font-bold tabular-nums text-[#252B28]">
            {fa(item.quantity)} عدد
          </span>
          <span className="truncate text-[#252B28]">{item.name}</span>
          <span className="rounded-md bg-[#F7F5EF] px-1.5 py-0.5 text-[10px] font-medium text-[#737B75]">
            {prepGroupLabel(item.prepGroup)}
          </span>
        </div>

        {item.specialInstructions && (
          <div className="mt-1.5 rounded-lg border border-[#C87952]/30 bg-[#C87952]/10 px-2.5 py-1.5 text-xs leading-6 font-medium text-[#252B28]">
            توضیح: {item.specialInstructions}
          </div>
        )}

        <div className="mt-1 text-[11px] leading-5 text-[#737B75]">
          {item.status === 'pending' && elapsedMinutes !== null && (
            <>
              در انتظار {fa1(elapsedMinutes)} دقیقه ـ زمان آماده‌سازی{' '}
              {fa(item.prepTimeMinutes)} دقیقه
            </>
          )}
          {item.status === 'preparing' && elapsedMinutes !== null && (
            <>
              در حال آماده‌سازی {fa1(elapsedMinutes)} از {fa(item.prepTimeMinutes)} دقیقه
              {overBy !== null && overBy > 0 && (
                <span className="ms-1 font-medium text-[#D9534F]">
                  ({fa1(overBy)} دقیقه تأخیر)
                </span>
              )}
            </>
          )}
          {item.status === 'ready' && (
            <span className="font-medium text-[#27845A]">آماده</span>
          )}
          {item.status === 'cancelled' && (
            <span className="font-medium text-[#D9534F]">لغو شده</span>
          )}
        </div>
      </div>

      {!terminal && (
        <div className="flex shrink-0 flex-col gap-1.5">
          {item.status === 'pending' && (
            <button
              type="button"
              onClick={onStart}
              disabled={busy}
              className="rounded-lg bg-[#D99A32] px-3.5 py-1.5 text-xs font-semibold text-[#252B28] transition-colors duration-150 hover:bg-[#C98B28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D99A32] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? '…' : 'شروع'}
            </button>
          )}
          {item.status === 'preparing' && (
            <button
              type="button"
              onClick={onReady}
              disabled={busy}
              className="rounded-lg bg-[#27845A] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#1F6E4A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27845A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? '…' : 'آماده شد'}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[#E5E9E5] bg-white px-3.5 py-1 text-[11px] text-[#737B75] transition-colors duration-150 hover:border-[#D9534F] hover:text-[#D9534F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            لغو
          </button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'amber' | 'emerald' | 'rose';
}) {
  const dotClass: Record<string, string> = {
    neutral: 'bg-[#737B75]',
    amber: 'bg-[#D99A32]',
    emerald: 'bg-[#27845A]',
    rose: 'bg-[#D9534F]',
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotClass[tone]}`} aria-hidden="true" />
      <span className="text-lg font-bold tabular-nums text-[#252B28]">{fa(value)}</span>
      <span className="text-xs text-[#737B75]">{label}</span>
    </div>
  );
}

function StatusPill({
  status,
  allReady,
}: {
  status: string;
  allReady: boolean;
}) {
  const key = allReady ? 'ready' : status;
  const cls = allReady
    ? 'border-[#27845A]/30 bg-[#27845A]/10 text-[#27845A]'
    : status === 'preparing'
      ? 'border-[#D99A32]/40 bg-[#D99A32]/10 text-[#252B28]'
      : 'border-[#E5E9E5] bg-[#F8F9F6] text-[#737B75]';
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {orderStatusLabel[key] ?? key}
    </span>
  );
}

function urgencyDot(
  urgency: 'fresh' | 'due' | 'late' | null,
  status: KitchenItemPayload['status'],
): string {
  if (status === 'ready') return 'bg-[#27845A]';
  if (status === 'cancelled') return 'bg-[#D9534F]';
  if (urgency === 'late') return 'bg-[#D9534F] animate-pulse motion-reduce:animate-none';
  if (urgency === 'due') return 'bg-[#D99A32]';
  return 'bg-[#27845A]';
}

function prepGroupLabel(group: string): string {
  const labels: Record<string, string> = {
    grill: 'گریل',
    fryer: 'سرخ‌کن',
    stew_rice: 'خورش و برنج',
    cold: 'سرد',
    beverage: 'نوشیدنی',
    other: 'سایر',
  };
  return labels[group] ?? group;
}
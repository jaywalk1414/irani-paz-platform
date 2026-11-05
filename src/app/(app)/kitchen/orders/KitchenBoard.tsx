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
        setError(result.error ?? 'Action failed.');
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
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Stat label="Orders" value={totals.orders} />
          <Stat label="Pending" value={totals.pending} tone="neutral" />
          <Stat label="Preparing" value={totals.preparing} tone="amber" />
          <Stat label="Ready" value={totals.ready} tone="emerald" />
          {totals.late > 0 && <Stat label="Late" value={totals.late} tone="rose" />}
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>
            Updated{' '}
            {lastUpdated
              ? lastUpdated.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '—'}
          </span>
          <button
            onClick={refreshNow}
            className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-xs underline opacity-70"
          >
            dismiss
          </button>
        </div>
      )}

      {orders.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-12 text-center text-sm text-zinc-500">
          No active orders. They will appear here as waiters submit them.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
            <div>
              <div className="text-sm font-semibold">Cancel item</div>
              <div className="text-xs text-zinc-400">{cancelTarget.name}</div>
            </div>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional) — e.g. out of stock, customer changed mind"
              rows={3}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason('');
                }}
                className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
              >
                Keep
              </button>
              <button
                onClick={submitCancel}
                className="rounded bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500"
              >
                Cancel item
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
      className={`flex flex-col rounded-lg border bg-zinc-900 shadow-sm ${
        anyLate
          ? 'border-rose-700'
          : allReady
            ? 'border-emerald-700'
            : 'border-zinc-800'
      }`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-zinc-800 p-3">
        <div>
          <div className="text-lg font-semibold">{order.tableLabel}</div>
          <div className="text-xs text-zinc-400">
            Order · {order.items.filter((i) => i.status !== 'cancelled').length} item
            {order.items.length === 1 ? '' : 's'}
            {ageMinutes !== null && ` · ${ageMinutes.toFixed(1)} min ago`}
          </div>
        </div>
        <div className="text-right">
          <StatusPill status={order.status} allReady={allReady} />
          {order.estimatedReadyAt && (
            <div className="mt-1 text-[11px] text-zinc-400">
              Est. {new Date(order.estimatedReadyAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
        </div>
      </header>

      <ul className="flex-1 divide-y divide-zinc-800">
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
    <li className="flex items-start gap-3 p-3">
      <div
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${urgencyDot(urgency, item.status)}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-base font-medium tabular-nums">{item.quantity}×</span>
          <span className="truncate">{item.name}</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
            {prepGroupLabel(item.prepGroup)}
          </span>
        </div>

        {item.specialInstructions && (
          <div className="mt-1 rounded border border-amber-700/40 bg-amber-900/20 px-2 py-1 text-xs text-amber-200">
            Note: {item.specialInstructions}
          </div>
        )}

        <div className="mt-1 text-[11px] text-zinc-400">
          {item.status === 'pending' && elapsedMinutes !== null && (
            <>Waiting {elapsedMinutes.toFixed(1)} min · prep {item.prepTimeMinutes} min</>
          )}
          {item.status === 'preparing' && elapsedMinutes !== null && (
            <>
              Preparing {elapsedMinutes.toFixed(1)} / {item.prepTimeMinutes} min
              {overBy !== null && overBy > 0 && (
                <span className="ml-1 text-rose-300">(+{overBy.toFixed(1)} over)</span>
              )}
            </>
          )}
          {item.status === 'ready' && <span className="text-emerald-400">Ready</span>}
          {item.status === 'cancelled' && (
            <span className="text-rose-400">Cancelled</span>
          )}
        </div>
      </div>

      {!terminal && (
        <div className="flex shrink-0 flex-col gap-1">
          {item.status === 'pending' && (
            <button
              onClick={onStart}
              disabled={busy}
              className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {busy ? '…' : 'Start'}
            </button>
          )}
          {item.status === 'preparing' && (
            <button
              onClick={onReady}
              disabled={busy}
              className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? '…' : 'Ready'}
            </button>
          )}
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-zinc-700 px-3 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-rose-300 disabled:opacity-50"
          >
            Cancel
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
  const toneClass: Record<string, string> = {
    neutral: 'text-zinc-200',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
  };
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-lg font-semibold tabular-nums ${toneClass[tone]}`}>
        {value}
      </span>
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
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
  const label = allReady ? 'ready' : status;
  const cls = allReady
    ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
    : status === 'preparing'
      ? 'bg-amber-900/40 text-amber-300 border-amber-700'
      : 'bg-zinc-800 text-zinc-300 border-zinc-700';
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function urgencyDot(
  urgency: 'fresh' | 'due' | 'late' | null,
  status: KitchenItemPayload['status'],
): string {
  if (status === 'ready') return 'bg-emerald-400';
  if (status === 'cancelled') return 'bg-rose-400';
  if (urgency === 'late') return 'bg-rose-400 animate-pulse';
  if (urgency === 'due') return 'bg-amber-400';
  return 'bg-emerald-400';
}

function prepGroupLabel(group: string): string {
  const labels: Record<string, string> = {
    grill: 'Grill',
    fryer: 'Fryer',
    stew_rice: 'Stew & Rice',
    cold: 'Cold',
    beverage: 'Beverage',
    other: 'Other',
  };
  return labels[group] ?? group;
}
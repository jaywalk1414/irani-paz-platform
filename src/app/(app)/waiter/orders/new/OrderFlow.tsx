'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  MenuItemAvailability,
} from '@/lib/services/availability.service';
import type { OrderView } from '@/lib/services/order.service';
import {
  submitOrderAction,
  previewEstimateAction,
} from '../actions';

type TableLite = { id: string; label: string; seats: number; status: string };
type Step = 'table' | 'menu' | 'review';

interface CartLine {
  menuItemId: string;
  quantity: number;
  specialInstructions: string;
}

type AvailabilityMap = Record<string, number>;

interface Props {
  menu: MenuItemAvailability[];
  tables: TableLite[];
  initialTableId: string | null;
  initialExistingOrder: OrderView | null;
}

export function OrderFlow({
  menu,
  tables,
  initialTableId,
  initialExistingOrder,
}: Props) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(initialTableId ? 'menu' : 'table');
  const [tableId, setTableId] = useState<string | null>(initialTableId);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [availability, setAvailability] = useState<AvailabilityMap>(() =>
    Object.fromEntries(menu.map((m) => [m.menuItemId, m.availableQuantity])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewReadyAt, setPreviewReadyAt] = useState<string | null>(null);

  // Idempotency key for THIS submission attempt. Reused on retry after an
  // InsufficientAvailabilityError so the server dedupes cleanly.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const menuById = useMemo(
    () => new Map(menu.map((m) => [m.menuItemId, m])),
    [menu],
  );

  const table = tables.find((t) => t.id === tableId) ?? null;

  const totalToman = cart.reduce((sum, l) => {
    const item = menuById.get(l.menuItemId);
    return sum + (item ? item.priceToman * l.quantity : 0);
  }, 0);

  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  const blockedLines = cart.filter(
    (l) => l.quantity > (availability[l.menuItemId] ?? 0),
  );

  // Poll availability every 6s while on the menu/review step.
  useEffect(() => {
    if (step === 'table') return;
    const tick = async () => {
      try {
        const res = await fetch('/api/waiter/availability', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: { menuItemId: string; availableQuantity: number }[];
        };
        setAvailability((prev) => {
          const next = { ...prev };
          for (const it of data.items) next[it.menuItemId] = it.availableQuantity;
          return next;
        });
      } catch {
        /* transient network error — keep the last known values */
      }
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [step]);

  // Refresh the readiness estimate when entering review, or when cart changes there.
  useEffect(() => {
    if (step !== 'review' || !tableId || cart.length === 0) return;
    let cancelled = false;
    previewEstimateAction(
      tableId,
      cart.map((l) => ({
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        specialInstructions: l.specialInstructions || null,
      })),
    ).then((r) => {
      if (cancelled) return;
      if (r.ok) setPreviewReadyAt(r.estimatedReadyAt);
      else setPreviewReadyAt(null);
    });
    return () => {
      cancelled = true;
    };
  }, [step, cart, tableId]);

  // ---- cart helpers ----

  function addOne(menuItemId: string) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === menuItemId);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { menuItemId, quantity: 1, specialInstructions: '' }];
    });
  }

  function removeOne(menuItemId: string) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === menuItemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter((l) => l.menuItemId !== menuItemId);
      }
      return prev.map((l) =>
        l.menuItemId === menuItemId ? { ...l, quantity: l.quantity - 1 } : l,
      );
    });
  }

  function setInstructions(menuItemId: string, text: string) {
    setCart((prev) =>
      prev.map((l) =>
        l.menuItemId === menuItemId ? { ...l, specialInstructions: text } : l,
      ),
    );
  }

  function selectTable(id: string) {
    setTableId(id);
    setStep('menu');
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  async function submit() {
    if (!tableId || cart.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await submitOrderAction({
      idempotencyKey: idempotencyKeyRef.current,
      tableId,
      items: cart.map((l) => ({
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        specialInstructions: l.specialInstructions || null,
      })),
    });

    if (!result.ok) {
      setSubmitError(result.error);
      setSubmitting(false);
      // Force a fresh availability poll so the UI reflects the rejection.
      try {
        const r = await fetch('/api/waiter/availability', { cache: 'no-store' });
        if (r.ok) {
          const d = (await r.json()) as {
            items: { menuItemId: string; availableQuantity: number }[];
          };
          setAvailability(
            Object.fromEntries(d.items.map((i) => [i.menuItemId, i.availableQuantity])),
          );
        }
      } catch {
        /* ignore */
      }
      return;
    }

    router.push(`/waiter/orders/${result.orderId}`);
  }

  // ---- render ----

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {/* Sticky header — table context always visible */}
      <div className="sticky top-14 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            {step !== 'table' && (
              <button
                onClick={() => setStep(step === 'review' ? 'menu' : 'table')}
                className="text-sm text-zinc-600 hover:text-zinc-900"
              >
                ← Back
              </button>
            )}
            <div>
              <div className="text-xs text-zinc-500">
                {step === 'table' && 'Step 1 of 3'}
                {step === 'menu' && 'Step 2 of 3'}
                {step === 'review' && 'Step 3 of 3'}
              </div>
              <div className="text-sm font-semibold">
                {table ? `${table.label} · Ordering` : 'Select a table'}
                {initialExistingOrder && step !== 'table' && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    Adding to existing
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-28">
        {step === 'table' && (
          <TablePicker tables={tables} onSelect={selectTable} />
        )}

        {step === 'menu' && (
          <MenuStep
            menu={menu}
            cart={cart}
            availability={availability}
            existingOrder={initialExistingOrder}
            onAdd={addOne}
            onRemove={removeOne}
            onInstructions={setInstructions}
          />
        )}

        {step === 'review' && (
          <ReviewStep
            cart={cart}
            menuById={menuById}
            existingOrder={initialExistingOrder}
            previewReadyAt={previewReadyAt}
            blockedLines={blockedLines}
            submitError={submitError}
            onEditInstructions={setInstructions}
          />
        )}
      </div>

      {/* Sticky footer — total + CTA */}
      {step !== 'table' && (
        <div className="sticky bottom-0 z-30 border-t bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-xs text-zinc-500">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </div>
              <div className="text-base font-semibold">
                {totalToman.toLocaleString('fa-IR')} toman
              </div>
            </div>

            {step === 'menu' && (
              <button
                onClick={() => setStep('review')}
                disabled={cart.length === 0}
                className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:bg-zinc-300"
              >
                Review order →
              </button>
            )}

            {step === 'review' && (
              <button
                onClick={submit}
                disabled={submitting || cart.length === 0 || blockedLines.length > 0}
                className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:bg-zinc-300"
              >
                {submitting ? 'Submitting…' : 'Confirm order'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: table picker
// ---------------------------------------------------------------------------

function TablePicker({
  tables,
  onSelect,
}: {
  tables: TableLite[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {tables.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="flex flex-col items-start gap-1 rounded-lg border bg-white p-3 text-left shadow-sm transition hover:shadow-md"
        >
          <span className="text-lg font-semibold">{t.label}</span>
          <span className="text-xs text-zinc-500">{t.seats} seats</span>
          <span className="text-[11px] text-zinc-400">
            {t.status === 'available' ? 'Available' : t.status}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: menu
// ---------------------------------------------------------------------------

function MenuStep({
  menu,
  cart,
  availability,
  existingOrder,
  onAdd,
  onRemove,
  onInstructions,
}: {
  menu: MenuItemAvailability[];
  cart: CartLine[];
  availability: AvailabilityMap;
  existingOrder: OrderView | null;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onInstructions: (id: string, text: string) => void;
}) {
  const cartById = Object.fromEntries(cart.map((l) => [l.menuItemId, l]));

  // Group items by prep group for scanning
  const byGroup = menu.reduce<Record<string, MenuItemAvailability[]>>((acc, m) => {
    (acc[m.prepGroup] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {existingOrder && existingOrder.items.length > 0 && (
        <details className="rounded-lg border bg-amber-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-amber-800">
            Existing items on {existingOrder.tableLabel} ({existingOrder.items.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {existingOrder.items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>
                  {i.quantity}× {i.name} <span className="opacity-60">({i.status})</span>
                </span>
                <span>{(i.unitPriceToman * i.quantity).toLocaleString('fa-IR')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {Object.entries(byGroup).map(([group, items]) => (
        <section key={group} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {prepGroupLabel(group)}
          </h2>
          <ul className="space-y-2">
            {items.map((m) => {
              const avail = availability[m.menuItemId] ?? m.availableQuantity;
              const line = cartById[m.menuItemId];
              const unavailable = avail <= 0;
              const insufficient = !!line && line.quantity > avail;

              return (
                <li
                  key={m.menuItemId}
                  className={`rounded-lg border bg-white p-3 shadow-sm ${
                    line ? 'ring-2 ring-black/5' : ''
                  } ${unavailable && !line ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        {unavailable && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                            Unavailable
                          </span>
                        )}
                        {insufficient && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            Only {avail} left
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                          {m.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                        <span>{m.priceToman.toLocaleString('fa-IR')} toman</span>
                        <span>· {m.prepTimeMinutes} min</span>
                        <span>· {avail} available</span>
                      </div>
                    </div>

                    <QuantityStepper
                      value={line?.quantity ?? 0}
                      disabled={unavailable && !line}
                      onAdd={() => onAdd(m.menuItemId)}
                      onRemove={() => onRemove(m.menuItemId)}
                    />
                  </div>

                  {line && (
                    <input
                      type="text"
                      value={line.specialInstructions}
                      onChange={(e) => onInstructions(m.menuItemId, e.target.value)}
                      placeholder="Special instructions (optional)"
                      className="mt-2 w-full rounded border px-2 py-1.5 text-xs"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function QuantityStepper({
  value,
  disabled,
  onAdd,
  onRemove,
}: {
  value: number;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  if (value === 0) {
    return (
      <button
        onClick={onAdd}
        disabled={disabled}
        className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center rounded-md border">
      <button
        onClick={onRemove}
        className="px-3 py-1.5 text-base leading-none hover:bg-zinc-50"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-medium tabular-nums">{value}</span>
      <button
        onClick={onAdd}
        className="px-3 py-1.5 text-base leading-none hover:bg-zinc-50"
      >
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: review
// ---------------------------------------------------------------------------

function ReviewStep({
  cart,
  menuById,
  existingOrder,
  previewReadyAt,
  blockedLines,
  submitError,
  onEditInstructions,
}: {
  cart: CartLine[];
  menuById: Map<string, MenuItemAvailability>;
  existingOrder: OrderView | null;
  previewReadyAt: string | null;
  blockedLines: CartLine[];
  submitError: string | null;
  onEditInstructions: (id: string, text: string) => void;
}) {
  const existingTotal = existingOrder?.totalToman ?? 0;
  const newTotal = cart.reduce(
    (s, l) => s + (menuById.get(l.menuItemId)?.priceToman ?? 0) * l.quantity,
    0,
  );

  return (
    <div className="space-y-6">
      {previewReadyAt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span className="font-medium">Estimated ready</span> at{' '}
          {formatTime(previewReadyAt)} ({minutesFromNow(previewReadyAt)} min from now)
        </div>
      )}

      {blockedLines.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">Some items are no longer available:</div>
          <ul className="mt-1 list-disc pl-5">
            {blockedLines.map((l) => (
              <li key={l.menuItemId}>
                {menuById.get(l.menuItemId)?.name} — only{' '}
                {menuById.get(l.menuItemId) ? 'fewer' : '0'} left. Reduce quantity
                or remove to continue.
              </li>
            ))}
          </ul>
        </div>
      )}

      {submitError && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {submitError}
        </div>
      )}

      {existingOrder && existingOrder.items.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Already on order
          </h2>
          <ul className="space-y-1.5 rounded-lg border bg-zinc-50 p-3 text-sm">
            {existingOrder.items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>
                  {i.quantity}× {i.name}{' '}
                  <span className="text-xs text-zinc-500">({i.status})</span>
                </span>
                <span className="tabular-nums text-zinc-600">
                  {(i.unitPriceToman * i.quantity).toLocaleString('fa-IR')}
                </span>
              </li>
            ))}
            <li className="flex justify-between border-t pt-1.5 text-zinc-600">
              <span>Subtotal (existing)</span>
              <span className="tabular-nums">{existingTotal.toLocaleString('fa-IR')}</span>
            </li>
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          New items
        </h2>
        <ul className="space-y-3">
          {cart.map((line) => {
            const item = menuById.get(line.menuItemId);
            if (!item) return null;
            return (
              <li key={line.menuItemId} className="rounded-lg border bg-white p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    {line.quantity}× {item.name}
                  </span>
                  <span className="tabular-nums">
                    {(item.priceToman * line.quantity).toLocaleString('fa-IR')}
                  </span>
                </div>
                <input
                  type="text"
                  value={line.specialInstructions}
                  onChange={(e) => onEditInstructions(line.menuItemId, e.target.value)}
                  placeholder="Special instructions"
                  className="mt-2 w-full rounded border px-2 py-1 text-xs"
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex justify-between rounded-lg border-t-2 border-zinc-900 pt-2 text-sm font-semibold">
          <span>Subtotal (new)</span>
          <span className="tabular-nums">{newTotal.toLocaleString('fa-IR')}</span>
        </div>
        {existingOrder && (
          <div className="mt-1 flex justify-between text-sm text-zinc-600">
            <span>Order total after submit</span>
            <span className="tabular-nums">
              {(existingTotal + newTotal).toLocaleString('fa-IR')}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function prepGroupLabel(group: string): string {
  const labels: Record<string, string> = {
    grill: 'Grill',
    fryer: 'Fryer',
    stew_rice: 'Stews & Rice',
    cold: 'Cold',
    beverage: 'Beverages',
    other: 'Other',
  };
  return labels[group] ?? group;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function minutesFromNow(iso: string): number {
  const diff = (new Date(iso).getTime() - Date.now()) / 60_000;
  return Math.max(0, Math.round(diff));
}
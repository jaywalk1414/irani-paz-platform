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

const fa = (n: number) => n.toLocaleString('fa-IR');

const tableStatusLabel: Record<string, string> = {
  available: 'آزاد',
  occupied: 'اشغال',
  reserved: 'رزرو شده',
};

const itemStatusLabel: Record<string, string> = {
  pending: 'در انتظار',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده',
  served: 'سرو شده',
  cancelled: 'لغو شده',
};

const inputClass =
  'block w-full rounded-lg border border-[#E5E9E5] bg-white px-3 py-2 text-xs text-[#252B28] ' +
  'placeholder:text-[#737B75]/70 transition-colors duration-150 hover:border-[#737B75]/50 ' +
  'focus:border-[#234B3B] focus:outline-none focus:ring-2 focus:ring-[#234B3B]/20';

const primaryBtn =
  'rounded-lg bg-[#234B3B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm ' +
  'transition-colors duration-150 hover:bg-[#193A2D] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B] focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:bg-[#E5E9E5] disabled:text-[#737B75] disabled:shadow-none';

const sectionTitle = 'mb-2 text-xs font-semibold text-[#737B75]';

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
      <div className="sticky top-14 z-30 border-b border-[#E5E9E5] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            {step !== 'table' && (
              <button
                type="button"
                onClick={() => setStep(step === 'review' ? 'menu' : 'table')}
                className="rounded-lg px-2 py-1 text-sm text-[#737B75] transition-colors duration-150 hover:bg-[#F7F5EF] hover:text-[#252B28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
              >
                → بازگشت
              </button>
            )}
            <div>
              <div className="text-xs text-[#737B75]">
                {step === 'table' && 'مرحله ۱ از ۳'}
                {step === 'menu' && 'مرحله ۲ از ۳'}
                {step === 'review' && 'مرحله ۳ از ۳'}
              </div>
              <div className="text-sm font-semibold text-[#252B28]">
                {table ? `میز ${table.label} ـ ثبت سفارش` : 'انتخاب میز'}
                {initialExistingOrder && step !== 'table' && (
                  <span className="ms-2 rounded-md bg-[#D99A32]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#252B28]">
                    افزودن به سفارش فعلی
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
        <div className="sticky bottom-0 z-30 border-t border-[#E5E9E5] bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-xs text-[#737B75]">{fa(itemCount)} آیتم</div>
              <div className="text-base font-bold text-[#252B28]">
                {fa(totalToman)} تومان
              </div>
            </div>

            {step === 'menu' && (
              <button
                type="button"
                onClick={() => setStep('review')}
                disabled={cart.length === 0}
                className={primaryBtn}
              >
                بررسی سفارش ←
              </button>
            )}

            {step === 'review' && (
              <button
                type="button"
                onClick={submit}
                disabled={submitting || cart.length === 0 || blockedLines.length > 0}
                className={primaryBtn}
              >
                {submitting ? 'در حال ثبت…' : 'تأیید و ثبت سفارش'}
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
          type="button"
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="flex flex-col items-start gap-1 rounded-xl border border-[#E5E9E5] bg-white p-3.5 text-start shadow-sm transition-shadow duration-150 hover:border-[#234B3B]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/50"
        >
          <span className="text-lg font-bold text-[#252B28]">{t.label}</span>
          <span className="text-xs text-[#737B75]">{fa(t.seats)} صندلی</span>
          <span
            className={`text-[11px] font-medium ${
              t.status === 'available' ? 'text-[#27845A]' : 'text-[#737B75]'
            }`}
          >
            {tableStatusLabel[t.status] ?? t.status}
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
        <details className="rounded-xl border border-[#D99A32]/40 bg-[#D99A32]/10 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-[#252B28]">
            آیتم‌های قبلی میز {existingOrder.tableLabel} ({fa(existingOrder.items.length)})
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs text-[#252B28]">
            {existingOrder.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>
                  {fa(i.quantity)} عدد {i.name}{' '}
                  <span className="text-[#737B75]">
                    ({itemStatusLabel[i.status] ?? i.status})
                  </span>
                </span>
                <span className="tabular-nums">{fa(i.unitPriceToman * i.quantity)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {Object.entries(byGroup).map(([group, items]) => (
        <section key={group} className="space-y-2">
          <h2 className="text-xs font-semibold text-[#737B75]">
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
                  className={`rounded-xl border bg-white p-3.5 shadow-sm ${
                    line ? 'border-[#234B3B]/50 ring-1 ring-[#234B3B]/20' : 'border-[#E5E9E5]'
                  } ${unavailable && !line ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[#252B28]">{m.name}</span>
                        {unavailable && (
                          <span className="rounded-md bg-[#D9534F]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#D9534F]">
                            ناموجود
                          </span>
                        )}
                        {insufficient && (
                          <span className="rounded-md bg-[#D99A32]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#252B28]">
                            فقط {fa(avail)} عدد مانده
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-6 text-[#737B75]">
                          {m.description}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#737B75]">
                        <span>{fa(m.priceToman)} تومان</span>
                        <span>{fa(m.prepTimeMinutes)} دقیقه</span>
                        <span>{fa(avail)} موجود</span>
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
                      placeholder="توضیحات ویژه (اختیاری)"
                      aria-label={`توضیحات ویژه برای ${m.name}`}
                      className={`${inputClass} mt-2.5`}
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
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="shrink-0 rounded-lg border border-[#234B3B] bg-white px-3.5 py-1.5 text-sm font-medium text-[#234B3B] transition-colors duration-150 hover:bg-[#234B3B] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40 disabled:cursor-not-allowed disabled:border-[#E5E9E5] disabled:text-[#737B75] disabled:hover:bg-white disabled:hover:text-[#737B75]"
      >
        افزودن
      </button>
    );
  }
  return (
    // dir="ltr" keeps − on the left and + on the right, as users expect
    <div
      dir="ltr"
      className="flex shrink-0 items-center overflow-hidden rounded-lg border border-[#E5E9E5]"
    >
      <button
        type="button"
        onClick={onRemove}
        aria-label="کم کردن"
        className="px-3 py-1.5 text-base leading-none text-[#252B28] transition-colors duration-150 hover:bg-[#F7F5EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#234B3B]/40"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums text-[#252B28]">
        {fa(value)}
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label="افزودن"
        className="px-3 py-1.5 text-base leading-none text-[#252B28] transition-colors duration-150 hover:bg-[#F7F5EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#234B3B]/40"
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
        <div className="rounded-xl border border-[#27845A]/30 bg-[#27845A]/10 p-3 text-sm text-[#252B28]">
          <span className="font-semibold text-[#27845A]">زمان تقریبی آماده شدن:</span>{' '}
          {formatTime(previewReadyAt)} ({fa(minutesFromNow(previewReadyAt))} دقیقه دیگر)
        </div>
      )}

      {blockedLines.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-[#D99A32]/50 bg-[#D99A32]/10 p-3 text-sm text-[#252B28]"
        >
          <div className="font-semibold">موجودی برخی آیتم‌ها کافی نیست:</div>
          <ul className="mt-1.5 list-disc space-y-1 ps-5 leading-6">
            {blockedLines.map((l) => (
              <li key={l.menuItemId}>
                {menuById.get(l.menuItemId)?.name} ـ تعداد انتخاب‌شده از موجودی فعلی بیشتر
                است. تعداد را کم کنید یا آیتم را حذف کنید.
              </li>
            ))}
          </ul>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-[#D9534F]/30 bg-[#D9534F]/10 p-3 text-sm leading-6 text-[#D9534F]"
        >
          {submitError}
        </div>
      )}

      {existingOrder && existingOrder.items.length > 0 && (
        <section>
          <h2 className={sectionTitle}>قبلاً در سفارش ثبت شده</h2>
          <ul className="space-y-1.5 rounded-xl border border-[#E5E9E5] bg-[#F7F5EF] p-3.5 text-sm text-[#252B28]">
            {existingOrder.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>
                  {fa(i.quantity)} عدد {i.name}{' '}
                  <span className="text-xs text-[#737B75]">
                    ({itemStatusLabel[i.status] ?? i.status})
                  </span>
                </span>
                <span className="tabular-nums text-[#737B75]">
                  {fa(i.unitPriceToman * i.quantity)}
                </span>
              </li>
            ))}
            <li className="flex justify-between border-t border-[#E5E9E5] pt-2 text-[#737B75]">
              <span>جمع آیتم‌های قبلی</span>
              <span className="tabular-nums">{fa(existingTotal)}</span>
            </li>
          </ul>
        </section>
      )}

      <section>
        <h2 className={sectionTitle}>آیتم‌های جدید</h2>
        <ul className="space-y-3">
          {cart.map((line) => {
            const item = menuById.get(line.menuItemId);
            if (!item) return null;
            return (
              <li
                key={line.menuItemId}
                className="rounded-xl border border-[#E5E9E5] bg-white p-3.5 shadow-sm"
              >
                <div className="flex justify-between gap-3 text-sm text-[#252B28]">
                  <span className="font-medium">
                    {fa(line.quantity)} عدد {item.name}
                  </span>
                  <span className="tabular-nums">
                    {fa(item.priceToman * line.quantity)}
                  </span>
                </div>
                <input
                  type="text"
                  value={line.specialInstructions}
                  onChange={(e) => onEditInstructions(line.menuItemId, e.target.value)}
                  placeholder="توضیحات ویژه"
                  aria-label={`توضیحات ویژه برای ${item.name}`}
                  className={`${inputClass} mt-2.5`}
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex justify-between border-t-2 border-[#234B3B] pt-2.5 text-sm font-bold text-[#252B28]">
          <span>جمع آیتم‌های جدید</span>
          <span className="tabular-nums">{fa(newTotal)}</span>
        </div>
        {existingOrder && (
          <div className="mt-1.5 flex justify-between text-sm text-[#737B75]">
            <span>جمع کل سفارش پس از ثبت</span>
            <span className="tabular-nums">{fa(existingTotal + newTotal)}</span>
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
    grill: 'گریل',
    fryer: 'سرخ‌کن',
    stew_rice: 'خورش و برنج',
    cold: 'سرد',
    beverage: 'نوشیدنی',
    other: 'سایر',
  };
  return labels[group] ?? group;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tehran',
  });
}

function minutesFromNow(iso: string): number {
  const diff = (new Date(iso).getTime() - Date.now()) / 60_000;
  return Math.max(0, Math.round(diff));
}
"use client";

import { useActionState, useState } from "react";
import type { MenuItemAvailability } from "@/lib/services/availability.service";
import {
  adjustAvailabilityAction,
  type AdjustAvailabilityState,
} from "./actions";

const fa = (n: number) => n.toLocaleString("fa-IR");

const fieldClass =
  "mt-1.5 block w-full rounded-lg border border-[#E5E9E5] bg-white px-3 py-2 text-sm text-[#252B28] " +
  "placeholder:text-[#737B75]/70 transition-colors duration-150 hover:border-[#737B75]/50 " +
  "focus:border-[#234B3B] focus:outline-none focus:ring-2 focus:ring-[#234B3B]/20";

export function AvailabilityBoard({
  items,
}: {
  items: MenuItemAvailability[];
}) {
  const [filter, setFilter] = useState("");

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="جستجوی آیتم…"
        aria-label="جستجوی آیتم"
        className="block w-full rounded-lg border border-[#E5E9E5] bg-white px-3.5 py-2.5 text-sm text-[#252B28] placeholder:text-[#737B75]/70 transition-colors duration-150 hover:border-[#737B75]/50 focus:border-[#234B3B] focus:outline-none focus:ring-2 focus:ring-[#234B3B]/20"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <ItemCard key={item.menuItemId} item={item} />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#E5E9E5] bg-white p-8 text-center text-sm text-[#737B75] sm:col-span-2 lg:col-span-3">
            آیتمی با این مشخصات پیدا نشد.
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: MenuItemAvailability }) {
  const [state, formAction, pending] = useActionState<
    AdjustAvailabilityState,
    FormData
  >(adjustAvailabilityAction, null);

  const [expanded, setExpanded] = useState(false);

  const available = state?.ok
    ? state.availableQuantity
    : item.availableQuantity;
  const configured = state?.ok
    ? state.configuredQuantity
    : item.configuredQuantity;

  return (
    <div className="rounded-xl border border-[#E5E9E5] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-[#252B28]">{item.name}</div>
          <div className="mt-0.5 text-xs text-[#737B75]">
            {fa(item.priceToman)} تومان ـ {fa(item.prepTimeMinutes)} دقیقه
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
            available === 0
              ? "border-[#D9534F]/30 bg-[#D9534F]/10 text-[#D9534F]"
              : available <= 3
                ? "border-[#D99A32]/40 bg-[#D99A32]/10 text-[#252B28]"
                : "border-[#27845A]/30 bg-[#27845A]/10 text-[#27845A]"
          }`}
        >
          {fa(available)} مانده
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-[#F8F9F6] py-2">
          <div className="font-semibold tabular-nums text-[#252B28]">
            {fa(configured)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#737B75]">سهمیه</div>
        </div>
        <div className="rounded-lg bg-[#F8F9F6] py-2">
          <div className="font-semibold tabular-nums text-[#252B28]">
            {fa(item.reservedQuantity)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#737B75]">رزرو</div>
        </div>
        <div className="rounded-lg bg-[#F8F9F6] py-2">
          <div className="font-semibold tabular-nums text-[#252B28]">
            {fa(available)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#737B75]">موجود</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-3 w-full rounded-lg border border-[#E5E9E5] bg-white px-2 py-2 text-xs font-medium text-[#252B28] transition-colors duration-150 hover:border-[#234B3B] hover:text-[#234B3B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
      >
        {expanded ? "انصراف" : "تغییر تعداد"}
      </button>

      {expanded && (
        <form
          action={formAction}
          className="mt-3 space-y-3 border-t border-[#E5E9E5] pt-3"
        >
          <input type="hidden" name="menuItemId" value={item.menuItemId} />

          <label className="block text-xs font-medium text-[#252B28]">
            تغییر (+ افزایش / − کاهش)
            <input
              name="deltaConfigured"
              type="number"
              dir="ltr"
              step={1}
              placeholder="-3"
              required
              className={`${fieldClass} text-end`}
            />
          </label>

          <label className="block text-xs font-medium text-[#252B28]">
            دلیل (اختیاری)
            <input
              name="reason"
              type="text"
              maxLength={500}
              placeholder="مثلاً تأخیر در گریل"
              className={fieldClass}
            />
          </label>

          {state && !state.ok && (
            <p
              role="alert"
              className="rounded-lg border border-[#D9534F]/30 bg-[#D9534F]/10 px-3 py-2 text-[11px] leading-6 text-[#D9534F]"
            >
              {state.error}
            </p>
          )}
          {state && state.ok && (
            <p
              role="status"
              className="rounded-lg border border-[#27845A]/30 bg-[#27845A]/10 px-3 py-2 text-[11px] leading-6 text-[#27845A]"
            >
              به‌روزرسانی شد: {fa(state.availableQuantity)} موجود،{" "}
              {fa(state.configuredQuantity)} سهمیه.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[#234B3B] px-2 py-2 text-xs font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#193A2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "در حال اعمال…" : "اعمال تغییر"}
          </button>
        </form>
      )}
    </div>
  );
}

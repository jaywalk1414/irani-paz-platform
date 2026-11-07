"use client";

import { useId, useState, useTransition } from "react";
import {
  createMenuItemAction,
  updateMenuItemAction,
  toggleMenuItemActiveAction,
} from "./actions";

export interface MenuRow {
  id: string;
  name: string;
  description: string | null;
  ingredientsText: string;
  priceToman: number;
  prepTimeMinutes: number;
  prepGroup: string;
  dailyQuantityDefault: number;
  isActive: boolean;
  todayConfigured: number | null;
  todayAvailable: number | null;
}

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; row: MenuRow };

const fa = (n: number) => n.toLocaleString("fa-IR");

const fieldClass =
  "mt-1.5 block w-full rounded-lg border border-[#E5E9E5] bg-white px-3 py-2 text-sm text-[#252B28] " +
  "placeholder:text-[#737B75]/70 transition-colors duration-150 hover:border-[#737B75]/50 " +
  "focus:border-[#234B3B] focus:outline-none focus:ring-2 focus:ring-[#234B3B]/20";

const numberFieldClass = `${fieldClass} text-end`;

const secondaryBtn =
  "rounded-lg border border-[#E5E9E5] bg-white px-3 py-1.5 text-xs font-medium text-[#252B28] " +
  "transition-colors duration-150 hover:border-[#234B3B] hover:text-[#234B3B] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function MenuTable({ rows }: { rows: MenuRow[] }) {
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[#737B75]">{fa(rows.length)} آیتم</span>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="rounded-lg bg-[#234B3B] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#193A2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B] focus-visible:ring-offset-2"
        >
          + آیتم جدید
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5E9E5] bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-[#E5E9E5] bg-[#F7F5EF] text-xs font-semibold text-[#737B75]">
            <tr>
              <th className="px-3 py-3 text-start">آیتم</th>
              <th className="px-3 py-3 text-start">قیمت (تومان)</th>
              <th className="px-3 py-3 text-start">آماده‌سازی</th>
              <th className="px-3 py-3 text-start">پیش‌فرض</th>
              <th className="px-3 py-3 text-start">امروز</th>
              <th className="px-3 py-3 text-start">وضعیت</th>
              <th className="px-3 py-3 text-end">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E9E5] text-[#252B28]">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`transition-colors duration-150 hover:bg-[#F8F9F6] ${
                  row.isActive ? "" : "opacity-60"
                }`}
              >
                <td className="px-3 py-3">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-[#737B75]">
                    {prepGroupLabel(row.prepGroup)}
                  </div>
                </td>
                <td className="px-3 py-3 tabular-nums">{fa(row.priceToman)}</td>
                <td className="px-3 py-3 tabular-nums">
                  {fa(row.prepTimeMinutes)} دقیقه
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {fa(row.dailyQuantityDefault)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {row.todayAvailable === null ? (
                    <span className="text-[#737B75]">—</span>
                  ) : (
                    <span
                      className={
                        row.todayAvailable === 0
                          ? "font-semibold text-[#D9534F]"
                          : row.todayAvailable <= 3
                            ? "font-semibold text-[#D99A32]"
                            : ""
                      }
                    >
                      {fa(row.todayAvailable)}
                      <span className="text-xs font-normal text-[#737B75]">
                        {" "}
                        از {fa(row.todayConfigured ?? 0)}
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                      row.isActive
                        ? "border-[#27845A]/30 bg-[#27845A]/10 text-[#27845A]"
                        : "border-[#E5E9E5] bg-[#F8F9F6] text-[#737B75]"
                    }`}
                  >
                    {row.isActive ? "فعال" : "غیرفعال"}
                  </span>
                </td>
                <td className="px-3 py-3 text-end">
                  <RowActions
                    row={row}
                    onEdit={() => setDialog({ mode: "edit", row })}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-[#737B75]"
                >
                  هنوز آیتمی ثبت نشده است. برای شروع، یک آیتم جدید بسازید.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog.mode !== "closed" && (
        <MenuItemDialog
          mode={dialog.mode}
          row={dialog.mode === "edit" ? dialog.row : undefined}
          onClose={() => setDialog({ mode: "closed" })}
        />
      )}
    </>
  );
}

function RowActions({ row, onEdit }: { row: MenuRow; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      const result = await toggleMenuItemActiveAction(row.id, !row.isActive);
      if (!result.ok) setError(result.error ?? "انجام نشد.");
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      {error && <span className="text-[11px] text-[#D9534F]">{error}</span>}
      <button type="button" onClick={onEdit} className={secondaryBtn}>
        ویرایش
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`${secondaryBtn} text-[#737B75]`}
      >
        {row.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
      </button>
    </div>
  );
}

function MenuItemDialog({
  mode,
  row,
  onClose,
}: {
  mode: "create" | "edit";
  row?: MenuRow;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  function handleSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      const action =
        mode === "create" ? createMenuItemAction : updateMenuItemAction;
      const result = await action(null, formData);
      if (result.ok) onClose();
      else setError(result.error ?? "انجام نشد.");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#252B28]/50 p-4 pt-12">
      <form
        action={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg space-y-4 rounded-xl border border-[#E5E9E5] bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-base font-bold text-[#252B28]">
            {mode === "create" ? "آیتم جدید منو" : "ویرایش آیتم منو"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="rounded-lg px-2 py-1 text-sm text-[#737B75] transition-colors duration-150 hover:bg-[#F7F5EF] hover:text-[#252B28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
          >
            ✕
          </button>
        </div>

        {row && <input type="hidden" name="id" value={row.id} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[#252B28] sm:col-span-2">
            نام
            <input
              name="name"
              defaultValue={row?.name ?? ""}
              required
              maxLength={120}
              className={fieldClass}
            />
          </label>

          <label className="block text-sm font-medium text-[#252B28] sm:col-span-2">
            توضیحات
            <textarea
              name="description"
              defaultValue={row?.description ?? ""}
              rows={2}
              maxLength={1000}
              className={fieldClass}
            />
          </label>

          <label className="block text-sm font-medium text-[#252B28] sm:col-span-2">
            مواد تشکیل‌دهنده (با ویرگول جدا کنید)
            <input
              name="ingredients"
              defaultValue={row?.ingredientsText ?? ""}
              placeholder="گوشت, زعفران, برنج"
              className={fieldClass}
            />
          </label>

          <label className="block text-sm font-medium text-[#252B28]">
            قیمت (تومان)
            <input
              name="priceToman"
              type="number"
              dir="ltr"
              min={0}
              step={1000}
              defaultValue={row?.priceToman ?? 0}
              required
              className={numberFieldClass}
            />
          </label>

          <label className="block text-sm font-medium text-[#252B28]">
            زمان آماده‌سازی (دقیقه)
            <input
              name="prepTimeMinutes"
              type="number"
              dir="ltr"
              min={1}
              defaultValue={row?.prepTimeMinutes ?? 10}
              required
              className={numberFieldClass}
            />
          </label>

          <label className="block text-sm font-medium text-[#252B28]">
            گروه آماده‌سازی
            <select
              name="prepGroup"
              defaultValue={row?.prepGroup ?? "other"}
              className={fieldClass}
            >
              <option value="grill">گریل</option>
              <option value="fryer">سرخ‌کن</option>
              <option value="stew_rice">خورش و برنج</option>
              <option value="cold">سرد</option>
              <option value="beverage">نوشیدنی</option>
              <option value="other">سایر</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-[#252B28]">
            تعداد پیش‌فرض روزانه
            <input
              name="dailyQuantityDefault"
              type="number"
              dir="ltr"
              min={0}
              defaultValue={row?.dailyQuantityDefault ?? 20}
              required
              className={numberFieldClass}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#252B28]">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={row?.isActive ?? true}
            className="h-4 w-4 rounded border-[#E5E9E5] accent-[#234B3B]"
          />
          فعال (قابل سفارش)
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[#D9534F]/30 bg-[#D9534F]/10 px-3 py-2 text-xs leading-6 text-[#D9534F]"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#E5E9E5] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E5E9E5] bg-white px-4 py-2 text-sm font-medium text-[#252B28] transition-colors duration-150 hover:bg-[#F7F5EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
          >
            انصراف
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#234B3B] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#193A2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </div>
      </form>
    </div>
  );
}

function prepGroupLabel(g: string): string {
  const map: Record<string, string> = {
    grill: "گریل",
    fryer: "سرخ‌کن",
    stew_rice: "خورش و برنج",
    cold: "سرد",
    beverage: "نوشیدنی",
    other: "سایر",
  };
  return map[g] ?? g;
}

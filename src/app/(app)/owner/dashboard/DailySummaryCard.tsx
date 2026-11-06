'use client';

import { useState, useTransition } from 'react';
import { generateSummaryAction } from './actions';

const toFaDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

function formatBusinessDate(d: string) {
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return toFaDigits(d);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

export function DailySummaryCard({
  initialSummary,
  businessDate,
}: {
  initialSummary: { content: string; model: string } | null;
  businessDate: string;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    start(async () => {
      const result = await generateSummaryAction();
      if (result.ok) setSummary({ content: result.content, model: result.model });
      else setError(result.error);
    });
  }

  return (
    <section
      aria-busy={pending}
      className="rounded-xl border border-[#E5E9E5] bg-[#F7F5EF] p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#252B28]">
          <span className="inline-flex items-center rounded-md bg-[#234B3B] px-2 py-0.5 text-[11px] font-medium text-white">
            هوش مصنوعی
          </span>
          خلاصه روزانه سرویس
        </h2>
        <div className="flex items-center gap-2 text-xs text-[#737B75]">
          {summary && (
            <span
              dir="ltr"
              className="rounded-md border border-[#E5E9E5] bg-white px-2 py-0.5 text-[11px]"
            >
              {summary.model}
            </span>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="rounded-lg border border-[#E5E9E5] bg-white px-3 py-1.5 text-xs font-medium text-[#252B28] transition-colors duration-150 hover:border-[#234B3B] hover:text-[#234B3B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'در حال تولید…' : summary ? 'تولید مجدد' : 'تولید خلاصه'}
          </button>
        </div>
      </div>

      {summary ? (
        <p className="text-sm leading-7 text-[#252B28]">{summary.content}</p>
      ) : (
        <p className="text-sm leading-7 text-[#737B75]">
          هنوز خلاصه‌ای برای {formatBusinessDate(businessDate)} ساخته نشده است. با تولید خلاصه،
          نمای کلی از سفارش‌ها، پرفروش‌ترین‌ها و شلوغ‌ترین بازه‌های امروز را دریافت کنید.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-[#D9534F]/30 bg-[#D9534F]/10 px-3 py-2 text-xs leading-6 text-[#D9534F]"
        >
          {error}
        </p>
      )}

      <p className="mt-3 text-[11px] leading-6 text-[#737B75]">
        فقط جنبه اطلاعاتی دارد؛ هرگز سفارش‌ها، قیمت‌ها یا موجودی را تغییر نمی‌دهد.
      </p>
    </section>
  );
}
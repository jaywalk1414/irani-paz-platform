import { requireRole } from '@/lib/auth/require';
import {
  getBusinessContext,
  listMenuWithAvailability,
} from '@/lib/services/availability.service';
import {
  aggregateDailyStats,
  getCachedSummary,
} from '@/lib/services/ai-summary.service';
import { listRecentAdjustments } from '@/lib/services/availability.service';
import { DailySummaryCard } from './DailySummaryCard';

export const dynamic = 'force-dynamic';

const fa = (n: number) => n.toLocaleString('fa-IR');
const toFaDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

function formatBusinessDate(d: string) {
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return toFaDigits(d);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

export default async function OwnerDashboardPage() {
  const user = await requireRole(['owner']);
  const ctx = await getBusinessContext(user.restaurantId);

  const [stats, cachedSummary, adjustments, menu] = await Promise.all([
    aggregateDailyStats(user.restaurantId, ctx.businessDate, ctx.timezone, ctx.cutoffHour),
    getCachedSummary(user.restaurantId, ctx.businessDate),
    listRecentAdjustments(user.restaurantId, 5),
    listMenuWithAvailability(user.restaurantId, ctx.businessDate),
  ]);

  const lowStock = menu.filter(
    (m) => m.isActive && m.availableQuantity > 0 && m.availableQuantity <= 3,
  );
  const soldOut = menu.filter((m) => m.isActive && m.availableQuantity === 0);
  const totalAvailable = menu.reduce((s, m) => s + m.availableQuantity, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-[#252B28]">امروز در یک نگاه</h1>
        <p className="text-sm leading-7 text-[#737B75]">
          روز کاری {formatBusinessDate(ctx.businessDate)} ـ پایان روز کاری ساعت{' '}
          {Number(ctx.cutoffHour).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}:۰۰ به وقت تهران
        </p>
      </div>

      {/* شاخص‌ها */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="سفارش‌ها" value={fa(stats.orderCount)} />
        <KPI label="درآمد" value={fa(stats.revenueToman)} suffix="تومان" />
        <KPI label="پرس‌های فروخته‌شده" value={fa(stats.itemCount)} />
        <KPI label="موجودی فعلی" value={fa(totalAvailable)} suffix="پرس" />
      </div>

      {/* خلاصه هوش مصنوعی */}
      <DailySummaryCard
        initialSummary={cachedSummary}
        businessDate={ctx.businessDate}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="پرفروش‌ترین‌های امروز">
          {stats.topItems.length === 0 ? (
            <Empty>هنوز سفارشی ثبت نشده است.</Empty>
          ) : (
            <ol className="space-y-1.5">
              {stats.topItems.map((it, i) => (
                <li
                  key={it.name}
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm text-[#252B28] odd:bg-[#F8F9F6]"
                >
                  <span>
                    <span className="me-2 inline-block w-5 text-xs text-[#737B75]">
                      {fa(i + 1)}.
                    </span>
                    {it.name}
                  </span>
                  <span className="font-semibold tabular-nums">{fa(it.qty)}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="شلوغ‌ترین بازه‌ها">
          {stats.busyRanges.length === 0 ? (
            <Empty>هنوز داده‌ای وجود ندارد.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {stats.busyRanges.map((b) => (
                <li
                  key={b.range}
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm text-[#252B28] odd:bg-[#F8F9F6]"
                >
                  <span dir="ltr" className="tabular-nums">
                    {toFaDigits(b.range)}
                  </span>
                  <span className="text-[#737B75]">{fa(b.orders)} سفارش</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="هشدارهای موجودی">
          {soldOut.length === 0 && lowStock.length === 0 ? (
            <Empty>موجودی همه اقلام کافی است.</Empty>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {soldOut.map((m) => (
                <li
                  key={m.menuItemId}
                  className="flex justify-between rounded-lg border-s-4 border-[#D9534F] bg-[#D9534F]/10 px-2.5 py-2 text-[#252B28]"
                >
                  <span>{m.name}</span>
                  <span className="font-semibold text-[#D9534F]">ناموجود</span>
                </li>
              ))}
              {lowStock.map((m) => (
                <li
                  key={m.menuItemId}
                  className="flex justify-between rounded-lg border-s-4 border-[#D99A32] bg-[#D99A32]/10 px-2.5 py-2 text-[#252B28]"
                >
                  <span>{m.name}</span>
                  <span className="font-semibold">{fa(m.availableQuantity)} پرس مانده</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="تغییرات اخیر">
          {adjustments.length === 0 ? (
            <Empty>امروز هنوز تعدیلی ثبت نشده است.</Empty>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {adjustments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-[#252B28] odd:bg-[#F8F9F6]"
                >
                  <span className="truncate">
                    {a.menuItemName}
                    {a.reason && (
                      <span className="ms-1 text-xs text-[#737B75]">ـ {a.reason}</span>
                    )}
                  </span>
                  <span
                    dir="ltr"
                    className={`shrink-0 font-semibold tabular-nums ${
                      a.deltaConfigured > 0 ? 'text-[#27845A]' : 'text-[#D9534F]'
                    }`}
                  >
                    {a.deltaConfigured > 0 ? '+' : a.deltaConfigured < 0 ? '−' : ''}
                    {fa(Math.abs(a.deltaConfigured))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E9E5] bg-white p-4 shadow-sm">
      <div className="text-xs text-[#737B75]">{label}</div>
      <div className="mt-1.5 text-xl font-bold tabular-nums text-[#252B28]">
        {value}
        {suffix && (
          <span className="ms-1.5 text-xs font-normal text-[#737B75]">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E5E9E5] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-[#252B28]">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-sm text-[#737B75]">{children}</div>;
}
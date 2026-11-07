import { and, eq, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/require";
import { db } from "@/lib/db/client";
import {
  availabilityAdjustments,
  dailyAvailability,
  menuItems,
  users,
} from "@/lib/db/schema";
import {
  getBusinessContext,
  listMenuWithAvailability,
} from "@/lib/services/availability.service";
import { AvailabilityBoard } from "./AvailabilityBoard";

const fa = (n: number) => n.toLocaleString("fa-IR");
const toFaDigits = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

function formatBusinessDate(d: string) {
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return toFaDigits(d);
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

export default async function OwnerAvailabilityPage() {
  const user = await requireRole(["owner"]);
  const ctx = await getBusinessContext(user.restaurantId);

  const menu = await listMenuWithAvailability(
    user.restaurantId,
    ctx.businessDate,
  );

  const adjustments = await db
    .select({
      id: availabilityAdjustments.id,
      createdAt: availabilityAdjustments.createdAt,
      menuItemName: menuItems.name,
      adjustedByName: users.fullName,
      deltaConfigured: availabilityAdjustments.deltaConfigured,
      previousConfigured: availabilityAdjustments.previousConfigured,
      newConfigured: availabilityAdjustments.newConfigured,
      reason: availabilityAdjustments.reason,
    })
    .from(availabilityAdjustments)
    .innerJoin(
      dailyAvailability,
      eq(dailyAvailability.id, availabilityAdjustments.dailyAvailabilityId),
    )
    .innerJoin(menuItems, eq(menuItems.id, dailyAvailability.menuItemId))
    .innerJoin(users, eq(users.id, availabilityAdjustments.adjustedByUserId))
    .where(eq(availabilityAdjustments.restaurantId, user.restaurantId))
    .orderBy(desc(availabilityAdjustments.createdAt))
    .limit(50);

  const whenFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ctx.timezone,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-[#252B28]">موجودی روزانه</h1>
        <p className="text-sm leading-7 text-[#737B75]">
          روز کاری{" "}
          <span className="font-medium text-[#252B28]">
            {formatBusinessDate(ctx.businessDate)}
          </span>{" "}
          ـ پایان روز کاری ساعت{" "}
          {Number(ctx.cutoffHour).toLocaleString("fa-IR", {
            minimumIntegerDigits: 2,
          })}
          :۰۰ به وقت تهران. تعدیل‌ها فقط برای امروز اعمال می‌شوند؛ موجودی فردا
          از مقدار پیش‌فرض هر آیتم ساخته می‌شود.
        </p>
      </div>

      <AvailabilityBoard items={menu} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#252B28]">
          تاریخچه تعدیل‌ها
        </h2>
        {adjustments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E5E9E5] bg-white p-8 text-center text-sm text-[#737B75]">
            هنوز تعدیلی ثبت نشده است.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E5E9E5] bg-white shadow-sm">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-[#E5E9E5] bg-[#F7F5EF] text-xs font-semibold text-[#737B75]">
                <tr>
                  <th className="px-3 py-3 text-start">زمان</th>
                  <th className="px-3 py-3 text-start">آیتم</th>
                  <th className="px-3 py-3 text-start">تغییر</th>
                  <th className="px-3 py-3 text-start">مقدار</th>
                  <th className="px-3 py-3 text-start">ثبت‌شده توسط</th>
                  <th className="px-3 py-3 text-start">دلیل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E9E5] text-[#252B28]">
                {adjustments.map((a) => (
                  <tr
                    key={a.id}
                    className="transition-colors duration-150 hover:bg-[#F8F9F6]"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-[#737B75]">
                      {whenFormatter.format(a.createdAt)}
                    </td>
                    <td className="px-3 py-3">{a.menuItemName}</td>
                    <td className="px-3 py-3">
                      <span
                        dir="ltr"
                        className={`inline-block font-semibold tabular-nums ${
                          a.deltaConfigured > 0
                            ? "text-[#27845A]"
                            : "text-[#D9534F]"
                        }`}
                      >
                        {a.deltaConfigured > 0
                          ? "+"
                          : a.deltaConfigured < 0
                            ? "−"
                            : ""}
                        {fa(Math.abs(a.deltaConfigured))}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs tabular-nums text-[#737B75]">
                      از {fa(a.previousConfigured)} به {fa(a.newConfigured)}
                    </td>
                    <td className="px-3 py-3 text-xs">{a.adjustedByName}</td>
                    <td className="px-3 py-3 text-xs text-[#737B75]">
                      {a.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

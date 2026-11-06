import { and, eq, desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import {
  availabilityAdjustments,
  dailyAvailability,
  menuItems,
  users,
} from '@/lib/db/schema';
import {
  getBusinessContext,
  listMenuWithAvailability,
} from '@/lib/services/availability.service';
import { AvailabilityBoard } from './AvailabilityBoard';


export default async function OwnerAvailabilityPage() {
  const user = await requireRole(['owner']);
  const ctx = await getBusinessContext(user.restaurantId);

  const menu = await listMenuWithAvailability(user.restaurantId, ctx.businessDate);

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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Daily availability</h1>
        <p className="text-sm text-zinc-500">
          Business day <span className="font-medium text-zinc-700">{ctx.businessDate}</span>
          {' '}· cutoff {String(ctx.cutoffHour).padStart(2, '0')}:00 Tehran. Adjustments apply to today only; tomorrow is seeded from each item&rsquo;s default.
        </p>
      </div>

      <AvailabilityBoard items={menu} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-700">Adjustment history</h2>
        {adjustments.length === 0 ? (
          <div className="rounded border border-dashed p-6 text-center text-sm text-zinc-500">
            No adjustments yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                  <th className="px-3 py-2 text-right">From → To</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                      {a.createdAt.toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2">{a.menuItemName}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        a.deltaConfigured > 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {a.deltaConfigured > 0 ? '+' : ''}
                      {a.deltaConfigured}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-600">
                      {a.previousConfigured} → {a.newConfigured}
                    </td>
                    <td className="px-3 py-2 text-xs">{a.adjustedByName}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {a.reason ?? <span className="text-zinc-400">—</span>}
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
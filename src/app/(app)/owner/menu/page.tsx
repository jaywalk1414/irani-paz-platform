import { and, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { menuItems } from '@/lib/db/schema';
import { getBusinessContext, listMenuWithAvailability } from '@/lib/services/availability.service';
import { MenuTable, type MenuRow } from './MenuTable';


export default async function OwnerMenuPage() {
  const user = await requireRole(['owner']);
  const ctx = await getBusinessContext(user.restaurantId);

  const [items, availability] = await Promise.all([
    db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, user.restaurantId)))
      .orderBy(menuItems.name),
    listMenuWithAvailability(user.restaurantId, ctx.businessDate),
  ]);

  const availabilityById = new Map(availability.map((a) => [a.menuItemId, a]));

  const rows: MenuRow[] = items.map((item) => {
    const a = availabilityById.get(item.id);
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      ingredientsText: item.ingredients.join(', '),
      priceToman: item.priceToman,
      prepTimeMinutes: item.prepTimeMinutes,
      prepGroup: item.prepGroup,
      dailyQuantityDefault: item.dailyQuantityDefault,
      isActive: item.isActive,
      todayConfigured: a?.configuredQuantity ?? null,
      todayAvailable: a?.availableQuantity ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Menu</h1>
        <p className="text-sm text-zinc-500">
          Edit prices, prep times, ingredients, and default daily quantities.
          Today’s specific stock is managed on{' '}
          <span className="font-medium text-zinc-700">Availability</span>.
        </p>
      </div>
      <MenuTable rows={rows} />
    </div>
  );
}
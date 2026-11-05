import { requireRole } from '@/lib/auth/require';
import { listKitchenOrdersEfficient } from '@/lib/services/order.service';
import { KitchenBoard, type KitchenOrderPayload } from './KitchenBoard';

export const dynamic = 'force-dynamic';

export default async function KitchenOrdersPage() {
  const user = await requireRole(['kitchen', 'owner']);
  const orders = await listKitchenOrdersEfficient(
    user.restaurantId,
    user.branchId ?? '',
  );

  const now = new Date();
  const initialOrders: KitchenOrderPayload[] = orders.map((o) => {
    const ageMinutes = Math.max(
      0,
      Math.round(((now.getTime() - o.confirmedAt.getTime()) / 60_000) * 10) / 10,
    );
    const items = o.items.map((i) => {
      const base =
        i.status === 'preparing' && i.startedAt ? i.startedAt : o.confirmedAt;
      const elapsedMs = now.getTime() - base.getTime();
      const elapsedMinutes =
        i.status === 'ready' || i.status === 'cancelled'
          ? null
          : Math.max(0, Math.round((elapsedMs / 60_000) * 10) / 10);
      const remaining =
        elapsedMinutes === null ? null : i.prepTimeMinutes - elapsedMinutes;
      const urgency =
        remaining === null
          ? null
          : remaining > i.prepTimeMinutes * 0.5
            ? ('fresh' as const)
            : remaining > 0
              ? ('due' as const)
              : ('late' as const);
      const overBy =
        elapsedMinutes === null
          ? null
          : Math.max(0, elapsedMinutes - i.prepTimeMinutes);
      return {
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        specialInstructions: i.specialInstructions,
        status: i.status,
        prepGroup: i.prepGroup,
        prepTimeMinutes: i.prepTimeMinutes,
        elapsedMinutes,
        overBy,
        urgency,
      };
    });
    return {
      id: o.id,
      tableLabel: o.tableLabel,
      status: o.status,
      confirmedAt: o.confirmedAt.toISOString(),
      estimatedReadyAt: o.estimatedReadyAt?.toISOString() ?? null,
      ageMinutes,
      items,
      pendingCount: items.filter((i) => i.status === 'pending').length,
      preparingCount: items.filter((i) => i.status === 'preparing').length,
      readyCount: items.filter((i) => i.status === 'ready').length,
    };
  });

  return <KitchenBoard initialOrders={initialOrders} />;
}
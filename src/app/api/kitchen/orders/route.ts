import { NextResponse } from 'next/server';
import { listKitchenOrdersEfficient } from '@/lib/services/order.service';
import { auth } from '../../../../../auth';


export type Urgency = 'fresh' | 'due' | 'late';

export interface KitchenItemPayload {
  id: string;
  name: string;
  quantity: number;
  specialInstructions: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'cancelled';
  prepGroup: string;
  prepTimeMinutes: number;
  /** For pending items: minutes since the order was confirmed.
   *  For preparing items: minutes since startedAt.
   *  Null for ready/cancelled. */
  elapsedMinutes: number | null;
  /** Minutes past the item's prep time (0 if not late). Null for ready/cancelled. */
  overBy: number | null;
  urgency: Urgency | null;
}

export interface KitchenOrderPayload {
  id: string;
  tableLabel: string;
  status: 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
  confirmedAt: string;
  estimatedReadyAt: string | null;
  ageMinutes: number;
  items: KitchenItemPayload[];
  pendingCount: number;
  preparingCount: number;
  readyCount: number;
}

function computeItemTiming(
  status: KitchenItemPayload['status'],
  prepTimeMinutes: number,
  base: Date,
  now: Date,
): { elapsedMinutes: number | null; overBy: number | null; urgency: Urgency | null } {
  if (status === 'ready' || status === 'cancelled') {
    return { elapsedMinutes: null, overBy: null, urgency: null };
  }
  const elapsedMs = now.getTime() - base.getTime();
  const elapsedMinutes = Math.max(0, Math.round((elapsedMs / 60_000) * 10) / 10);
  const remaining = prepTimeMinutes - elapsedMinutes;
  const urgency: Urgency =
    remaining > prepTimeMinutes * 0.5
      ? 'fresh'
      : remaining > 0
        ? 'due'
        : 'late';
  return { elapsedMinutes, overBy: Math.max(0, elapsedMinutes - prepTimeMinutes), urgency };
}

export async function GET() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== 'kitchen' && session.user.role !== 'owner')
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const orders = await listKitchenOrdersEfficient(
    session.user.restaurantId,
    session.user.branchId ?? '',
  );

  const now = new Date();

  const payload: KitchenOrderPayload[] = orders.map((o) => {
    const orderAgeMs = now.getTime() - o.confirmedAt.getTime();
    const ageMinutes = Math.max(0, Math.round((orderAgeMs / 60_000) * 10) / 10);

    const items: KitchenItemPayload[] = o.items.map((i) => {
      const base =
        i.status === 'preparing' && i.startedAt ? i.startedAt : o.confirmedAt;
      const timing = computeItemTiming(i.status, i.prepTimeMinutes, base, now);
      return {
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        specialInstructions: i.specialInstructions,
        status: i.status,
        prepGroup: i.prepGroup,
        prepTimeMinutes: i.prepTimeMinutes,
        ...timing,
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

  return NextResponse.json({ orders: payload, serverNow: now.toISOString() });
}
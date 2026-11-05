'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require';
import { markItemPreparing, markItemReady, cancelItem } from '@/lib/services/order.service';

function ctxOf(user: Awaited<ReturnType<typeof requireRole>>) {
  return { restaurantId: user.restaurantId, branchId: user.branchId!, userId: user.id };
}

export async function startItemAction(orderItemId: string) {
  const user = await requireRole(['kitchen', 'owner']);
  await markItemPreparing(ctxOf(user), orderItemId);
  revalidatePath('/kitchen/orders');
  revalidatePath('/waiter/orders');
}

export async function readyItemAction(orderItemId: string) {
  const user = await requireRole(['kitchen', 'owner']);
  await markItemReady(ctxOf(user), orderItemId);
  revalidatePath('/kitchen/orders');
  revalidatePath('/waiter/orders');
}

export async function cancelItemAction(orderItemId: string, reason: string | null) {
  const user = await requireRole(['kitchen', 'owner']);
  await cancelItem(ctxOf(user), orderItemId, reason);
  revalidatePath('/kitchen/orders');
  revalidatePath('/waiter/orders');
  revalidatePath('/owner/menu/availability');
}
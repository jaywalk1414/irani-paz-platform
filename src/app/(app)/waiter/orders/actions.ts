'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/require';
import { submitOrder, markOrderServed } from '@/lib/services/order.service';
import { InsufficientAvailabilityError } from '@/lib/services/errors';
import { OrderError } from '@/lib/services/errors';

const lineSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  specialInstructions: z.string().max(500).nullable().optional(),
});

const submitSchema = z.object({
  idempotencyKey: z.string().uuid(),
  tableId: z.string().uuid(),
  items: z.array(lineSchema).min(1),
});

export type SubmitOrderActionResult =
  | { ok: true; orderId: string; wasAppend: boolean; estimatedReadyAt: string | null }
  | { ok: false; error: string; code: string };

export async function submitOrderAction(
  payload: unknown,
): Promise<SubmitOrderActionResult> {
  const user = await requireRole(['waiter']);
  const parsed = submitSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT', error: 'Invalid order.' };

  try {
    const result = await submitOrder(
      { restaurantId: user.restaurantId, branchId: user.branchId!, userId: user.id },
      parsed.data,
    );

    revalidatePath('/waiter/dashboard');
    revalidatePath('/waiter/orders');
    revalidatePath('/kitchen/orders');

    return {
      ok: true,
      orderId: result.order.id,
      wasAppend: result.wasAppend,
      estimatedReadyAt: result.order.estimatedReadyAt?.toISOString() ?? null,
    };
  } catch (err) {
    if (err instanceof InsufficientAvailabilityError) {
      return { ok: false, code: err.code, error: err.message };
    }
    if (err instanceof OrderError) {
      return { ok: false, code: err.code, error: err.message };
    }
    throw err;
  }
}

export async function markServedAction(orderId: string) {
  const user = await requireRole(['waiter']);
  await markOrderServed(
    { restaurantId: user.restaurantId, branchId: user.branchId!, userId: user.id },
    orderId,
  );
  revalidatePath('/waiter/dashboard');
  revalidatePath('/waiter/orders');
  revalidatePath('/kitchen/orders');
}


import { previewOrderEstimate, type OrderLineInput } from '@/lib/services/order.service';

export async function previewEstimateAction(
  tableId: string,
  items: OrderLineInput[],
): Promise<{ ok: true; estimatedReadyAt: string } | { ok: false; error: string }> {
  const user = await requireRole(['waiter']);
  try {
    const result = await previewOrderEstimate(
      { restaurantId: user.restaurantId, branchId: user.branchId!, userId: user.id },
      { tableId, items },
    );
    return { ok: true, estimatedReadyAt: result.estimatedReadyAt.toISOString() };
  } catch {
    return { ok: false, error: 'Could not compute estimate.' };
  }
}
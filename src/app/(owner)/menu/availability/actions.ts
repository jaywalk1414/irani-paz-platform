'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/require';
import {
  adjustQuantity,
  getBusinessContext,
} from '@/lib/services/availability.service';
import {
  AvailabilityConflictError,
  ConfiguredBelowReservedError,
} from '@/lib/services/errors';

const adjustSchema = z.object({
  menuItemId: z.string().uuid(),
  deltaConfigured: z.number().int().refine((v) => v !== 0, {
    message: 'Adjustment cannot be zero.',
  }),
  reason: z.string().max(500).optional(),
});

export type AdjustActionResult =
  | { ok: true; availableQuantity: number; configuredQuantity: number }
  | { ok: false; error: string; code?: string };

export async function adjustAvailabilityAction(
  formData: FormData,
): Promise<AdjustActionResult> {
  const user = await requireRole(['owner']);

  const parsed = adjustSchema.safeParse({
    menuItemId: formData.get('menuItemId'),
    deltaConfigured: Number(formData.get('deltaConfigured')),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid adjustment.' };
  }

  const ctx = await getBusinessContext(user.restaurantId);

  try {
    const result = await adjustQuantity({
      restaurantId: user.restaurantId,
      menuItemId: parsed.data.menuItemId,
      businessDate: ctx.businessDate,
      deltaConfigured: parsed.data.deltaConfigured,
      reason: parsed.data.reason ?? null,
      adjustedByUserId: user.id,
    });

    revalidatePath('/owner/menu/availability');
    revalidatePath('/waiter/dashboard');
    revalidatePath('/kitchen/orders');

    return {
      ok: true,
      configuredQuantity: result.configuredQuantity,
      availableQuantity: result.availableQuantity,
    };
  } catch (err) {
    if (err instanceof ConfiguredBelowReservedError) {
      return {
        ok: false,
        code: err.code,
        error: `Cannot reduce below ${err.reserved} reserved portion(s).`,
      };
    }
    if (err instanceof AvailabilityConflictError) {
      return { ok: false, code: err.code, error: err.message };
    }
    throw err;
  }
}
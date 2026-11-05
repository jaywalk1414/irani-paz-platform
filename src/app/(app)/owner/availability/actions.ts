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
  deltaConfigured: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, { message: 'Adjustment cannot be zero.' }),
  reason: z.string().max(500).optional(),
});

export type AdjustAvailabilityState =
  | { ok: true; availableQuantity: number; configuredQuantity: number }
  | { ok: false; error: string; code?: string }
  | null;

export async function adjustAvailabilityAction(
  _prev: AdjustAvailabilityState,
  formData: FormData,
): Promise<AdjustAvailabilityState> {
  const user = await requireRole(['owner']);

  const parsed = adjustSchema.safeParse({
    menuItemId: formData.get('menuItemId'),
    deltaConfigured: formData.get('deltaConfigured'),
    reason: (formData.get('reason') as string) || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
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

    revalidatePath('/owner/availability');
    revalidatePath('/owner/dashboard');
    revalidatePath('/waiter/dashboard');
    revalidatePath('/kitchen/orders');

    return {
      ok: true,
      availableQuantity: result.availableQuantity,
      configuredQuantity: result.configuredQuantity,
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
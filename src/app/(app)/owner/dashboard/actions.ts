'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require';
import { getBusinessContext } from '@/lib/services/availability.service';
import { generateDailySummary } from '@/lib/services/ai-summary.service';

export async function generateSummaryAction(): Promise<
  { ok: true; content: string; model: string } | { ok: false; error: string }
> {
  const user = await requireRole(['owner']);
  try {
    const ctx = await getBusinessContext(user.restaurantId);
    const result = await generateDailySummary(
      user.restaurantId,
      ctx.businessDate,
      ctx.timezone,
      ctx.cutoffHour,
    );
    revalidatePath('/owner/dashboard');
    return { ok: true, content: result.content, model: result.model };
  } catch {
    return { ok: false, error: 'Could not generate the summary.' };
  }
}
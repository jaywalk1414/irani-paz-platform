/**
 * Prep-time model (DECISIONS.md §7):
 *   - Each item belongs to a prep_group (grill, fryer, stew_rice, cold, beverage, other).
 *   - Items in the SAME group run sequentially (share a station).
 *   - Items in DIFFERENT groups run in parallel.
 *   - Order estimate = now + max(remaining work across groups).
 *
 * Remaining work per item:
 *   - pending    → full prep_time
 *   - preparing  → max(0, prep_time - elapsed since started_at)
 *   - ready      → 0
 *   - cancelled  → 0
 *
 * This is a simple, explainable model — not a kitchen optimizer (out of scope).
 */

export type ItemStatus = 'pending' | 'preparing' | 'ready' | 'cancelled';

export interface EstimateLine {
  prepGroup: string;
  prepTimeMinutes: number;
  status: ItemStatus;
  startedAt: Date | null;
}

export function computeOrderEstimate(
  lines: EstimateLine[],
  now: Date,
): Date {
  const remainingByGroup = new Map<string, number>();

  for (const line of lines) {
    let remaining: number;
    switch (line.status) {
      case 'ready':
      case 'cancelled':
        remaining = 0;
        break;

      case 'preparing': {
        if (line.startedAt) {
          const elapsedMin =
            (now.getTime() - line.startedAt.getTime()) / 60_000;
          remaining = Math.max(0, line.prepTimeMinutes - elapsedMin);
        } else {
          // Defensive: a preparing item should have startedAt, but if not,
          // fall back to full prep time rather than underestimating.
          remaining = line.prepTimeMinutes;
        }
        break;
      }

      case 'pending':
        remaining = line.prepTimeMinutes;
        break;
    }

    const group = line.prepGroup;
    remainingByGroup.set(group, (remainingByGroup.get(group) ?? 0) + remaining);
  }

  if (remainingByGroup.size === 0) return now;

  const maxRemaining = Math.max(...Array.from(remainingByGroup.values()));
  return new Date(now.getTime() + maxRemaining * 60_000);
}
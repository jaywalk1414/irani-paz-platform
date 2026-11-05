/** Tehran is UTC+3:30 (no DST since 2022). Kept for the seed's time arithmetic. */
export const TEHRAN_OFFSET_MIN = 3 * 60 + 30;

export interface BusinessContext {
  /** 'YYYY-MM-DD' — the business day the current moment belongs to. */
  businessDate: string;
  /** Hour (0–23) at which the business day rolls over. */
  cutoffHour: number;
}

/**
 * Compute the current business date for a restaurant.
 * Rolls over at `cutoffHour` local time, not at midnight.
 * Mirrors the logic in seed.ts so demo data and runtime agree.
 */
export function getBusinessDate(
  timezone: string,
  cutoffHour: number,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const rawHour = get('hour');
  const hour = rawHour === '24' ? 0 : parseInt(rawHour, 10);
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;

  if (hour < cutoffHour) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return dateStr;
}

/** Extract the cutoff hour from the DB `time` column, e.g. '04:00:00' → 4. */
export function parseCutoffHour(timeValue: string): number {
  return parseInt(timeValue.split(':')[0]!, 10);
}
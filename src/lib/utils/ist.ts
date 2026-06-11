/**
 * ist.ts — THE canonical IST (Asia/Kolkata, UTC+05:30) date math.
 *
 * Pure functions, no DB calls — safe in both client and server contexts.
 * IST has no DST, so fixed-offset arithmetic is always correct.
 *
 * This module is the single source of truth extracted from three
 * character-identical forks (date-range.ts, whatsapp-period.ts,
 * performance-service.ts) in the 2026-06-10 DRY audit (H-7).
 * Never re-implement IST boundary math inline — import from here.
 *
 * Day-boundary helpers (UTC Date in, UTC Date out):
 *   toISTMidnight(d)        → UTC instant of 00:00:00.000 IST on d's IST day
 *   toISTEndOfDay(d)        → UTC instant of 23:59:59.999 IST on d's IST day
 *   getISTMondayStart(now)  → most recent Monday at IST midnight
 *   getISTMonthStart(now)   → first day of now's IST month at IST midnight
 *   getISTPrevMonthRange(d) → { from, to } covering the full IST month before d's
 *
 * Wall-clock helpers (used by the SLA business-hours engine):
 *   toIst(utcDate)          → { year, month, day, hour, minute, dayOfWeek } in IST
 *   istToUtc(y, m, d, h, m) → UTC Date for that IST wall-clock moment
 */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 330 minutes

/** Returns the UTC Date corresponding to IST midnight of the given date. */
export function toISTMidnight(d: Date): Date {
  const istMs   = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/** Returns the UTC Date corresponding to 23:59:59.999 IST of the given date. */
export function toISTEndOfDay(d: Date): Date {
  const istMs   = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(23, 59, 59, 999);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/** Most recent Monday at IST midnight. */
export function getISTMondayStart(now: Date): Date {
  const istMs   = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  const dow     = istDate.getUTCDay(); // 0=Sun … 6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1;
  istDate.setUTCDate(istDate.getUTCDate() - daysBack);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/** First day of the given date's IST month, at IST midnight. */
export function getISTMonthStart(now: Date): Date {
  const istDate = new Date(now.getTime() + IST_OFFSET_MS);
  istDate.setUTCDate(1);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/**
 * The full IST calendar month immediately before the one containing `d`.
 * from = first day of that month at IST midnight (UTC instant)
 * to   = last day of that month at 23:59:59.999 IST (UTC instant)
 *
 * Composable: getISTPrevMonthRange(getISTPrevMonthRange(now).from) yields
 * the month before that (used for previous-period comparisons).
 */
export function getISTPrevMonthRange(d: Date): { from: Date; to: Date } {
  // All intermediate values live in the +5:30-shifted "IST frame".
  const istD = new Date(d.getTime() + IST_OFFSET_MS);
  const firstThisMonth = new Date(istD);
  firstThisMonth.setUTCDate(1);
  firstThisMonth.setUTCHours(0, 0, 0, 0);
  // Last moment of previous month = 1ms before first of this month
  const lastPrevIst = new Date(firstThisMonth.getTime() - 1);
  const firstPrevIst = new Date(lastPrevIst);
  firstPrevIst.setUTCDate(1);
  firstPrevIst.setUTCHours(0, 0, 0, 0);
  return {
    from: new Date(firstPrevIst.getTime() - IST_OFFSET_MS),
    to:   toISTEndOfDay(new Date(lastPrevIst.getTime() - IST_OFFSET_MS)),
  };
}

/** IST wall-clock decomposition of a UTC instant. */
export function toIst(utcDate: Date): {
  year: number; month: number; day: number; hour: number; minute: number; dayOfWeek: number;
} {
  const d = new Date(utcDate.getTime() + IST_OFFSET_MS);
  return {
    year:      d.getUTCFullYear(),
    month:     d.getUTCMonth(),    // 0-indexed
    day:       d.getUTCDate(),
    hour:      d.getUTCHours(),
    minute:    d.getUTCMinutes(),
    dayOfWeek: d.getUTCDay(),      // 0 = Sunday
  };
}

/** UTC Date for a specific IST wall-clock moment. */
export function istToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Construct as if UTC, then subtract IST offset to get real UTC
  const pseudoUtcMs = Date.UTC(year, month, day, hour, minute, 0, 0);
  return new Date(pseudoUtcMs - IST_OFFSET_MS);
}

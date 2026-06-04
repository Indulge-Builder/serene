/**
 * Pure IST date-range utilities.
 * No DB calls. Safe in both client and server contexts.
 *
 * Presets map to IST calendar boundaries so "This Week" always means
 * Monday–Sunday in IST, regardless of the server's local timezone.
 *
 * IST offset: UTC+05:30 = 330 minutes ahead of UTC.
 */

export type DatePreset = 'today' | 'week' | 'month' | 'last_month' | 'quarter' | 'custom';

export type DateRange = {
  from: string; // ISO 8601 UTC, e.g. "2026-06-01T18:30:00.000Z"
  to:   string; // ISO 8601 UTC
};

// IST offset in milliseconds
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 330 minutes

/** Returns the UTC Date corresponding to IST midnight of the given date. */
function toISTMidnight(d: Date): Date {
  const istMs   = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/** Returns the UTC Date corresponding to 23:59:59.999 IST of the given date. */
function toISTEndOfDay(d: Date): Date {
  const istMs   = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(23, 59, 59, 999);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/** Most recent Monday at IST midnight. */
function getISTMondayStart(now: Date): Date {
  const istMs   = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  const dow     = istDate.getUTCDay(); // 0=Sun … 6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1;
  istDate.setUTCDate(istDate.getUTCDate() - daysBack);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/**
 * Resolve a named preset to an absolute UTC ISO date range.
 * "custom" is not resolvable here — callers that pass custom must supply
 * their own from/to strings and call this function with from/to directly.
 */
export function resolvePresetToRange(preset: Exclude<DatePreset, 'custom'>): DateRange {
  const now = new Date();

  switch (preset) {
    case 'today': {
      const from = toISTMidnight(now);
      return { from: from.toISOString(), to: now.toISOString() };
    }

    case 'week': {
      const from = getISTMondayStart(now);
      return { from: from.toISOString(), to: now.toISOString() };
    }

    case 'month': {
      const istNow   = new Date(now.getTime() + IST_OFFSET_MS);
      const first    = new Date(istNow);
      first.setUTCDate(1);
      first.setUTCHours(0, 0, 0, 0);
      const fromUtc  = new Date(first.getTime() - IST_OFFSET_MS);
      return { from: fromUtc.toISOString(), to: now.toISOString() };
    }

    case 'last_month': {
      const istNow = new Date(now.getTime() + IST_OFFSET_MS);
      // First day of current month in IST
      const firstThisMonth = new Date(istNow);
      firstThisMonth.setUTCDate(1);
      firstThisMonth.setUTCHours(0, 0, 0, 0);
      // Last moment of previous month = 1ms before first of this month
      const lastPrevIst = new Date(firstThisMonth.getTime() - 1);
      // First day of previous month in IST
      const firstPrevIst = new Date(lastPrevIst);
      firstPrevIst.setUTCDate(1);
      firstPrevIst.setUTCHours(0, 0, 0, 0);
      const fromUtc = new Date(firstPrevIst.getTime() - IST_OFFSET_MS);
      const toUtc   = toISTEndOfDay(new Date(lastPrevIst.getTime() - IST_OFFSET_MS));
      return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
    }

    case 'quarter': {
      // 90 days back from IST midnight today
      const fromDate = toISTMidnight(now);
      fromDate.setUTCDate(fromDate.getUTCDate() - 89); // 90 days incl. today
      return { from: fromDate.toISOString(), to: now.toISOString() };
    }
  }
}

/**
 * Build a DateRange from raw YYYY-MM-DD strings (as stored in URL params).
 * Converts from-date to IST midnight, to-date to IST end-of-day.
 * Returns null if either string is missing or malformed.
 */
export function rangeFromUrlParams(from: string | null, to: string | null): DateRange | null {
  if (!from || !to) return null;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return null;

  const fromDate = toISTMidnight(new Date(fy, fm - 1, fd));
  const toDate   = toISTEndOfDay(new Date(ty, tm - 1, td));
  if (fromDate > toDate) return null;

  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

/**
 * Human-readable label for a preset. Used in the filter button and chart axis.
 */
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today:      'Today',
  week:       'This Week',
  month:      'This Month',
  last_month: 'Previous Month',
  quarter:    'This Quarter',
  custom:     'Custom Range',
};

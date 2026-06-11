/**
 * Pure IST date-range utilities.
 * No DB calls. Safe in both client and server contexts.
 *
 * Presets map to IST calendar boundaries so "This Week" always means
 * Monday–Sunday in IST, regardless of the server's local timezone.
 *
 * IST offset: UTC+05:30 = 330 minutes ahead of UTC.
 */

import {
  toISTMidnight,
  toISTEndOfDay,
  getISTMondayStart,
  getISTMonthStart,
  getISTPrevMonthRange,
} from '@/lib/utils/ist';

export type DatePreset = 'today' | 'week' | 'month' | 'last_month' | 'quarter' | 'custom';

export type DateRange = {
  from: string; // ISO 8601 UTC, e.g. "2026-06-01T18:30:00.000Z"
  to:   string; // ISO 8601 UTC
};

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
      const fromUtc = getISTMonthStart(now);
      return { from: fromUtc.toISOString(), to: now.toISOString() };
    }

    case 'last_month': {
      const { from, to } = getISTPrevMonthRange(now);
      return { from: from.toISOString(), to: to.toISOString() };
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

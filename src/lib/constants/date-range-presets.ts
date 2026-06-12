// date-range-presets.ts — THE quick date-range presets for filter bars
// (Today / Yesterday / This Week / Previous Week / This Month / Previous
// Month / Last 3 Months). Rendered by ui/DateRangePresetList inside the
// FilterBar "Range" panel; the manual From → To panel is "Dates".
//
// Presets resolve to the same YYYY-MM-DD URL-param strings the DatePicker
// produces (lib/utils/filter-params), so they flow through the existing
// date_from / date_to filtering on every page untouched. "Today" is anchored
// to the IST calendar day via toIst() — never the browser's local day.

import { defineEnum } from '@/lib/constants/define-enum';
import { toIst } from '@/lib/utils/ist';
import { dateToUrlParam } from '@/lib/utils/filter-params';

const DEF = defineEnum([
  { id: 'today',         label: 'Today' },
  { id: 'yesterday',     label: 'Yesterday' },
  { id: 'this_week',     label: 'This Week' },
  { id: 'prev_week',     label: 'Previous Week' },
  { id: 'this_month',    label: 'This Month' },
  { id: 'prev_month',    label: 'Previous Month' },
  { id: 'last_3_months', label: 'Last 3 Months' },
]);

export const DATE_RANGE_PRESETS        = DEF.values;
export const DATE_RANGE_PRESET_LABELS  = DEF.labels;
export const DATE_RANGE_PRESET_OPTIONS = DEF.options;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

const serialize = (d: Date) => dateToUrlParam(d) as string;

/** Calendar-day shift; Date constructor normalises month/day overflow. */
function shiftDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/** Most recent Monday on or before `day` (weeks start Monday, as in ist.ts). */
function mondayOf(day: Date): Date {
  const dow = day.getDay(); // 0=Sun … 6=Sat
  return shiftDays(day, dow === 0 ? -6 : 1 - dow);
}

/**
 * Resolve a preset to URL-param date strings for the given instant
 * (defaults to now). Both bounds are inclusive IST calendar days — the
 * service layer owns the day-boundary transforms, same as manual dates.
 */
export function resolveDateRangePreset(
  preset: DateRangePreset,
  now: Date = new Date(),
): { from: string; to: string } {
  const ist   = toIst(now);
  const today = new Date(ist.year, ist.month, ist.day);

  switch (preset) {
    case 'today':
      return { from: serialize(today), to: serialize(today) };
    case 'yesterday': {
      const d = shiftDays(today, -1);
      return { from: serialize(d), to: serialize(d) };
    }
    case 'this_week':
      return { from: serialize(mondayOf(today)), to: serialize(today) };
    case 'prev_week': {
      const monday = mondayOf(today);
      return { from: serialize(shiftDays(monday, -7)), to: serialize(shiftDays(monday, -1)) };
    }
    case 'this_month':
      return {
        from: serialize(new Date(today.getFullYear(), today.getMonth(), 1)),
        to:   serialize(today),
      };
    case 'prev_month':
      return {
        from: serialize(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to:   serialize(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case 'last_3_months':
      return {
        from: serialize(new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())),
        to:   serialize(today),
      };
  }
}

/** The preset the current from/to pair corresponds to, or null. */
export function matchDateRangePreset(
  from: string | null,
  to: string | null,
  now: Date = new Date(),
): DateRangePreset | null {
  if (!from || !to) return null;
  for (const preset of DATE_RANGE_PRESETS) {
    const r = resolveDateRangePreset(preset, now);
    if (r.from === from && r.to === to) return preset;
  }
  return null;
}

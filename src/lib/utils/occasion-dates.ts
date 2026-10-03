// occasion-dates.ts — THE reader of a date that matters, as a member fact holds it (2026-10-02).
//
// A birthday or anniversary fact (member_facts facet identity, key birthday / anniversary /
// dating_anniversary) carries `value` as a human would say it: "12 March", "March 12 1985",
// "12/03/1985", "1985-03-12", "12-03-85", "12th of March" — from Atlas, Typeform, a Freshdesk
// contact or the profiler. Pure, no model: a value this cannot read with confidence is null, never
// a guess (a wrong birthday greeting is worse than none). Day-first when ambiguous, the Indian way.
// Backs find_member_occasions (elaya-data.ts); never re-inline a date-in-text parse elsewhere.

export type MonthDay = { month: number; day: number; year: number | null };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function valid(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

function year4(y: string | undefined): number | null {
  if (!y) return null;
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (y.length === 2) return n > 30 ? 1900 + n : 2000 + n;
  return n >= 1900 && n <= 2100 ? n : null;
}

/** The structured form when a writer kept one ({date}, {iso}, {month, day}), else the text. */
export function parseOccasionDate(value: string | null | undefined, json?: unknown): MonthDay | null {
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>;
    const iso = typeof j.date === 'string' ? j.date : typeof j.iso === 'string' ? j.iso : null;
    if (iso) {
      const fromIso = parseOccasionDate(iso);
      if (fromIso) return fromIso;
    }
    if (typeof j.month === 'number' && typeof j.day === 'number' && valid(j.month, j.day)) {
      return { month: j.month, day: j.day, year: typeof j.year === 'number' ? j.year : null };
    }
  }
  const text = (value ?? '').trim().toLowerCase();
  if (!text) return null;

  // 1985-03-12 (an ISO date, with or without a time)
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ].*)?$/.exec(text);
  if (m) {
    const month = Number(m[2]); const day = Number(m[3]);
    return valid(month, day) ? { month, day, year: year4(m[1]) } : null;
  }
  // 12/03/1985, 12-03-85, 12.3.1985 (day first)
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(text);
  if (m) {
    const day = Number(m[1]); const month = Number(m[2]);
    if (valid(month, day)) return { month, day, year: year4(m[3]) };
    // month first, when day-first cannot be right (03/12 read as 12 March fails; 3 Dec passes)
    return valid(day, month) ? { month: day, day: month, year: year4(m[3]) } : null;
  }
  // 12 March, 12th of March 1985, 12 mar 85
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\.?(?:,?\s+(\d{2,4}))?$/.exec(text);
  if (m && MONTHS[m[2]] !== undefined) {
    const month = MONTHS[m[2]]; const day = Number(m[1]);
    return valid(month, day) ? { month, day, year: year4(m[3]) } : null;
  }
  // March 12, March 12th 1985, Mar 12, 1985
  m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?$/.exec(text);
  if (m && MONTHS[m[1]] !== undefined) {
    const month = MONTHS[m[1]]; const day = Number(m[2]);
    return valid(month, day) ? { month, day, year: year4(m[3]) } : null;
  }
  return null;
}

/** The first calendar date on or after `from` with this month and day, as YYYY-MM-DD (UTC calendar), or null past `to`. */
export function nextOccurrence(md: MonthDay, from: Date, to: Date): string | null {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year += 1) {
    // 29 February falls on the 28th in a year without one (the greeting still goes).
    const day = md.month === 2 && md.day === 29 && !isLeap(year) ? 28 : md.day;
    const t = Date.UTC(year, md.month - 1, day);
    if (t < start) continue;
    if (t > end) return null;
    return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Whole days from `from` to a YYYY-MM-DD date (UTC calendar). */
export function daysUntil(dateIso: string, from: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((Date.parse(`${dateIso}T00:00:00Z`) - start) / 86_400_000);
}

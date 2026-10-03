/**
 * The occasion-date reader bench (2026-10-02). Free. Every shape a member fact holds a date in,
 * and the ones it must refuse. Run after touching utils/occasion-dates.ts:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/elaya/occasion-dates-bench.ts
 */
import { parseOccasionDate, nextOccurrence, daysUntil } from '@/lib/utils/occasion-dates';

const cases: [string | null, unknown, { month: number; day: number; year: number | null } | null][] = [
  ['12 March', undefined, { month: 3, day: 12, year: null }],
  ['12th of March 1985', undefined, { month: 3, day: 12, year: 1985 }],
  ['March 12', undefined, { month: 3, day: 12, year: null }],
  ['Mar 12, 1985', undefined, { month: 3, day: 12, year: 1985 }],
  ['12/03/1985', undefined, { month: 3, day: 12, year: 1985 }],
  ['12-03-85', undefined, { month: 3, day: 12, year: 1985 }],
  ['1985-03-12', undefined, { month: 3, day: 12, year: 1985 }],
  ['1985-03-12T00:00:00Z', undefined, { month: 3, day: 12, year: 1985 }],
  ['03/25/1990', undefined, { month: 3, day: 25, year: 1990 }],
  ['29 Feb', undefined, { month: 2, day: 29, year: null }],
  ['31 Feb', undefined, null],
  ['sometime in March', undefined, null],
  ['', undefined, null],
  [null, { date: '1990-07-04' }, { month: 7, day: 4, year: 1990 }],
  ['garbage', { month: 11, day: 5 }, { month: 11, day: 5, year: null }],
];
let failed = 0;
for (const [value, json, want] of cases) {
  const got = parseOccasionDate(value, json);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${JSON.stringify(value)} ${json ? JSON.stringify(json) : ''} → ${JSON.stringify(got)}${ok ? '' : ` (wanted ${JSON.stringify(want)})`}`);
}
const from = new Date('2026-10-02T00:00:00Z'); const to = new Date('2026-11-01T00:00:00Z');
const n1 = nextOccurrence({ month: 10, day: 15, year: 1980 }, from, to);
const n2 = nextOccurrence({ month: 3, day: 12, year: null }, from, to);
const n3 = nextOccurrence({ month: 2, day: 29, year: null }, new Date('2027-02-01T00:00:00Z'), new Date('2027-03-01T00:00:00Z'));
for (const [name, got, want] of [['inside the window', n1, '2026-10-15'], ['outside the window', n2, null], ['29 Feb in a common year', n3, '2027-02-28']] as const) {
  const ok = got === want; if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} nextOccurrence ${name} → ${got}`);
}
const d = daysUntil('2026-10-15', from); const okd = d === 13; if (!okd) failed += 1;
console.log(`${okd ? '✓' : '✗'} daysUntil → ${d}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

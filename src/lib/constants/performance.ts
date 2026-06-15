/**
 * performance.ts — performance-page domain constants (pure data, no DB deps).
 *
 * FIRST-TOUCH SPEED BUCKETS
 * The scorecard below the call-outcome breakdown buckets each cohort lead by how
 * fast its FIRST call note arrived, measured in BUSINESS minutes per the agent's
 * shift (lib/utils/sla.businessMinutesBetween — global IST Mon–Sat 09:00–19:00
 * fallback, per-agent shift override). The boundaries below are the upper edge of
 * each bucket in *business minutes*; a lead lands in the FIRST bucket whose
 * `maxMinutes` it does not exceed (the last bucket is open-ended via Infinity).
 *
 * Ordering is fast → slow and is the canonical render order. The colours run a
 * success → danger gradient (faster = greener) and resolve via design tokens —
 * never a hex (Rule 01). Bucket ids are stable keys; never rename after shipping.
 */

export type FirstTouchBucketId = 'lt15' | 'lt30' | 'lte1h' | 'lt3h' | 'gte3h';

export interface FirstTouchBucket {
  id:         FirstTouchBucketId;
  label:      string;
  /** Upper edge in BUSINESS minutes, inclusive. Infinity = open-ended slowest. */
  maxMinutes: number;
  /** Design-token colour string (resolved for SVG/chart use via resolveColorMap). */
  color:      string;
}

// Order = fast → slow = canonical render order. A lead falls into the first
// bucket whose maxMinutes it is <=. boundaries: <15m, 15–30m, ≤1h, 1–3h, 3h+.
export const FIRST_TOUCH_BUCKETS: readonly FirstTouchBucket[] = [
  { id: 'lt15',  label: '< 15m',  maxMinutes: 15,        color: 'var(--color-success)' },
  { id: 'lt30',  label: '15–30m', maxMinutes: 30,        color: 'var(--color-info)'    },
  { id: 'lte1h', label: '≤ 1h',   maxMinutes: 60,        color: 'var(--theme-accent)'  },
  { id: 'lt3h',  label: '1–3h',   maxMinutes: 180,       color: 'var(--color-warning)' },
  { id: 'gte3h', label: '3h+',    maxMinutes: Infinity,  color: 'var(--color-danger)'  },
] as const;

/**
 * Maps an elapsed business-minute value to its bucket id.
 * Walks fast → slow and returns the first bucket whose ceiling it does not
 * exceed; the final bucket's Infinity ceiling guarantees a match. A value of 0
 * (call within the same minute) lands in the fastest bucket — correct.
 */
export function firstTouchBucketForMinutes(minutes: number): FirstTouchBucketId {
  for (const b of FIRST_TOUCH_BUCKETS) {
    if (minutes <= b.maxMinutes) return b.id;
  }
  // Unreachable — the last bucket is Infinity — but keep the total honest.
  return 'gte3h';
}

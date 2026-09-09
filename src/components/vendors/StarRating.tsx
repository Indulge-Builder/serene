// StarRating — THE 1–5 rating display for the vendor module.
//
// Five stars, accent-filled left to right with the last one partially filled
// for the decimal (4.4 → 88% of the row). Display-only (A-06),
// server-component-safe. This is the vocabulary for a HUMAN-ENTERED rating
// (vendor_reviews, 1–5); the COMPUTED 0–10 score uses VendorScoreRing instead,
// so the two numbers can never be mistaken for each other.
//
// The partial fill is one clipped overlay row rather than per-star maths — a
// half star is a width, and widths do not drift the way rounding does.

import { REVIEW_RATING_MAX } from '@/lib/constants/vendors';

const STAR_PATH =
  'M12 2.6l2.85 5.77 6.37.93-4.61 4.49 1.09 6.35L12 17.14l-5.7 3l1.09-6.35-4.61-4.49 6.37-.93z';

function StarRow({ fill, size }: { fill: string; size: number }) {
  return (
    <span style={{ display: 'flex', gap: '3px', width: 'max-content' }}>
      {Array.from({ length: REVIEW_RATING_MAX }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }} aria-hidden>
          <path d={STAR_PATH} fill={fill} />
        </svg>
      ))}
    </span>
  );
}

export function StarRating({
  value,
  size = 16,
  label,
}: {
  /** 1–5, or null when nobody has rated this dimension yet. */
  value: number | null;
  size?: number;
  /** Screen-reader context, e.g. "Speed". */
  label?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / REVIEW_RATING_MAX)) * 100;

  return (
    <span
      role="img"
      aria-label={
        value == null
          ? `${label ?? 'Rating'}: not rated yet`
          : `${label ?? 'Rating'}: ${value.toFixed(1)} out of ${REVIEW_RATING_MAX}`
      }
      style={{ position: 'relative', display: 'inline-block', lineHeight: 0, flexShrink: 0 }}
    >
      {/* Unfilled ground — the well tone, the same "empty track" the app uses
          everywhere (PasswordStrengthBar's unfilled segments). */}
      <StarRow fill="var(--neu-well)" size={size} />
      {pct > 0 && (
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${pct}%`,
            overflow: 'hidden',
          }}
        >
          <StarRow fill="var(--theme-accent)" size={size} />
        </span>
      )}
    </span>
  );
}

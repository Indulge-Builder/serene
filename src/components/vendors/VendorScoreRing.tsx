// VendorScoreRing — THE computed 0–10 vendor score display.
//
// A ring, because the score is a whole-vendor verdict rather than one of a set
// of comparable rows; the human-entered 1–5 dimensions use StarRating, so the
// two number systems never share a shape. The value is `--font-mono` +
// tabular-nums (the number-font rule: mono for stat values, never Playfair).
//
// `score: null` = nothing to score yet (never used, never rated). It renders an
// em dash on an empty track — never a 0, which would read as "bad" rather than
// "unknown". Display-only (A-06), server-component-safe.

import { SCORE_MAX } from '@/lib/constants/vendors';

export function VendorScoreRing({
  score,
  size = 104,
  stroke = 8,
}: {
  score: number | null;
  size?: number;
  stroke?: number;
}) {
  // Below 60px (a ranked row) there is no room for "of 10" inside the ring: the
  // number alone, and the full reading for assistive tech and on hover.
  const compact = size < 60;
  const reading = score == null ? 'No score yet' : `Score ${score.toFixed(1)} of ${SCORE_MAX}`;
  const r = size / 2 - stroke / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(1, score / SCORE_MAX));

  return (
    <div
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      {...(compact ? { role: 'img', 'aria-label': reading, title: reading } : {})}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--neu-well)"
          strokeWidth={stroke}
        />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--theme-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
          />
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeContent: 'center',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 'var(--weight-semibold)',
            fontSize: size >= 96 ? 'var(--text-xl)' : compact ? 'var(--text-sm)' : 'var(--text-lg)',
            lineHeight: 1,
            letterSpacing: 'var(--tracking-tight)',
            color: score == null ? 'var(--theme-text-tertiary)' : 'var(--neu-accent-deep)',
          }}
        >
          {score == null ? '—' : score.toFixed(1)}
        </span>
        {!compact && (
          <span
            className="label-micro"
            style={{ color: 'var(--theme-text-tertiary)', marginTop: 'var(--space-1)' }}
          >
            {score == null ? 'No score' : `of ${SCORE_MAX}`}
          </span>
        )}
      </div>
    </div>
  );
}

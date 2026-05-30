'use client';

import { motion }                    from 'framer-motion';
import type { OutcomeBreakdownItem } from '@/lib/services/performance-service';
import type { CallOutcome }          from '@/lib/types/database';
import { EXIT_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

// ─────────────────────────────────────────────
// Outcome config — colour tokens, display labels
// ─────────────────────────────────────────────

const OUTCOME_CONFIG: Record<
  CallOutcome,
  { label: string; color: string; textColor: string }
> = {
  conversing:   { label: 'Conversing',    color: 'var(--color-success)',  textColor: 'var(--color-success-text)'  },
  rnr:          { label: 'RNR',           color: 'var(--color-warning)',  textColor: 'var(--color-warning-text)'  },
  switched_off: { label: 'Switched Off',  color: 'var(--color-neutral)',  textColor: 'var(--color-neutral-text)'  },
  wrong_number: { label: 'Wrong Number',  color: 'var(--color-danger)',   textColor: 'var(--color-danger-text)'   },
  other:        { label: 'Other',         color: 'var(--color-info)',     textColor: 'var(--color-info-text)'     },
};

// Ordered for visual hierarchy: best → worst
const OUTCOME_ORDER: CallOutcome[] = ['conversing', 'rnr', 'switched_off', 'wrong_number', 'other'];

type Props = {
  breakdown: OutcomeBreakdownItem[];
};

export function CallOutcomeBar({ breakdown }: Props) {
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return (
      <div
        style={{
          background:   "var(--theme-paper)",
          border:       "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-lg)",
          padding:      "var(--space-6) var(--space-5)",
          boxShadow:    "var(--shadow-1)",
          textAlign:    "center",
        }}
      >
        {/* V-09: Playfair italic empty state */}
        <p
          style={{
            fontFamily:  "var(--font-serif)",
            fontStyle:   "italic",
            fontSize:    "var(--text-md)",
            fontWeight:  "var(--weight-light)",
            color:       "var(--theme-text-tertiary)",
          }}
        >
          No calls logged this period.
        </p>
      </div>
    );
  }

  // Sort breakdown into canonical order
  const countMap: Partial<Record<CallOutcome, number>> = {};
  for (const item of breakdown) {
    countMap[item.outcome] = item.count;
  }

  const orderedItems = OUTCOME_ORDER
    .filter((o) => (countMap[o] ?? 0) > 0)
    .map((o) => ({ outcome: o, count: countMap[o] ?? 0 }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: EXIT_DURATION, delay: 0.18, ease: EASE_OUT_EXPO }}
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "var(--space-5)",
        boxShadow:    "var(--shadow-1)",
      }}
    >
      {/* Section eyebrow */}
      <p
        style={{
          fontFamily:    "var(--font-sans)",
          fontSize:      "var(--text-2xs)",
          fontWeight:    "var(--weight-medium)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color:         "var(--theme-text-tertiary)",
          marginBottom:  "var(--space-4)",
        }}
      >
        Call Outcome Breakdown
      </p>

      {/* Segmented bar */}
      <div
        role="img"
        aria-label={`Call outcome distribution: ${orderedItems.map(i => `${i.count} ${OUTCOME_CONFIG[i.outcome].label}`).join(', ')}`}
        style={{
          display:      "flex",
          height:       "28px",
          borderRadius: "var(--radius-md)",
          overflow:     "hidden",
          marginBottom: "var(--space-3)",
          gap:          "2px",
        }}
      >
        {orderedItems.map(({ outcome, count }) => {
          const config = OUTCOME_CONFIG[outcome];
          const pct    = (count / total) * 100;
          return (
            <div
              key={outcome}
              title={`${config.label}: ${count}`}
              style={{
                width:     `${pct}%`,
                background: config.color,
                minWidth:  pct > 0 ? "4px" : "0",
                opacity:   0.85,
              }}
            />
          );
        })}
      </div>

      {/* Labels below the bar */}
      <div
        style={{
          display:   "flex",
          flexWrap:  "wrap",
          gap:       "var(--space-4)",
        }}
      >
        {orderedItems.map(({ outcome, count }) => {
          const config = OUTCOME_CONFIG[outcome];
          const pct    = Math.round((count / total) * 100);
          return (
            <div
              key={outcome}
              style={{
                display:    "flex",
                alignItems: "center",
                gap:        "var(--space-1)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display:      "inline-block",
                  width:        "8px",
                  height:       "8px",
                  borderRadius: "var(--radius-xs)",
                  background:   config.color,
                  opacity:      0.85,
                  flexShrink:   0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-xs)",
                  color:      "var(--theme-text-tertiary)",
                }}
              >
                {config.label}
              </span>
              <span
                style={{
                  fontFamily:  "var(--font-sans)",
                  fontSize:    "var(--text-xs)",
                  fontWeight:  "var(--weight-medium)",
                  color:       "var(--theme-text-secondary)",
                }}
              >
                {count}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-xs)",
                  color:      "var(--theme-text-tertiary)",
                }}
              >
                ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

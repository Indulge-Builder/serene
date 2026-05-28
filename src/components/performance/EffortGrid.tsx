'use client';

import { motion }               from 'framer-motion';
import type { EffortMetrics }   from '@/lib/services/performance-service';

type CompactCardProps = {
  eyebrow:    string;
  value:      number;
  delay:      number;
  dotColor?:  string;  // if set, renders a live-state dot next to the eyebrow
};

function CompactCard({ eyebrow, value, delay, dotColor }: CompactCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "var(--space-4)",
        boxShadow:    "var(--shadow-1)",
      }}
    >
      {/* Eyebrow with optional live dot */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-1)",
          marginBottom: "var(--space-3)",
        }}
      >
        {dotColor && (
          <span
            aria-hidden="true"
            style={{
              display:      "inline-block",
              width:        "6px",
              height:       "6px",
              borderRadius: "var(--radius-full)",
              background:   dotColor,
              flexShrink:   0,
            }}
          />
        )}
        <p
          style={{
            fontFamily:    "var(--font-sans)",
            fontSize:      "10px",
            fontWeight:    "var(--weight-medium)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color:         "var(--theme-text-tertiary)",
            margin:        0,
          }}
        >
          {eyebrow}
        </p>
      </div>

      {/* Value — sans-serif, text-2xl */}
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-2xl)",
          fontWeight: "var(--weight-light)",
          color:      "var(--theme-text-primary)",
          lineHeight: "var(--leading-tight)",
          margin:     0,
        }}
      >
        {value}
      </p>
    </motion.div>
  );
}

type Props = {
  metrics: EffortMetrics;
};

export function EffortGrid({ metrics }: Props) {
  const cards = [
    {
      eyebrow:   'Calls Logged',
      value:     metrics.callsLogged,
      delay:     0,
      dotColor:  undefined,
    },
    {
      eyebrow:   'Notes Written',
      value:     metrics.notesWritten,
      delay:     60,
      dotColor:  undefined,
    },
    {
      eyebrow:   'In Discussion',
      value:     metrics.inDiscussionCount,
      delay:     120,
      dotColor:  'var(--color-info)',
    },
    {
      eyebrow:   'Nurturing',
      value:     metrics.nurturingCount,
      delay:     180,
      dotColor:  'var(--color-warning)',
    },
  ];

  return (
    <div
      style={{
        display:             "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap:                 "var(--space-4)",
      }}
    >
      {cards.map((card) => (
        <CompactCard key={card.eyebrow} {...card} />
      ))}
    </div>
  );
}

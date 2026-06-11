'use client';

import { m as motion } from 'framer-motion';
import { PAGE_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import { formatCompact } from '@/lib/utils/numbers';
import type { AgentDistributionRow } from '@/lib/types/database';

// Segment colour cycle — non-semantic mid-tones from the --domain-* palette.
// Agents are categorical data (V-01/V-03): never rotate semantic
// success/warning/danger colours positionally — agent #5 reading as
// "danger red" is a false signal.
const SEGMENT_COLORS = [
  'var(--domain-concierge)',  /* steel blue  */
  'var(--domain-finance)',    /* jade green  */
  'var(--domain-marketing)',  /* orchid      */
  'var(--domain-tech)',       /* terracotta  */
  'var(--domain-b2b)',        /* soft violet */
];

type AgentDistributionBarProps = {
  distribution: AgentDistributionRow[];
  total:        number;
};

export function AgentDistributionBar({ distribution, total }: AgentDistributionBarProps) {
  if (distribution.length <= 1 || total === 0) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      {/* Section label */}
      <p
        className="label-micro"
        style={{ marginBottom: 'var(--space-3)' }}
      >
        Agent Distribution
      </p>

      {/* Stacked bar — h-2, radius-full, overflow-hidden.
          Segments are static flex-basis slices; the entrance is one scaleX
          on the inner container — never animate width (DNA M-06). */}
      <div
        style={{
          height:       '8px',
          borderRadius: 'var(--radius-full)',
          overflow:     'hidden',
          background:   'var(--theme-paper-subtle)',
        }}
      >
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: PAGE_DURATION, ease: EASE_OUT_EXPO }}
          style={{
            display:         'flex',
            height:          '100%',
            transformOrigin: 'left center',
          }}
        >
          {distribution.map((agent, i) => {
            const pct = (agent.lead_count / total) * 100;
            return (
              <div
                key={agent.agent_id}
                style={{
                  flex:       `0 0 ${pct}%`,
                  background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                  height:     '100%',
                }}
              />
            );
          })}
        </motion.div>
      </div>

      {/* Legend */}
      <div
        style={{
          display:   'flex',
          flexWrap:  'wrap',
          gap:       'var(--space-3)',
          marginTop: 'var(--space-3)',
        }}
      >
        {distribution.map((agent, i) => (
          <div
            key={agent.agent_id}
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        'var(--space-2)',
            }}
          >
            {/* Colour dot */}
            <span
              aria-hidden="true"
              style={{
                display:      'inline-block',
                width:        '8px',
                height:       '8px',
                borderRadius: 'var(--radius-full)',
                background:   SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                flexShrink:   0,
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-secondary)',
              }}
            >
              {agent.full_name}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                color:      'var(--theme-text-primary)',
              }}
            >
              {formatCompact(agent.lead_count)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

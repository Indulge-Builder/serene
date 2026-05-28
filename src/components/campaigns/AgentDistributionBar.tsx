'use client';

import { motion } from 'framer-motion';
import { formatCompact } from '@/lib/utils/numbers';
import type { AgentDistributionRow } from '@/lib/types/database';

// Segment colour cycle — CSS tokens only, no hex
const SEGMENT_COLORS = [
  'var(--theme-accent)',
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
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

      {/* Stacked bar — h-2, radius-full, overflow-hidden */}
      <div
        style={{
          display:      'flex',
          height:       '8px',
          borderRadius: 'var(--radius-full)',
          overflow:     'hidden',
          background:   'var(--theme-paper-subtle)',
        }}
      >
        {distribution.map((agent, i) => {
          const pct = (agent.lead_count / total) * 100;
          return (
            <motion.div
              key={agent.agent_id}
              layoutId={`dist-seg-${agent.agent_id}`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              style={{
                background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                height:     '100%',
                flexShrink: 0,
              }}
            />
          );
        })}
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

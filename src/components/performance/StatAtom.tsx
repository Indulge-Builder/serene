'use client';

import { m as motion } from 'framer-motion';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

// Semantic stat-card palettes — shared by AgentDetailPanel and DomainOverviewPanel.
export const STAT_PALETTES = [
  { bg: 'var(--color-success-light)', border: 'var(--color-success)', label: 'var(--color-success-text)', value: 'var(--theme-text-primary)' },
  { bg: 'var(--color-info-light)',    border: 'var(--color-info)',    label: 'var(--color-info-text)',    value: 'var(--theme-text-primary)' },
  { bg: 'var(--color-warning-light)', border: 'var(--color-warning)', label: 'var(--color-warning-text)', value: 'var(--theme-text-primary)' },
  { bg: 'var(--color-neutral-light)', border: 'var(--color-neutral)', label: 'var(--theme-text-secondary)', value: 'var(--theme-text-primary)' },
] as const;

export type StatAtomProps = {
  label:        string;
  value:        string;
  paletteIndex: number;
  delay?:       number;
};

export function StatAtom({ label, value, paletteIndex, delay = 0 }: StatAtomProps) {
  const p = STAT_PALETTES[paletteIndex % STAT_PALETTES.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, delay: delay / 1000, ease: EASE_OUT_EXPO }}
      style={{
        flex:           '1 1 0',
        display:        'flex',
        flexDirection:  'column',
        justifyContent: 'space-between',
        gap:            'var(--space-2)',
        padding:        'var(--space-3) var(--space-4)',
        background:     p.bg,
        borderRadius:   'var(--radius-lg)',
        border:         `1px solid ${p.border}`,
        minWidth:       0,
        overflow:       'hidden',
      }}
    >
      <span
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-medium)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color:         p.label,
          lineHeight:    1,
          whiteSpace:    'nowrap',
          overflow:      'hidden',
          textOverflow:  'ellipsis',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily:         'var(--font-mono)',
          fontSize:           'var(--text-xl)',
          fontWeight:         'var(--weight-normal)',
          fontVariantNumeric: 'tabular-nums',
          color:              p.value,
          lineHeight:         '1',
          whiteSpace:         'nowrap',
        }}
      >
        {value}
      </span>
    </motion.div>
  );
}

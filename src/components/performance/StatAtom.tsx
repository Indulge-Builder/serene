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
  /** When provided, the tile becomes a tap target (pressable button + hover lift).
   *  When absent, renders today's exact static motion.div (DomainOverviewPanel). */
  onClick?:     () => void;
};

export function StatAtom({ label, value, paletteIndex, delay = 0, onClick }: StatAtomProps) {
  const p = STAT_PALETTES[paletteIndex % STAT_PALETTES.length];

  // Pressable variant — only when a handler is passed (AgentDetailPanel tiles).
  // motion.button so the pressable affordance composes the same .serene-pressable
  // mechanism used by the deck's DeckTile; transform/opacity-only motion (V).
  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        className="serene-pressable serene-touch"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, delay: delay / 1000, ease: EASE_OUT_EXPO }}
        style={{
          flex:           '1 1 140px',
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
          cursor:         'pointer',
          textAlign:      'left',
          boxShadow:      'var(--shadow-1)',
          transition:     'box-shadow var(--duration-fast) var(--ease-in-out)',
        }}
      >
        <StatAtomBody label={label} value={value} palette={p} />
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, delay: delay / 1000, ease: EASE_OUT_EXPO }}
      style={{
        flex:           '1 1 140px',
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
      <StatAtomBody label={label} value={value} palette={p} />
    </motion.div>
  );
}

// Shared inner content — identical label + value spans for both the static and
// pressable variants, so the tap target never drifts from the static tile.
function StatAtomBody({
  label,
  value,
  palette,
}: {
  label:   string;
  value:   string;
  palette: (typeof STAT_PALETTES)[number];
}) {
  return (
    <>
      <span
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-medium)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color:         palette.label,
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
          color:              palette.value,
          lineHeight:         '1',
          whiteSpace:         'nowrap',
        }}
      >
        {value}
      </span>
    </>
  );
}

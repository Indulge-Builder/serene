'use client';

import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

export function PerformanceRosterEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={{
        position:       'relative',
        minHeight:      'min(320px, 40vh)',
        borderRadius:   'var(--radius-lg)',
        border:         '1px solid var(--theme-paper-border)',
        background:     'var(--theme-paper-subtle)',
        boxShadow:      'var(--shadow-1)',
        overflow:       'hidden',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            'var(--space-5)',
        padding:        'var(--space-8)',
      }}
    >
      {/* Ambient wash — decorative only */}
      <div
        aria-hidden="true"
        style={{
          position:        'absolute',
          inset:           0,
          pointerEvents:   'none',
          background:      `
            radial-gradient(ellipse 55% 45% at 18% 22%, color-mix(in srgb, var(--theme-accent) 9%, transparent), transparent 70%),
            radial-gradient(ellipse 50% 40% at 82% 78%, color-mix(in srgb, var(--theme-accent) 6%, transparent), transparent 72%)
          `,
        }}
      />

      <div
        style={{
          position:       'relative',
          zIndex:         1,
          width:          '64px',
          height:         '64px',
          borderRadius:   'var(--radius-xl)',
          background:     'var(--theme-paper)',
          border:         '1px solid var(--theme-paper-border)',
          boxShadow:      'var(--shadow-1)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <BarChart2
          style={{
            width:       '28px',
            height:      '28px',
            strokeWidth: 1.5,
            color:       'var(--theme-accent)',
          }}
        />
      </div>

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '280px' }}>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-xl)',
            color:      'var(--theme-text-primary)',
            margin:     '0 0 var(--space-2)',
            fontWeight: 'var(--weight-normal)',
            lineHeight: 1.3,
          }}
        >
          Select an agent.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-tertiary)',
            margin:     0,
            lineHeight: 'var(--leading-relaxed)',
          }}
        >
          Choose someone from the roster to see their performance for this period.
        </p>
      </div>
    </motion.div>
  );
}

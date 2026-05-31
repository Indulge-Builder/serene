'use client';

import type { ReactNode } from 'react';

interface GiaDaySectionProps {
  label:    string;
  children: ReactNode;
}

/**
 * GiaDaySection — date-group header for the Gia Tasks tab.
 * Visual weight matches the date section headers in MyTasksCalendarView.
 */
export function GiaDaySection({ label, children }: GiaDaySectionProps) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div
        style={{
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-medium)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color:         'var(--theme-text-tertiary)',
          paddingBottom: 'var(--space-2)',
          marginBottom:  'var(--space-1)',
          borderBottom:  '1px solid var(--theme-paper-border)',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

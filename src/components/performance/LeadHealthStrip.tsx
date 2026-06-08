'use client';

import Link from 'next/link';
import type { LeadHealthBreakdown } from '@/lib/services/performance-service';

type Props = {
  healthy:         number;
  needs_attention: number;
  at_risk:         number;
  agentId:         string;
};

type Tier = {
  key:   keyof LeadHealthBreakdown;
  label: string;
  bg:    string;
  text:  string;
  dot:   string;
};

const TIERS: Tier[] = [
  {
    key:   'at_risk',
    label: 'At Risk',
    bg:    'var(--color-danger-light)',
    text:  'var(--color-danger-text)',
    dot:   'var(--color-danger-text)',
  },
  {
    key:   'needs_attention',
    label: 'Needs Attention',
    bg:    'var(--color-warning-light)',
    text:  'var(--color-warning-text)',
    dot:   'var(--color-warning-text)',
  },
  {
    key:   'healthy',
    label: 'Healthy',
    bg:    'var(--color-success-light)',
    text:  'var(--color-success-text)',
    dot:   'var(--color-success-text)',
  },
];

export function LeadHealthStrip({ healthy, needs_attention, at_risk, agentId }: Props) {
  const counts: LeadHealthBreakdown = { healthy, needs_attention, at_risk };

  return (
    <div>
      {/* Section micro-label — V-10 pattern */}
      <p
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      '10px',
          fontWeight:    'var(--weight-medium)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color:         'var(--theme-text-tertiary)',
          margin:        '0 0 var(--space-3) 0',
        }}
      >
        Lead Health
      </p>

      {/* Chip row — inline, pill-shaped, no coloured borders on the container */}
      <div
        style={{
          display:       'flex',
          flexWrap:      'wrap',
          gap:           'var(--space-2)',
          padding:       'var(--space-3) var(--space-4)',
          borderRadius:  'var(--radius-full)',
          background:    'var(--theme-paper-subtle)',
          border:        '1px solid var(--theme-paper-border)',
        }}
      >
        {TIERS.map(({ key, label, bg, text, dot }) => {
          const count = counts[key];
          const href  = `/leads?agent_id=${agentId}&health=${key}`;

          return (
            <Link
              key={key}
              href={href}
              style={{
                display:        'inline-flex',
                alignItems:     'center',
                gap:            'var(--space-1)',
                padding:        '4px 10px 4px 8px',
                borderRadius:   'var(--radius-full)',
                background:     bg,
                color:          text,
                textDecoration: 'none',
                fontFamily:     'var(--font-sans)',
                fontSize:       'var(--text-xs)',
                fontWeight:     'var(--weight-medium)',
                transition:     'opacity var(--duration-fast) var(--ease-in-out)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.8'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              {/* Status dot — 6px, same tier colour */}
              <span
                aria-hidden="true"
                style={{
                  display:      'inline-block',
                  width:        '6px',
                  height:       '6px',
                  borderRadius: 'var(--radius-full)',
                  background:   dot,
                  flexShrink:   0,
                }}
              />
              <span>{label}</span>
              <span
                style={{
                  fontFamily:  'var(--font-mono)',
                  fontSize:    'var(--text-2xs)',
                  marginLeft:  '2px',
                  opacity:     0.85,
                }}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

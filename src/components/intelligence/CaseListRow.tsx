'use client';

// Call Intelligence — single service_cases LIST ROW (the /helpdesk results
// list, 2026-06-12 — replaced the 3-column card grid for consistency with the
// other list pages). Important info only: icon tile, title (+ featured star),
// one-line summary, category + location, chevron. Clicking opens
// CaseDetailModal with everything saved on the case. Display-only; entrance
// stagger + hover lift follow the card-list pattern (CampaignCard reference).

import { m as motion } from 'framer-motion';
import { ChevronRight, Star } from 'lucide-react';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import { getCategoryIcon } from './category-icons';
import { CategoryTag } from './CategoryTag';
import type { ServiceCase } from '@/lib/services/intelligence-service';

type CaseListRowProps = {
  serviceCase: ServiceCase;
  index?:      number;
  onClick:     () => void;
};

export function CaseListRow({ serviceCase: c, index = 0, onClick }: CaseListRowProps) {
  const location = [c.city, c.country].filter(Boolean).join(', ');
  const Icon = getCategoryIcon(c.category);

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      aria-label={`View details: ${c.title}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.28,
        delay:    Math.min(index * 0.06, 0.32),
        ease:     EASE_OUT_EXPO,
      }}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-4)',
        padding:      'var(--space-3) var(--space-4)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-1)',
        cursor:       'pointer',
        transition:   'box-shadow var(--duration-base) var(--ease-in-out), transform var(--duration-base) var(--ease-in-out)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-2)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-1)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Leading icon tile — the row's "thumbnail" */}
      <span
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          '36px',
          height:         '36px',
          borderRadius:   'var(--radius-sm)',
          background:     'var(--theme-accent-surface)',
          color:          'var(--theme-accent)',
          flexShrink:     0,
        }}
      >
        <Icon size={16} strokeWidth={1.5} />
      </span>

      {/* Title + one-line summary */}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <span
            style={{
              fontFamily:   'var(--font-serif)',
              fontSize:     'var(--text-sm)',
              fontWeight:   'var(--weight-medium)',
              color:        'var(--theme-text-primary)',
              whiteSpace:   'nowrap',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              minWidth:     0,
            }}
          >
            {c.title}
          </span>
          {c.is_featured && (
            <Star
              size={11}
              strokeWidth={1.5}
              aria-label="Featured"
              style={{
                color:      'var(--theme-accent)',
                fill:       'var(--theme-accent)',
                flexShrink: 0,
              }}
            />
          )}
        </span>
        <span
          style={{
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-xs)',
            color:        'var(--theme-text-tertiary)',
            whiteSpace:   'nowrap',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {c.summary}
        </span>
      </span>

      {/* Trailing cluster — category, location, affordance */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
        <CategoryTag category={c.category} />
        {location && (
          <span
            style={{
              fontFamily:    'var(--font-sans)',
              fontSize:      'var(--text-2xs)',
              color:         'var(--theme-text-tertiary)',
              letterSpacing: 'var(--tracking-wide)',
              whiteSpace:    'nowrap',
              overflow:      'hidden',
              textOverflow:  'ellipsis',
              maxWidth:      '140px',
            }}
          >
            {location}
          </span>
        )}
        <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--theme-text-tertiary)' }} />
      </span>
    </motion.div>
  );
}

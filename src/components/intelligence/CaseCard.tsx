'use client';

// Call Intelligence — single service_cases card. Used by both surfaces:
// the /helpdesk grid (showTags) and the dossier ServiceInterestCard.
// Display-only; entrance stagger via the index prop (spec §8: 0.28s,
// EASE_OUT_EXPO, 0.06s per card). Hover lift follows the CampaignCard
// card-list pattern (CSS transition + inline handlers).

import { m as motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import { getServiceCategoryLabel } from '@/lib/constants/interests';
import type { ServiceCase } from '@/lib/services/intelligence-service';

type CaseCardProps = {
  serviceCase: ServiceCase;
  index?:      number;
  showTags?:   boolean;
};

export function CaseCard({ serviceCase: c, index = 0, showTags = false }: CaseCardProps) {
  const location = [c.city, c.country].filter(Boolean).join(', ');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.28,
        delay:    Math.min(index * 0.06, 0.32),
        ease:     EASE_OUT_EXPO,
      }}
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           'var(--space-2)',
        padding:       'var(--space-4) var(--space-5)',
        background:    'var(--theme-paper)',
        border:        '1px solid var(--theme-paper-border)',
        borderRadius:  'var(--radius-md)',
        boxShadow:     'var(--shadow-1)',
        transition:    'box-shadow var(--duration-base) var(--ease-in-out), transform var(--duration-base) var(--ease-in-out)',
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
      {/* Category pill + location row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span
          style={{
            display:       'inline-flex',
            alignItems:    'center',
            padding:       '2px 8px',
            borderRadius:  'var(--radius-full)',
            background:    'var(--theme-accent-surface)',
            color:         'var(--theme-accent)',
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-medium)',
            letterSpacing: 'var(--tracking-wide)',
            whiteSpace:    'nowrap',
          }}
        >
          {getServiceCategoryLabel(c.category)}
        </span>
        {location && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-2xs)',
              color:      'var(--theme-text-tertiary)',
              letterSpacing: 'var(--tracking-wide)',
              whiteSpace: 'nowrap',
              overflow:   'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {location}
          </span>
        )}
      </div>

      {/* Title — the claim line */}
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize:   'var(--text-base)',
          fontWeight: 'var(--weight-medium)',
          color:      'var(--theme-text-primary)',
          lineHeight: 1.35,
          margin:     0,
        }}
      >
        {c.title}
      </p>

      {/* Summary — 2-line truncate */}
      <p
        style={{
          fontFamily:      'var(--font-sans)',
          fontSize:        'var(--text-sm)',
          color:           'var(--theme-text-secondary)',
          lineHeight:      1.5,
          margin:          0,
          display:         '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow:        'hidden',
        }}
      >
        {c.summary}
      </p>

      {c.outcome_note && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            fontStyle:  'italic',
            color:      'var(--theme-text-tertiary)',
            lineHeight: 1.5,
            margin:     0,
          }}
        >
          {c.outcome_note}
        </p>
      )}

      {showTags && c.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
          {c.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              style={{
                padding:      '1px 7px',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-paper-subtle)',
                border:       '1px solid var(--theme-paper-border)',
                fontFamily:   'var(--font-mono)',
                fontSize:     'var(--text-2xs)',
                color:        'var(--theme-text-tertiary)',
                whiteSpace:   'nowrap',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

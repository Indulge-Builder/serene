'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { DEAL_TYPE_LABELS, DEAL_DURATION_LABELS } from '@/lib/constants/deal-types';
import { formatDate } from '@/lib/utils/dates';
import { formatCurrency } from '@/lib/utils/numbers';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { DealWithAssignee } from '@/lib/services/deals-service';

type DealCardProps = {
  deal:  DealWithAssignee;
  index: number;
};

function DomainBadge({ domain }: { domain: string }) {
  const label = DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ?? domain;
  return (
    <span
      className="status-pill"
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        padding:       '2px 8px',
        borderRadius:  'var(--radius-full)',
        background:    'var(--theme-paper-subtle)',
        border:        '1px solid var(--theme-paper-border)',
        fontFamily:    'var(--font-sans)',
        fontSize:      'var(--text-2xs)',
        fontWeight:    'var(--weight-medium)',
        color:         'var(--theme-text-secondary)',
        letterSpacing: 'var(--tracking-wide)',
        whiteSpace:    'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function DealTypeChip({ dealType, dealDuration }: { dealType: string; dealDuration: string | null }) {
  const label    = DEAL_TYPE_LABELS[dealType as keyof typeof DEAL_TYPE_LABELS] ?? dealType;
  const isMember = dealType === 'membership';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      <span
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          padding:      '2px 10px',
          borderRadius: 'var(--radius-full)',
          background:   isMember ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
          border:       isMember
            ? '1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)'
            : '1px solid var(--theme-paper-border)',
          fontFamily:   'var(--font-sans)',
          fontSize:     'var(--text-xs)',
          fontWeight:   'var(--weight-medium)',
          color:        isMember ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
          whiteSpace:   'nowrap',
        }}
      >
        {label}
      </span>
      {isMember && dealDuration && (
        <span
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            padding:      '2px 8px',
            borderRadius: 'var(--radius-full)',
            background:   'var(--theme-paper-subtle)',
            border:       '1px solid var(--theme-paper-border)',
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-xs)',
            fontWeight:   'var(--weight-normal)',
            color:        'var(--theme-text-tertiary)',
            whiteSpace:   'nowrap',
          }}
        >
          {DEAL_DURATION_LABELS[dealDuration as keyof typeof DEAL_DURATION_LABELS] ?? dealDuration}
        </span>
      )}
    </div>
  );
}

export function DealCard({ deal, index }: DealCardProps) {
  const staggerDelay = Math.min(index * 80, 320);
  const href = `/leads/${deal.slug ?? deal.id}`;

  const fullName = [deal.first_name, deal.last_name].filter(Boolean).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay:    staggerDelay / 1000,
        ease:     EASE_OUT_EXPO,
      }}
    >
      <Link
        href={href}
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            'var(--space-4)',
          padding:        'var(--space-4) var(--space-5)',
          background:     'var(--theme-paper)',
          border:         '1px solid var(--theme-paper-border)',
          borderRadius:   'var(--radius-md)',
          boxShadow:      'var(--shadow-1)',
          textDecoration: 'none',
          transition:     'box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)',
          outline:        'none',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-2)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-1)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-focus)';
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-1)';
        }}
      >
        {/* Left zone — lead name + phone + domain badge */}
        <div style={{ flex: '0 0 auto', minWidth: '180px', maxWidth: '240px' }}>
          <p
            style={{
              fontFamily:   'var(--font-serif)',
              fontSize:     'var(--text-base)',
              fontWeight:   'var(--weight-normal)',
              fontStyle:    'italic',
              color:        'var(--theme-text-primary)',
              margin:       '0 0 var(--space-1)',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}
          >
            {fullName}
          </p>
          {deal.phone && (
            <p
              style={{
                fontFamily:   'var(--font-mono)',
                fontSize:     'var(--text-sm)',
                color:        'var(--theme-text-secondary)',
                margin:       '0 0 var(--space-2)',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}
            >
              {deal.phone}
            </p>
          )}
          <DomainBadge domain={deal.domain} />
        </div>

        {/* Centre zone — deal type chip + duration */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          {deal.deal_type ? (
            <DealTypeChip dealType={deal.deal_type} dealDuration={deal.deal_duration} />
          ) : (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>—</span>
          )}
        </div>

        {/* Right zone — deal amount + won date + agent name */}
        <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
          <p
            style={{
              fontFamily:         'var(--font-mono)',
              fontSize:           'var(--text-2xl)',
              fontWeight:         'var(--weight-normal)',
              fontVariantNumeric: 'tabular-nums',
              color:              'var(--theme-accent)',
              margin:             '0 0 var(--space-1)',
              lineHeight:         1,
              whiteSpace:         'nowrap',
            }}
          >
            {deal.deal_amount !== null ? formatCurrency(deal.deal_amount) : '—'}
          </p>
          {deal.status_changed_at && (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
                margin:     '0 0 var(--space-1)',
                whiteSpace: 'nowrap',
              }}
            >
              Won {formatDate(deal.status_changed_at, 'dd MMM yyyy')}
            </p>
          )}
          {deal.assignee?.full_name && (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-secondary)',
                margin:     0,
                whiteSpace: 'nowrap',
              }}
            >
              {deal.assignee.full_name}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

'use client';

import Link from 'next/link';
import { m as motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { DEAL_TYPE_LABELS, DEAL_DURATION_LABELS } from '@/lib/constants/deal-types';
import { formatCurrency } from '@/lib/utils/numbers';
import { formatDate } from '@/lib/utils/dates';
import { BASE_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { Deal } from '@/lib/types/database';

// ─────────────────────────────────────────────
// LeadDealCard — dossier-only summary of the deal a won lead generated.
//
// 'use client' is required for the Framer Motion fade-in entrance. Wraps the
// whole card in a Link to /deals (the deals page has no per-deal route —
// /deals is the correct target).
//
// NOT to be confused with DealCard (src/components/deals/DealCard.tsx) — that is
// the deals-list row. This is a distinct dossier card: different shape, link
// target, and content density. Do not import or extend DealCard here.
// ─────────────────────────────────────────────

type LeadDealCardProps = {
  deal: Deal;
};

export function LeadDealCard({ deal }: LeadDealCardProps) {
  const typeLabel = DEAL_TYPE_LABELS[deal.deal_type] ?? deal.deal_type;
  const isMembership = deal.deal_type === 'membership';
  const durationLabel =
    deal.deal_duration ? (DEAL_DURATION_LABELS[deal.deal_duration] ?? deal.deal_duration) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
    >
    <Link
      href="/deals"
      className="lead-deal-card"
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            'var(--space-5)',
        flexWrap:       'wrap',
        padding:        'var(--space-5) var(--space-6)',
        background:     'var(--theme-paper-subtle)',
        border:         '1px solid var(--theme-paper-border)',
        borderRadius:   'var(--radius-lg)',
        boxShadow:      'var(--shadow-1)',
        textDecoration: 'none',
        transition:     'background var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {/* Left zone — trophy + "Closed Deal" label */}
      <div
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        'var(--space-3)',
          flexShrink: 0,
        }}
      >
        <Trophy
          size={20}
          strokeWidth={1.5}
          style={{ color: 'var(--theme-accent)', flexShrink: 0 }}
          aria-hidden
        />
        <span
          className="label-micro"
          style={{ color: 'var(--theme-text-secondary)', margin: 0 }}
        >
          Closed Deal
        </span>
      </div>

      {/* Center zone — deal amount */}
      <div style={{ flex: 1, minWidth: '140px' }}>
        <span
          style={{
            fontFamily:         'var(--font-mono)',
            fontSize:           'var(--text-2xl)',
            fontWeight:         'var(--weight-normal)',
            fontVariantNumeric: 'tabular-nums',
            color:              'var(--theme-accent)',
            lineHeight:         1,
            whiteSpace:         'nowrap',
          }}
        >
          {formatCurrency(deal.deal_amount)}
        </span>
      </div>

      {/* Right zone — type chip + duration chip + won date */}
      <div
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        'var(--space-3)',
          flexWrap:   'wrap',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            padding:      '2px 10px',
            borderRadius: 'var(--radius-full)',
            background:   isMembership ? 'var(--theme-accent-surface)' : 'var(--theme-paper)',
            border:       isMembership
              ? '1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)'
              : '1px solid var(--theme-paper-border)',
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-xs)',
            fontWeight:   'var(--weight-medium)',
            color:        isMembership ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
            whiteSpace:   'nowrap',
          }}
        >
          {typeLabel}
        </span>

        {isMembership && durationLabel && (
          <span
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              padding:      '2px 8px',
              borderRadius: 'var(--radius-full)',
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-xs)',
              fontWeight:   'var(--weight-normal)',
              color:        'var(--theme-text-tertiary)',
              whiteSpace:   'nowrap',
            }}
          >
            {durationLabel}
          </span>
        )}

        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-tertiary)',
            whiteSpace: 'nowrap',
          }}
        >
          Won {formatDate(deal.won_at, 'dd MMM yyyy')}
        </span>
      </div>

      {/* Bottom-right — "View in Deals →" affordance */}
      <span
        className="lead-deal-card__link"
        style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-sans)',
          fontSize:   'var(--text-xs)',
          color:      'var(--theme-text-tertiary)',
          whiteSpace: 'nowrap',
        }}
      >
        View in Deals →
      </span>

      <style>{`
        .lead-deal-card:hover {
          background: var(--theme-paper);
          box-shadow: var(--shadow-2);
        }
        .lead-deal-card:hover .lead-deal-card__link {
          color: var(--theme-accent);
          text-decoration: underline;
        }
      `}</style>
    </Link>
    </motion.div>
  );
}

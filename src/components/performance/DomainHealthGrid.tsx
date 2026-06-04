// Domain health overview grid — renders one card per domain.
// Pure presentational: no data fetching, no 'use client' required.
// Layout: 2-col grid for 2+ cards; 1-col for a single-domain (manager) view.

import { DOMAIN_LABELS } from '@/lib/constants/domains';
import type { DomainHealthCard } from '@/lib/types/index';
import type { PerformancePeriod } from '@/lib/services/performance-service';

// ─────────────────────────────────────────────
// Semantic health pip + badge helpers
// ─────────────────────────────────────────────

function conversionPipColor(rate: number | null): string {
  if (rate === null) return 'var(--theme-text-tertiary)';
  if (rate >= 40)   return 'var(--color-success)';
  if (rate >= 15)   return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function conversionBadgeBg(rate: number | null): string {
  if (rate === null) return 'var(--theme-paper-subtle)';
  if (rate >= 40)   return 'var(--color-success-light)';
  if (rate >= 15)   return 'var(--color-warning-light)';
  return 'var(--color-danger-light)';
}

function conversionBadgeText(rate: number | null): string {
  if (rate === null) return 'var(--theme-text-tertiary)';
  if (rate >= 40)   return 'var(--color-success-text)';
  if (rate >= 15)   return 'var(--color-warning-text)';
  return 'var(--color-danger-text)';
}

// ─────────────────────────────────────────────
// Single card
// ─────────────────────────────────────────────

function DomainCard({ card }: { card: DomainHealthCard }) {
  const pipColor   = conversionPipColor(card.conversionRate);
  const badgeBg    = conversionBadgeBg(card.conversionRate);
  const badgeText  = conversionBadgeText(card.conversionRate);
  const pipeline   = card.inDiscussion + card.nurturing;
  const rateLabel  = card.conversionRate !== null
    ? `${card.conversionRate.toFixed(0)}%`
    : '—';

  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        padding:      'var(--space-5)',
        display:      'flex',
        flexDirection: 'column',
        gap:          'var(--space-4)',
        position:     'relative',
      }}
    >
      {/* Header row: eyebrow + health pip */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            'var(--space-2)',
        }}
      >
        <span
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
          }}
        >
          {DOMAIN_LABELS[card.domain] ?? card.domain}
        </span>

        {/* Health pip */}
        <div
          style={{
            width:        '8px',
            height:       '8px',
            borderRadius: 'var(--radius-full)',
            background:   pipColor,
            flexShrink:   0,
          }}
          aria-hidden="true"
        />
      </div>

      {/* Primary stat: Leads Won */}
      <div>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize:   'var(--text-3xl)',
            fontWeight: 'var(--weight-light)',
            color:      'var(--theme-text-primary)',
            margin:     0,
            lineHeight: 1,
          }}
        >
          {card.leadsWon}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-tertiary)',
            margin:     '4px 0 0',
          }}
        >
          leads won
        </p>
      </div>

      {/* Secondary row: Calls + Pipeline */}
      <div
        style={{
          display: 'flex',
          gap:     'var(--space-5)',
        }}
      >
        <div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              color:      'var(--theme-text-primary)',
              margin:     0,
            }}
          >
            {card.callsLogged}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-2xs)',
              color:      'var(--theme-text-tertiary)',
              margin:     '2px 0 0',
            }}
          >
            calls logged
          </p>
        </div>

        <div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              color:      'var(--theme-text-primary)',
              margin:     0,
            }}
          >
            {pipeline}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-2xs)',
              color:      'var(--theme-text-tertiary)',
              margin:     '2px 0 0',
            }}
          >
            active pipeline
          </p>
        </div>
      </div>

      {/* Conversion rate badge */}
      <div
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          'var(--space-1)',
          padding:      '3px 8px',
          borderRadius: 'var(--radius-full)',
          background:   badgeBg,
          alignSelf:    'flex-start',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            fontWeight: 'var(--weight-semibold)',
            color:      badgeText,
          }}
        >
          {rateLabel}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            color:      badgeText,
            opacity:    0.75,
          }}
        >
          conversion
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Grid
// ─────────────────────────────────────────────

type Props = {
  cards:  DomainHealthCard[];
  period: PerformancePeriod;
};

export function DomainHealthGrid({ cards }: Props) {
  if (cards.length === 0) {
    return (
      <div
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          padding:      'var(--space-12) var(--space-6)',
          textAlign:    'center',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-lg)',
            fontWeight: 'var(--weight-light)',
            color:      'var(--theme-text-tertiary)',
            margin:     0,
          }}
        >
          No domain data for this period.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: cards.length === 1 ? '1fr' : 'repeat(2, 1fr)',
        gap:                 'var(--space-4)',
      }}
    >
      {cards.map((card) => (
        <DomainCard key={card.domain} card={card} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Skeleton — same 2×2 grid, shimmer blocks
// ─────────────────────────────────────────────

function DomainCardSkeleton({ cols }: { cols: number }) {
  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        padding:      'var(--space-5)',
        display:      'flex',
        flexDirection: 'column',
        gap:          'var(--space-4)',
        gridColumn:   cols === 1 ? '1 / -1' : undefined,
      }}
    >
      {/* Header: eyebrow + pip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="skeleton" style={{ width: '72px', height: '10px', borderRadius: 'var(--radius-xs)' }} />
        <div className="skeleton" style={{ width: '8px',  height: '8px',  borderRadius: 'var(--radius-full)' }} />
      </div>
      {/* Primary stat */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div className="skeleton" style={{ width: '56px', height: '36px', borderRadius: 'var(--radius-xs)' }} />
        <div className="skeleton" style={{ width: '64px', height: '10px', borderRadius: 'var(--radius-xs)' }} />
      </div>
      {/* Secondary */}
      <div style={{ display: 'flex', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="skeleton" style={{ width: '40px', height: '14px', borderRadius: 'var(--radius-xs)' }} />
          <div className="skeleton" style={{ width: '60px', height: '10px', borderRadius: 'var(--radius-xs)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="skeleton" style={{ width: '40px', height: '14px', borderRadius: 'var(--radius-xs)' }} />
          <div className="skeleton" style={{ width: '72px', height: '10px', borderRadius: 'var(--radius-xs)' }} />
        </div>
      </div>
      {/* Badge */}
      <div className="skeleton" style={{ width: '80px', height: '22px', borderRadius: 'var(--radius-full)' }} />
    </div>
  );
}

export function DomainHealthGridSkeleton({ count = 4 }: { count?: number }) {
  const cols = count === 1 ? 1 : 2;
  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap:                 'var(--space-4)',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <DomainCardSkeleton key={i} cols={cols} />
      ))}
    </div>
  );
}

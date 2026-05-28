'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { formatCompact } from '@/lib/utils/numbers';
import type { CampaignMetrics } from '@/lib/types/database';
import { DOMAIN_LABELS } from '@/lib/constants/domains';

type CampaignCardProps = {
  campaign: CampaignMetrics;
  index:    number;
};

// ─────────────────────────────────────────────
// Metric pill
// ─────────────────────────────────────────────

type PillVariant = 'accent' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const PILL_STYLES: Record<PillVariant, { bg: string; color: string; border: string }> = {
  accent:  { bg: 'var(--theme-accent-surface)',  color: 'var(--theme-accent)',        border: 'var(--theme-accent-surface)'    },
  success: { bg: 'var(--color-success-light)',   color: 'var(--color-success-text)',  border: 'var(--color-success-light)'     },
  info:    { bg: 'var(--color-info-light)',      color: 'var(--color-info-text)',     border: 'var(--color-info-light)'        },
  warning: { bg: 'var(--color-warning-light)',   color: 'var(--color-warning-text)', border: 'var(--color-warning-light)'     },
  danger:  { bg: 'var(--color-danger-light)',    color: 'var(--color-danger-text)',  border: 'var(--color-danger-light)'      },
  neutral: { bg: 'var(--theme-paper-subtle)',    color: 'var(--theme-text-secondary)', border: 'var(--theme-paper-border)'    },
};

function MetricPill({
  count,
  label,
  variant,
}: {
  count:   number;
  label:   string;
  variant: PillVariant;
}) {
  const s = PILL_STYLES[variant];
  return (
    <span
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        gap:             'var(--space-1)',
        background:      s.bg,
        color:           s.color,
        border:          `1px solid ${s.border}`,
        borderRadius:    'var(--radius-full)',
        padding:         '2px 8px',
        fontSize:        'var(--text-xs)',
        fontFamily:      'var(--font-sans)',
        fontWeight:      'var(--weight-medium)',
        whiteSpace:      'nowrap',
        lineHeight:      '1.4',
      }}
    >
      <span style={{ fontWeight: 'var(--weight-semibold)' }}>{formatCompact(count)}</span>
      <span style={{ fontSize: 'var(--text-2xs)', opacity: 0.75 }}>{label}</span>
    </span>
  );
}

// ─────────────────────────────────────────────
// Domain badge
// ─────────────────────────────────────────────

function DomainBadge({ domain }: { domain: string }) {
  const label = DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ?? domain;
  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        padding:      '2px 8px',
        borderRadius: 'var(--radius-full)',
        background:   'var(--theme-paper-subtle)',
        border:       '1px solid var(--theme-paper-border)',
        fontFamily:   'var(--font-sans)',
        fontSize:     'var(--text-2xs)',
        fontWeight:   'var(--weight-medium)',
        color:        'var(--theme-text-secondary)',
        letterSpacing:'var(--tracking-wide)',
        whiteSpace:   'nowrap',
      }}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────
// CampaignCard
// ─────────────────────────────────────────────

export function CampaignCard({ campaign, index }: CampaignCardProps) {
  const router = useRouter();

  const encodedName = encodeURIComponent(campaign.campaign_name);

  function handleClick() {
    router.push(`/campaigns/${encodedName}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  const staggerDelay = Math.min(index * 80, 320);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay:    staggerDelay / 1000,
        ease:     [0.16, 1, 0.3, 1],
      }}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-4)',
        padding:      'var(--space-4) var(--space-5)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        cursor:       'pointer',
        transition:   'box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)',
        outline:      'none',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-2)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-1)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-focus)';
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-1)';
      }}
    >
      {/* Left: name + domain */}
      <div style={{ flex: '0 0 auto', minWidth: '200px', maxWidth: '280px' }}>
        <p
          style={{
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-sm)',
            fontWeight:   'var(--weight-semibold)',
            color:        'var(--theme-text-primary)',
            margin:       '0 0 var(--space-1)',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}
        >
          {campaign.campaign_name}
        </p>
        <DomainBadge domain={campaign.domain} />
      </div>

      {/* Right: metric pills */}
      <div
        style={{
          display:    'flex',
          flexWrap:   'wrap',
          gap:        'var(--space-2)',
          flex:       1,
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <MetricPill count={campaign.total_leads}  label="total"         variant="accent"  />
        <MetricPill count={campaign.won}           label="won"           variant="success" />
        <MetricPill count={campaign.in_discussion} label="in discussion" variant="info"    />
        <MetricPill count={campaign.nurturing}     label="nurturing"     variant="warning" />
        <MetricPill count={campaign.lost}          label="lost"          variant="danger"  />
        <MetricPill count={campaign.junk}          label="junk"          variant="neutral" />
        <MetricPill count={campaign.rnr}           label="RNR"           variant="neutral" />
      </div>
    </motion.div>
  );
}

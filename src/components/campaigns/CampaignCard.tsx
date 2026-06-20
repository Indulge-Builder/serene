'use client';

import Link from 'next/link';
import { m as motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/numbers';
import type { CampaignMetrics } from '@/lib/types/database';
import { DOMAIN_LABELS } from '@/lib/constants/domains';

type CampaignCardProps = {
  campaign:     CampaignMetrics;
  index:        number;
  /** null when no active range or no spend for this campaign — renders "—", never ₹0 */
  totalSpend?:  number | null;
  /** null when leadCount === 0 (or no range) — renders "—", never ₹0 */
  costPerLead?: number | null;
};

// ─────────────────────────────────────────────
// Domain badge
// ─────────────────────────────────────────────

function DomainBadge({ domain }: { domain: string }) {
  const label = DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ?? domain;
  return (
    <span
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
        flexShrink:    0,
      }}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────
// Hero datum — micro-label over value (labelled-datum pattern).
// value === null/undefined → "—" in tertiary (no range / no spend), never ₹0.
// ─────────────────────────────────────────────

function HeroDatum({
  label,
  value,
  empty,
  tone = 'primary',
}: {
  label:  string;
  value:  string;
  /** when true, the value renders in tertiary (the "—" / no-data look) */
  empty?: boolean;
  tone?:  'primary' | 'accent' | 'success' | 'danger';
}) {
  const TONE_COLOR: Record<NonNullable<typeof tone>, string> = {
    primary: 'var(--theme-text-primary)',
    accent:  'var(--theme-accent)',
    success: 'var(--color-success-text)',
    danger:  'var(--color-danger-text)',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', minWidth: 0 }}>
      <span
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
          whiteSpace:    'nowrap',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize:   'var(--text-lg)',
          fontWeight: 'var(--weight-semibold)',
          lineHeight: '1.1',
          color:      empty ? 'var(--theme-text-tertiary)' : TONE_COLOR[tone],
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Status datum — semantic dot + count + label.
// Replaces the 7 competing pills with a calm, scannable breakdown row.
// ─────────────────────────────────────────────

type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const DOT_COLOR: Record<StatusTone, string> = {
  success: 'var(--color-success)',
  info:    'var(--color-info)',
  warning: 'var(--color-warning)',
  danger:  'var(--color-danger)',
  neutral: 'var(--theme-text-tertiary)',
};

function StatusDatum({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone:  StatusTone;
}) {
  const muted = count === 0;
  return (
    <span
      style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        'var(--space-2)',
        whiteSpace: 'nowrap',
        opacity:    muted ? 0.45 : 1,
      }}
    >
      <span
        style={{
          width:        '6px',
          height:       '6px',
          borderRadius: 'var(--radius-full)',
          background:   DOT_COLOR[tone],
          flexShrink:   0,
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize:   'var(--text-sm)',
          fontWeight: 'var(--weight-semibold)',
          color:      'var(--theme-text-primary)',
        }}
      >
        {formatCompact(count)}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize:   'var(--text-xs)',
          color:      'var(--theme-text-secondary)',
        }}
      >
        {label}
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────
// CampaignCard
// ─────────────────────────────────────────────

// Card → detail navigation. encodeURIComponent is lossless — it round-trips a
// literal '+' (Meta "Advantage+" campaigns), '/', and spaces, all of which
// appear in real utm_campaign keys. The detail page decodes with
// decodeURIComponent. The old '+'→space scheme silently corrupted any key
// containing a literal '+' or '/' (see the "Campaign ID Encoding Contract" in
// the campaigns CLAUDE.md).
const MotionLink = motion.create(Link);

export function CampaignCard({
  campaign,
  index,
  totalSpend,
  costPerLead,
}: CampaignCardProps) {
  const staggerDelay = Math.min(index * 80, 320);

  const href = `/campaigns/${encodeURIComponent(campaign.campaign_name)}`;

  // Conversion = won ÷ total. Guard division by zero — empty look when no leads.
  const hasLeads       = campaign.total_leads > 0;
  const conversionRate = hasLeads ? campaign.won / campaign.total_leads : null;
  const conversionTone =
    conversionRate === null ? 'primary'
    : conversionRate >= 0.1 ? 'success'
    : conversionRate < 0.05 ? 'danger'
    :                         'primary';

  const hasSpend = totalSpend !== null && totalSpend !== undefined;
  const hasCpl   = costPerLead !== null && costPerLead !== undefined;

  return (
    <MotionLink
      href={href}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay:    staggerDelay / 1000,
        ease:     EASE_OUT_EXPO,
      }}
      style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            'var(--space-4)',
        padding:        'var(--space-5)',
        background:     'var(--theme-paper)',
        border:         '1px solid var(--theme-paper-border)',
        borderRadius:   'var(--radius-lg)',
        boxShadow:      'var(--shadow-1)',
        cursor:         'pointer',
        textDecoration: 'none',
        transition:     'box-shadow var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)',
        outline:        'none',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'var(--shadow-2)';
        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'var(--shadow-1)';
        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'var(--shadow-focus)';
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'var(--shadow-1)';
      }}
    >
        {/* Row 1 — identity: name + domain badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
          <p
            style={{
              flex:         '1 1 auto',
              minWidth:     0,
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-base)',
              fontWeight:   'var(--weight-semibold)',
              color:        'var(--theme-text-primary)',
              margin:       0,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}
          >
            {campaign.campaign_name}
          </p>
          <DomainBadge domain={campaign.domain} />
        </div>

        {/* Row 2 — hero stats strip: leads · conversion · spend · cost/lead.
            Flex-wrap so it never overflows on narrow viewports. */}
        <div
          style={{
            display:    'flex',
            flexWrap:   'wrap',
            gap:        'var(--space-6)',
            rowGap:     'var(--space-4)',
            alignItems: 'flex-start',
          }}
        >
          <HeroDatum label="Leads" value={formatCompact(campaign.total_leads)} tone="accent" />
          <HeroDatum
            label="Conversion"
            value={conversionRate === null ? '—' : formatPercent(conversionRate)}
            empty={conversionRate === null}
            tone={conversionTone}
          />
          <HeroDatum
            label="Spend"
            value={hasSpend ? formatCurrency(Math.round(totalSpend as number)) : '—'}
            empty={!hasSpend}
          />
          <HeroDatum
            label="Cost / Lead"
            value={hasCpl ? formatCurrency(Math.round(costPerLead as number)) : '—'}
            empty={!hasCpl}
          />
        </div>

        {/* Divider — neutral structural zone separator (not a semantic accent edge) */}
        <div style={{ height: '1px', background: 'var(--theme-paper-border)' }} />

        {/* Row 3 — status breakdown: semantic dots, scannable, wraps cleanly */}
        <div
          style={{
            display:    'flex',
            flexWrap:   'wrap',
            gap:        'var(--space-2) var(--space-5)',
            alignItems: 'center',
          }}
        >
          <StatusDatum count={campaign.won}           label="won"           tone="success" />
          <StatusDatum count={campaign.in_discussion} label="in discussion" tone="info"    />
          <StatusDatum count={campaign.nurturing}     label="nurturing"     tone="warning" />
          <StatusDatum count={campaign.lost}          label="lost"          tone="danger"  />
          <StatusDatum count={campaign.junk}          label="junk"          tone="neutral" />
          <StatusDatum count={campaign.rnr}           label="RNR"           tone="neutral" />
        </div>
      </MotionLink>
  );
}

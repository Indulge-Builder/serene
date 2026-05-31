'use client';

import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import { AdCreativeCarousel } from './AdCreativeCarousel';
import { beautifyCampaignTitle } from '@/lib/utils/campaigns';
import { formatCompact } from '@/lib/utils/numbers';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import type { CampaignMetrics } from '@/lib/types/database';
import type { AdCreative } from '@/lib/types/database';

interface CampaignPreviewModalProps {
  campaign:    CampaignMetrics;
  adCreatives: AdCreative[];
  open:        boolean;
  onClose:     () => void;
}

// ─────────────────────────────────────────────
// Metric pill — same visual as CampaignCard
// ─────────────────────────────────────────────

type PillVariant = 'accent' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const PILL_STYLES: Record<PillVariant, { bg: string; color: string }> = {
  accent:  { bg: 'var(--theme-accent-surface)',  color: 'var(--theme-accent)'          },
  success: { bg: 'var(--color-success-light)',   color: 'var(--color-success-text)'    },
  info:    { bg: 'var(--color-info-light)',      color: 'var(--color-info-text)'       },
  warning: { bg: 'var(--color-warning-light)',   color: 'var(--color-warning-text)'    },
  danger:  { bg: 'var(--color-danger-light)',    color: 'var(--color-danger-text)'     },
  neutral: { bg: 'var(--theme-paper-subtle)',    color: 'var(--theme-text-secondary)'  },
};

function MetricCell({ count, label, variant }: { count: number; label: string; variant: PillVariant }) {
  const s = PILL_STYLES[variant];
  return (
    <div
      style={{
        background:   s.bg,
        borderRadius: 'var(--radius-sm)',
        padding:      'var(--space-3)',
        display:      'flex',
        flexDirection:'column',
        gap:          'var(--space-1)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize:   'var(--text-lg)',
          fontWeight: 'var(--weight-semibold)',
          color:      s.color,
          lineHeight: 1,
        }}
      >
        {formatCompact(count)}
      </span>
      <span
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-medium)',
          color:         s.color,
          opacity:       0.75,
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-widest)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// CampaignPreviewModal
// ─────────────────────────────────────────────

export function CampaignPreviewModal({
  campaign,
  adCreatives,
  open,
  onClose,
}: CampaignPreviewModalProps) {
  const router = useRouter();

  const hasVideos = adCreatives.length > 0;

  const encodedName = campaign.campaign_name.replace(/\s+/g, '+');
  const domainLabel = DOMAIN_LABELS[campaign.domain as keyof typeof DOMAIN_LABELS] ?? campaign.domain;

  function handleOpen() {
    router.push(`/campaigns/${encodedName}`);
    onClose();
  }

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
      <Button variant="ghost" size="sm" onClick={onClose}>
        Close
      </Button>
      <Button variant="primary" size="sm" onClick={handleOpen}>
        Open Campaign →
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={beautifyCampaignTitle(campaign.campaign_name)}
      footer={footer}
      maxWidth="max-w-3xl"
    >
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: hasVideos ? '40% 1fr' : '1fr',
          gap:                 'var(--space-6)',
          alignItems:          'start',
        }}
      >
        {/* Left — video carousel (per-video ad_name + notes shown beneath) */}
        {hasVideos && <AdCreativeCarousel creatives={adCreatives} showMeta />}

        {/* Right — info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Domain badge */}
          <span
            style={{
              alignSelf:     'flex-start',
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
            }}
          >
            {domainLabel}
          </span>

          {/* Metrics grid — 2×3 */}
          <div
            style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap:                 'var(--space-2)',
            }}
          >
            <MetricCell count={campaign.total_leads}  label="Total"         variant="accent"  />
            <MetricCell count={campaign.won}           label="Won"           variant="success" />
            <MetricCell count={campaign.in_discussion} label="In Discussion" variant="info"    />
            <MetricCell count={campaign.nurturing}     label="Nurturing"     variant="warning" />
            <MetricCell count={campaign.lost}          label="Lost"          variant="danger"  />
            <MetricCell count={campaign.junk}          label="Junk"          variant="neutral" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

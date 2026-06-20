'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { m as motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import { SectionCard } from '@/components/ui/SectionCard';
import { AdCreativeCarousel } from './AdCreativeCarousel';
import type { AdCreative } from '@/lib/types/database';

// Heavy, rarely-opened overlay — load on intent (perf audit G-1).
const AdCreativeFormModal = dynamic(
  () => import('@/components/admin/AdCreativeFormModal').then((m) => m.AdCreativeFormModal),
  { ssr: false },
);

interface CampaignAdPanelProps {
  /** Newest-first creatives for this campaign (may be empty). */
  adCreatives:  AdCreative[];
  /** Normalised campaign key for an inline upload (pre-selected + locked). */
  campaignKey:  string;
  /** Only admin/founder may upload — gates the empty-state Plus tile. */
  canUpload:    boolean;
}

/**
 * Left-column ad-creative panel for the campaign detail page.
 *
 * - Has creatives → the looping AdCreativeCarousel (showMeta) in a SectionCard.
 * - No creatives + canUpload → an empty "add a video" tile with a Plus that
 *   opens the SAME AdCreativeFormModal the /admin/ad-creatives page uses
 *   (R-01 — no second uploader), with this campaign pre-selected + locked.
 * - No creatives + !canUpload → the empty tile without the upload affordance.
 *
 * The card frame is ALWAYS shown (the metrics grid sits to its right), so the
 * two columns stay balanced whether or not a video exists.
 */
export function CampaignAdPanel({ adCreatives, campaignKey, canUpload }: CampaignAdPanelProps) {
  const [creatives, setCreatives] = useState<AdCreative[]>(adCreatives);
  const [modalOpen, setModalOpen] = useState(false);

  const hasVideo = creatives.length > 0;

  function handleSaved(row: AdCreative) {
    // Newest-first, mirroring the service order.
    setCreatives((prev) => [row, ...prev]);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
    >
      <SectionCard
        title="AD CREATIVE"
        headerRight={
          hasVideo && creatives.length > 1 ? (
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
              }}
            >
              {creatives.length} ads
            </span>
          ) : undefined
        }
      >
        {hasVideo ? (
          <AdCreativeCarousel creatives={creatives} showMeta align="center" />
        ) : (
          <EmptyAdTile canUpload={canUpload} onAdd={() => setModalOpen(true)} />
        )}
      </SectionCard>

      {/* Inline upload — reuses the admin uploader; admin/founder only.
          Mounted only after first open (next/dynamic + conditional). */}
      {canUpload && modalOpen && (
        <AdCreativeFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          editing={null}
          campaignKeys={[campaignKey]}
          defaultCampaignKey={campaignKey}
          onSaved={handleSaved}
        />
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Empty state — same 9:16 footprint as the player, with an upload affordance
// ─────────────────────────────────────────────

function EmptyAdTile({ canUpload, onAdd }: { canUpload: boolean; onAdd: () => void }) {
  const sharedTileStyle: React.CSSProperties = {
    width:          '100%',
    maxWidth:       '270px',          // matches the carousel player width
    marginInline:   'auto',
    aspectRatio:    '9 / 16',
    maxHeight:      '480px',
    borderRadius:   'var(--radius-md)',
    background:     'var(--theme-paper-subtle)',
    border:         '1px dashed var(--theme-paper-border)',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            'var(--space-3)',
    color:          'var(--theme-text-tertiary)',
    textAlign:      'center',
    padding:        'var(--space-6)',
  };

  if (!canUpload) {
    return (
      <div style={sharedTileStyle}>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-base)',
            fontWeight: 'var(--weight-light)',
            color:      'var(--theme-text-tertiary)',
            margin:     0,
          }}
        >
          No video yet.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label="Add a video for this campaign"
      className="serene-pressable serene-icon-rotate-hover"
      style={{ ...sharedTileStyle, cursor: 'pointer' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--theme-accent-muted)';
        e.currentTarget.style.color = 'var(--theme-text-secondary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
        e.currentTarget.style.color = 'var(--theme-text-tertiary)';
      }}
    >
      <span
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          '3rem',
          height:         '3rem',
          borderRadius:   'var(--radius-full)',
          background:     'var(--theme-paper)',
          border:         '1px solid var(--theme-paper-border)',
          boxShadow:      'var(--shadow-1)',
        }}
      >
        <Plus style={{ width: '1.25rem', height: '1.25rem', strokeWidth: 1.5 }} />
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize:   'var(--text-sm)',
          color:      'inherit',
        }}
      >
        Add a video
      </span>
    </button>
  );
}

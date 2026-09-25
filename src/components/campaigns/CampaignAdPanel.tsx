'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { m as motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { EASE_OUT_EXPO, SLOW_DURATION } from '@/lib/constants/motion';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { UploadButton } from '@/components/ui/UploadButton';
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
 * The ad-creative card at the foot of the campaign detail page (below the leads
 * since 2026-09-25; it used to open the page beside the metrics).
 *
 * - Has creatives → the looping AdCreativeCarousel (showMeta) in a SectionCard.
 * - No creatives + canUpload → the shared UploadButton surface ("Add a video")
 *   that opens the SAME AdCreativeFormModal the /admin/ad-creatives page uses
 *   (R-01 — no second uploader), with this campaign pre-selected + locked.
 * - No creatives + !canUpload → one quiet line, no upload affordance.
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
      transition={{ duration: SLOW_DURATION, ease: EASE_OUT_EXPO }}
    >
      <SectionCard
        title="Ad creative"
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
// Empty state — the shared file-chooser surface, or one quiet line
// ─────────────────────────────────────────────

function EmptyAdTile({ canUpload, onAdd }: { canUpload: boolean; onAdd: () => void }) {
  if (!canUpload) {
    return <EmptyState title="No video yet." style={{ padding: 'var(--space-4) 0' }} />;
  }

  return (
    <UploadButton onClick={onAdd} aria-label="Add a video for this campaign" className="serene-icon-rotate-hover">
      <Plus style={{ width: '1.25rem', height: '1.25rem', strokeWidth: 1.5 }} aria-hidden="true" />
      <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>Add a video</span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
        Upload the ad video for this campaign.
      </span>
    </UploadButton>
  );
}

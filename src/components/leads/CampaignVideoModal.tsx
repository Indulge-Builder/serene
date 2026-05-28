'use client';

import { useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import type { AdCreative } from '@/lib/types/database';

type Props = {
  isOpen:       boolean;
  onClose:      () => void;
  campaignName: string;
  adCreative:   AdCreative;
};

export function CampaignVideoModal({
  isOpen,
  onClose,
  campaignName,
  adCreative,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attempt autoplay after the modal enters the DOM.
  // The video already has `muted` + `autoPlay` attributes for browser policy compliance;
  // this ref-based call handles edge cases where the attribute alone is insufficient.
  useEffect(() => {
    if (!isOpen) return;
    const el = videoRef.current;
    if (!el) return;
    el.play().catch(() => {
      // NotAllowedError — browser blocked autoplay; user can press play manually.
    });
  }, [isOpen]);

  const title = adCreative.ad_name ?? campaignName;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="max-w-2xl"
      footer={null}
    >
      {/* Subtitle */}
      <div
        style={{
          marginBottom: 'var(--space-4)',
        }}
      >
        <span
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
          }}
        >
          Meta Ad Creative
        </span>
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        src={adCreative.video_url}
        poster={adCreative.thumbnail_url ?? undefined}
        controls
        autoPlay
        muted
        playsInline
        style={{
          width:        '100%',
          maxHeight:    '60vh',
          borderRadius: 'var(--radius-md)',
          background:   'var(--theme-canvas)',
          display:      'block',
        }}
      />
    </Modal>
  );
}

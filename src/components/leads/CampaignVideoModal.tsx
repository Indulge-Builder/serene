'use client';

import { Modal } from '@/components/ui/modal';
import { AdCreativeCarousel } from '@/components/campaigns/AdCreativeCarousel';
import type { AdCreative } from '@/lib/types/database';

type Props = {
  isOpen:       boolean;
  onClose:      () => void;
  campaignName: string;
  adCreatives:  AdCreative[];
};

/**
 * Lead-dossier modal showing a campaign's ad video(s).
 * A campaign may have multiple videos — the carousel cycles through them
 * (arrows + counter, loops, newest first). Autoplay/cleanup is handled by
 * AdCreativePlayer inside the carousel.
 */
export function CampaignVideoModal({
  isOpen,
  onClose,
  campaignName,
  adCreatives,
}: Props) {
  if (adCreatives.length === 0) return null;

  // Title prefers a single video's ad_name; with multiple, use the campaign name.
  const title =
    adCreatives.length === 1 && adCreatives[0]!.ad_name
      ? adCreatives[0]!.ad_name
      : campaignName;

  return (
    <Modal open={isOpen} onClose={onClose} title={title} maxWidth="max-w-2xl" footer={null}>
      <AdCreativeCarousel creatives={adCreatives} showMeta />
    </Modal>
  );
}

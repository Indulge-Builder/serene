'use client';

import { m as motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import { SectionCard } from '@/components/ui/SectionCard';
import { AdCreativeCarousel } from './AdCreativeCarousel';
import type { AdCreative } from '@/lib/types/database';

interface CampaignAdCardProps {
  adCreatives: AdCreative[];
}

/**
 * Inline ad creative card for the campaign detail page.
 * Returns null when there are no creatives — no conditional wrapper needed at the call site.
 * A campaign may have multiple videos; the carousel cycles through them (newest first).
 * Framer Motion entrance: opacity 0→1, y 8→0, 350ms ease-out-expo.
 */
export function CampaignAdCard({ adCreatives }: CampaignAdCardProps) {
  if (adCreatives.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      style={{ marginBottom: 'var(--space-6)' }}
    >
      <SectionCard
        title="AD CREATIVE"
        headerRight={
          adCreatives.length > 1 ? (
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
              }}
            >
              {adCreatives.length} ads
            </span>
          ) : undefined
        }
      >
        {/* Left-align within the card; the carousel self-constrains the player width. */}
        <div style={{ maxWidth: '320px' }}>
          <AdCreativeCarousel creatives={adCreatives} showMeta align="start" />
        </div>
      </SectionCard>
    </motion.div>
  );
}

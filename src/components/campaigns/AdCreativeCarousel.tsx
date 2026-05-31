'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AdCreativePlayer } from './AdCreativePlayer';
import type { AdCreative } from '@/lib/types/database';

interface AdCreativeCarouselProps {
  creatives: AdCreative[];
  /** When true, render the per-video ad_name (top) + notes (bottom). */
  showMeta?: boolean;
  /** Horizontal alignment of the player within the carousel. Default 'center'. */
  align?: 'center' | 'start';
}

/**
 * Looping single-video carousel for a campaign's ad creatives.
 * - Shows one video at a time via AdCreativePlayer.
 * - Prev/Next arrows wrap around (loop). Hidden entirely when only one video.
 * - "n / total" counter. Optional per-video ad_name + notes below.
 * - `key={current.id}` on the player forces a clean remount per video so the
 *   new src autoplays (and the old one's effect cleanup pauses it).
 */
export function AdCreativeCarousel({ creatives, showMeta = false, align = 'center' }: AdCreativeCarouselProps) {
  const [index, setIndex] = useState(0);

  if (creatives.length === 0) return null;

  // Guard against an out-of-range index if the array ever shrinks.
  const safeIndex = index % creatives.length;
  const current   = creatives[safeIndex]!;
  const multiple  = creatives.length > 1;

  function go(delta: number) {
    setIndex((i) => (i + delta + creatives.length) % creatives.length);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Ad name — top */}
      {showMeta && current.ad_name && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-base)',
            fontWeight: 'var(--weight-semibold)',
            color:      'var(--theme-text-primary)',
            margin:     0,
          }}
        >
          {current.ad_name}
        </p>
      )}

      {/* Player + side arrows.
          The arrows are anchored to this wrapper, which is sized to the player
          (9:16, max 480px tall via the player's own constraints) and centred —
          so they hug the video rather than the full content width. */}
      <div
        style={{
          position:  'relative',
          width:     '100%',
          maxWidth:  '270px',   // ≈ 480px tall × 9/16; keeps arrows on the video edge
          marginInline: align === 'center' ? 'auto' : 0,
        }}
      >
        <AdCreativePlayer
          key={current.id}
          videoUrl={current.video_url}
          thumbnailUrl={current.thumbnail_url}
        />

        {multiple && (
          <>
            <CarouselArrow side="left"  onClick={() => go(-1)} />
            <CarouselArrow side="right" onClick={() => go(1)} />
          </>
        )}
      </div>

      {/* Counter */}
      {multiple && (
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            'var(--space-2)',
          }}
        >
          {creatives.map((c, i) => (
            <span
              key={c.id}
              aria-hidden
              style={{
                width:        i === safeIndex ? '18px' : '6px',
                height:       '6px',
                borderRadius: 'var(--radius-full)',
                background:   i === safeIndex ? 'var(--theme-accent)' : 'var(--theme-paper-border)',
                transition:   'width var(--duration-fast) var(--ease-out-expo), background var(--duration-fast) var(--ease-in-out)',
              }}
            />
          ))}
          <span
            style={{
              marginLeft: 'var(--space-2)',
              fontSize:   'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color:      'var(--theme-text-tertiary)',
            }}
          >
            {safeIndex + 1} / {creatives.length}
          </span>
        </div>
      )}

      {/* Notes — below */}
      {showMeta && current.notes && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-secondary)',
            margin:     0,
            lineHeight: 'var(--leading-relaxed)',
          }}
        >
          {current.notes}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Arrow button — overlaid on the player edges
// ─────────────────────────────────────────────

function CarouselArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous ad' : 'Next ad'}
      style={{
        position:       'absolute',
        top:            '50%',
        [side]:         'var(--space-2)',
        transform:      'translateY(-50%)',
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          '2.25rem',
        height:         '2.25rem',
        borderRadius:   'var(--radius-full)',
        background:     'var(--theme-paper)',
        border:         '1px solid var(--theme-paper-border)',
        boxShadow:      'var(--shadow-2)',
        color:          'var(--theme-text-primary)',
        cursor:         'pointer',
        zIndex:         1,
      } as React.CSSProperties}
    >
      <Icon style={{ width: '1.1rem', height: '1.1rem', strokeWidth: 1.5 }} />
    </button>
  );
}

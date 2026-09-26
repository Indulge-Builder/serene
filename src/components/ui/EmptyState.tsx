import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { SeedMandala } from './SeedMandala';
import { EmptyStateEntrance } from './EmptyStateEntrance';

/**
 * THE canonical empty state — ONE anatomy everywhere in Serene (2026-09-25), taken
 * from the /tickets table when it has nothing to show: a raised tile, a Playfair
 * italic title, a calm sans description, an optional action, centred. The tile
 * holds the caller's icon, or the Serene mark (the seed mandala) when no icon fits:
 * the mark rests where nothing is. "Never 'No data available'" stays structural.
 *
 * - `variant="hero"` (default when an icon is given): a page, a table or a section
 *   with nothing in it. 64px tile, xl title.
 * - `variant="inline"` (default without an icon): inside a card, panel, modal, list
 *   or menu. The SAME anatomy at a compact scale (44px tile, base title). It used to
 *   be a bare italic line; that is gone, so an empty card reads like an empty page.
 * - `framed`: the page-level surface, the paper card the tickets table sits in. Use
 *   it when the empty state IS the page's content and no card already holds it
 *   (a list or table that came back empty). Never wrap a framed empty in a card.
 *
 * Copy: calm, specific, one poetic touch at most; say what will appear here and, if
 * there is one, the single thing to do next (then pass exactly ONE `action`).
 *
 * Server-safe on purpose (no 'use client'): server pages pass `icon={Trophy}`, and a
 * component cannot be handed to a client component. The icon renders here, on the
 * caller's side; only the entrance is client (EmptyStateEntrance). Never add hooks or
 * 'use client' back to this file.
 */

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Lucide icon for the tile; without one the tile holds the Serene mark. */
  icon?: LucideIcon;
  /** hero = a page/table/section; inline = inside a card/panel/menu. Default:
   *  hero when an icon is given, inline otherwise. */
  variant?: 'hero' | 'inline';
  /** The page-level paper card (the /tickets empty). Hero use only. */
  framed?: boolean;
  /** One action below the text (usually the page's primary "create"). */
  action?: React.ReactNode;
  minHeight?: string;
  className?: string;
  style?: React.CSSProperties;
}

const SCALE = {
  hero: {
    tile: 64, radius: 'var(--radius-xl)', icon: 28, mark: 38, gap: 'var(--space-5)',
    padding: 'var(--space-8)', title: 'var(--text-xl)', description: 'var(--text-sm)',
    textMax: 360, actionGap: 'var(--space-5)',
  },
  inline: {
    tile: 44, radius: 'var(--radius-lg)', icon: 20, mark: 26, gap: 'var(--space-3)',
    padding: 'var(--space-6) var(--space-4)', title: 'var(--text-base)', description: 'var(--text-xs)',
    textMax: 300, actionGap: 'var(--space-4)',
  },
} as const;

/** The framed surface — exactly the /tickets empty card (its old wrapper padding
 *  plus the hero's own, as one element). */
const FRAME: React.CSSProperties = {
  background:   'var(--theme-paper)',
  border:       '1px solid var(--theme-paper-border)',
  borderRadius: 'var(--neu-radius-card)',
  boxShadow:    'var(--shadow-1)',
  padding:      'var(--space-20) var(--space-6)',
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  variant,
  framed = false,
  action,
  minHeight,
  className,
  style,
}: EmptyStateProps) {
  const resolved = variant ?? (Icon ? 'hero' : 'inline');
  const s = SCALE[resolved];
  const hero = resolved === 'hero';

  return (
    <EmptyStateEntrance
      rise={hero ? 8 : 4}
      className={className}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            s.gap,
        padding:        s.padding,
        textAlign:      'center',
        ...(minHeight ? { minHeight } : {}),
        ...(framed && hero ? FRAME : {}),
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width:          s.tile,
          height:         s.tile,
          flexShrink:     0,
          borderRadius:   s.radius,
          background:     'var(--theme-paper)',
          border:         '1px solid var(--theme-paper-border)',
          boxShadow:      'var(--shadow-1)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        {Icon ? (
          <Icon style={{ width: s.icon, height: s.icon, strokeWidth: 1.5, color: 'var(--neu-accent-deep)' }} />
        ) : (
          // The mark rests here. Only the hero turns (once every two minutes,
          // class-driven so reduced motion rests it); a card full of compact
          // empties never becomes a field of spinners.
          <SeedMandala size={s.mark} variant="gradient" spin={hero ? 120 : undefined} />
        )}
      </div>

      <div style={{ maxWidth: `${s.textMax}px` }}>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   s.title,
            fontWeight: 'var(--weight-normal)',
            color:      'var(--theme-text-primary)',
            lineHeight: 1.3,
            margin:     description ? `0 0 ${hero ? 'var(--space-2)' : 'var(--space-1)'}` : 0,
            // Balanced lines: a title never ends on one orphaned word.
            textWrap:   'balance',
          }}
        >
          {title}
        </p>
        {description && (
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   s.description,
              color:      'var(--theme-text-tertiary)',
              lineHeight: 'var(--leading-relaxed)',
              margin:     0,
              textWrap:   'pretty',
            }}
          >
            {description}
          </p>
        )}
        {action && <div style={{ marginTop: s.actionGap }}>{action}</div>}
      </div>
    </EmptyStateEntrance>
  );
}

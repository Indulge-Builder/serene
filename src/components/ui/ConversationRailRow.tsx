'use client';

// ConversationRailRow — THE row of a conversation rail (2026-09-25; Sia groups and
// WhatsApp conversations): avatar · title + time · one preview line, full-bleed with
// a hairline between rows. Selected = the avatar's accent ring and a semibold title,
// never a wash over the row. Hover keeps the shared selection hover. Unread = a dot on
// the avatar. Display-only: the caller owns selection and what the preview says.

import type { ReactNode } from 'react';
import { MotionSelectionButton } from '@/components/ui/MotionButton';
import { Avatar } from '@/components/ui/Avatar';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

export interface ConversationRailRowProps {
  title: string;
  /** Initials source; defaults to the title. */
  avatarName?: string;
  /** Trailing time (already formatted). */
  meta?: string | null;
  /** Small mark before the time (e.g. an "unmapped" dot). */
  metaMarker?: ReactNode;
  /** Second line: a message preview, a phone, a state. */
  preview?: ReactNode;
  selected: boolean;
  unread?: boolean;
  /** Position in the list, for the entrance stagger. */
  index?: number;
  onSelect: () => void;
  /** data-* attributes pass through (e.g. a scroll-into-view key). */
  [data: `data-${string}`]: string | undefined;
}

export function ConversationRailRow({
  title,
  avatarName,
  meta,
  metaMarker,
  preview,
  selected,
  unread = false,
  index = 0,
  onSelect,
  ...data
}: ConversationRailRowProps) {
  return (
    <MotionSelectionButton
      {...data}
      appearance="option"
      // The row itself never takes the selected wash; the avatar ring says it.
      selected={false}
      aria-pressed={selected}
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO, delay: Math.min(index * 0.015, 0.24) }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        padding: 'var(--space-3) var(--space-4)',
        textAlign: 'left',
        borderRadius: 0,
        borderBottom: '1px solid var(--theme-paper-border)',
      }}
    >
      <span style={{ position: 'relative', flexShrink: 0, display: 'inline-flex' }}>
        <Avatar name={avatarName ?? title} size="md" selected={selected} />
        {unread && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '10px',
              height: '10px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--neu-accent-deep)',
              border: '2px solid var(--theme-paper)',
            }}
          />
        )}
      </span>

      <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
              fontWeight: selected || unread ? 'var(--weight-semibold)' : 'var(--weight-medium)',
              color: 'var(--theme-text-primary)',
            }}
          >
            {title}
          </span>
          <span
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-normal)',
              color: unread ? 'var(--neu-accent-deep)' : 'var(--theme-text-tertiary)',
            }}
          >
            {metaMarker}
            {meta ?? '—'}
          </span>
        </span>
        {preview != null && (
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-normal)',
              color: 'var(--theme-text-tertiary)',
            }}
          >
            {preview}
          </span>
        )}
      </span>
    </MotionSelectionButton>
  );
}

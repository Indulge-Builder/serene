'use client';

import React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  selected?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const SIZE_PX: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const FONT_SIZE: Record<AvatarSize, string> = {
  xs: 'var(--text-2xs)',
  sm: 'var(--text-xs)',
  md: 'var(--text-sm)',
  lg: 'var(--text-base)',
  xl: 'var(--text-xl)',
};

/**
 * 6 semantic token pairs for avatar fallback colours.
 * Index derived from a simple name hash — ensures consistent colour per name.
 */
const AVATAR_COLOUR_PAIRS: [string, string][] = [
  ['var(--color-info-light)',    'var(--color-info-text)'],
  ['var(--color-success-light)', 'var(--color-success-text)'],
  ['var(--color-warning-light)', 'var(--color-warning-text)'],
  ['var(--color-danger-light)',  'var(--color-danger-text)'],
  ['var(--theme-accent-surface)','var(--theme-accent)'],
  ['var(--color-neutral-light)', 'var(--color-neutral-text)'],
];

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return h;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({ src, alt, name = '', size = 'md', selected = false, className, style }: AvatarProps) {
  const px = SIZE_PX[size];
  const [imgError, setImgError] = React.useState(false);

  const showFallback = !src || imgError;
  const initials = getInitials(name);
  const [bgColor, textColor] = AVATAR_COLOUR_PAIRS[nameHash(name) % AVATAR_COLOUR_PAIRS.length];

  // Compose box-shadow layers: caller shadow + selected ring must both paint.
  // CSS box-shadow accepts comma-separated layers — prepend caller's shadow so
  // the separator ring (from AvatarStack) and the accent ring (from selected)
  // coexist without either overwriting the other.
  const { boxShadow: callerShadow, ...restStyle } = style ?? {};
  const selectedShadow = selected ? '0 0 0 2px var(--theme-paper), 0 0 0 4px var(--theme-accent)' : undefined;
  const composedShadow = [callerShadow, selectedShadow].filter(Boolean).join(', ') || undefined;

  return (
    <div
      className={className}
      style={{
        width:          px,
        height:         px,
        minWidth:       px,
        borderRadius:   'var(--radius-md)',
        overflow:       'hidden',
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     showFallback ? bgColor : 'transparent',
        flexShrink:     0,
        boxShadow:      composedShadow,
        transition:     'box-shadow var(--transition-interactive)',
        ...restStyle,
      }}
    >
      {!showFallback ? (
        <img
          src={src!}
          alt={alt ?? name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setImgError(true)}
        />
      ) : (
        <span
          style={{
            fontFamily:  'var(--font-sans)',
            fontSize:    FONT_SIZE[size],
            fontWeight:  'var(--weight-semibold)',
            color:       textColor,
            lineHeight:  '1',
            userSelect:  'none',
          }}
          aria-label={name || 'Avatar'}
        >
          {initials}
        </span>
      )}
    </div>
  );
}

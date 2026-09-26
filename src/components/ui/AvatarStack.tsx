'use client';

import { m as motion } from 'framer-motion';
import { Avatar, type AvatarSize } from './Avatar';
import { Tooltip } from './Tooltip';
import { SPRING_CONFIG } from '@/lib/constants/motion';

export interface AvatarStackUser {
  id:       string;
  name:     string;
  imageUrl?: string;
}

export interface AvatarStackProps {
  users:    AvatarStackUser[];
  max?:     number;
  size?:    AvatarSize;
  overlap?: number;
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


export function AvatarStack({
  users,
  max     = 4,
  size    = 'sm',
  overlap = 8,
}: AvatarStackProps) {
  if (users.length === 0) return null;

  const px      = SIZE_PX[size];
  const visible = users.slice(0, max);
  const extra   = Math.max(0, users.length - max);

  return (
    <motion.div
      style={{ display: 'flex', alignItems: 'center' }}
      whileHover="hovered"
      initial="rest"
      animate="rest"
    >
      {visible.map((user, i) => (
        <motion.div
          key={user.id}
          variants={{
            rest:    { x: 0 },
            hovered: { x: i * (overlap / 2) },
          }}
          transition={SPRING_CONFIG}
          style={{
            marginLeft: i === 0 ? 0 : -overlap,
            zIndex:     visible.length - i,
            flexShrink: 0,
            position:   'relative',
          }}
        >
          {/* The name rides the charcoal pill; the Avatar's own alt / aria-label
              carries it for screen readers. Wrapped INSIDE the motion.div so the
              spread transform, overlap margin and z-order stay on the mover. */}
          <Tooltip label={user.name} side="top">
            <Avatar
              src={user.imageUrl ?? null}
              name={user.name}
              size={size}
              style={{
                // Separator ring — paints outside the element, no layout shift.
                // box-shadow composes with Avatar's selected ring (comma-separated layers).
                boxShadow: '0 0 0 2px var(--theme-paper)',
              }}
            />
          </Tooltip>
        </motion.div>
      ))}

      {extra > 0 && (
        <motion.div
          variants={{
            rest:    { x: 0 },
            hovered: { x: visible.length * (overlap / 2) },
          }}
          transition={SPRING_CONFIG}
          style={{
            width:          px,
            height:         px,
            minWidth:       px,
            borderRadius:   'var(--radius-full)',
            background:     'var(--theme-paper-subtle)',
            border:         '1px solid var(--theme-paper-border)',
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
            marginLeft:     -overlap,
            zIndex:         0,
            flexShrink:     0,
            fontFamily:     'var(--font-sans)',
            fontSize:       FONT_SIZE[size],
            fontWeight:     'var(--weight-semibold)',
            color:          'var(--theme-text-secondary)',
            // Separator ring on overflow pill to match avatar separation
            boxShadow:      '0 0 0 2px var(--theme-paper)',
          }}
        >
          +{extra}
        </motion.div>
      )}
    </motion.div>
  );
}

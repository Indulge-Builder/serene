'use client';

import React from 'react';
import { m as motion } from 'framer-motion';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

/**
 * The entrance of <EmptyState>, and nothing else. It lives in its own client file so
 * EmptyState itself stays server-safe: a server page passes a Lucide icon (a
 * component, which cannot cross into a client component), and EmptyState renders it
 * on whichever side the caller is on, handing only elements to this wrapper.
 * Private to EmptyState; not a general entrance primitive.
 */
export function EmptyStateEntrance({
  rise,
  className,
  style,
  children,
}: {
  /** The y the entrance rises from (hero 8, inline 4). */
  rise: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: rise }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

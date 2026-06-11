'use client';

import { m as motion } from 'framer-motion';
import { BASE_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

type CollapseRevealProps = {
  /** Entrance/exit duration in seconds (default BASE_DURATION, 200ms). */
  duration?: number;
  /** Merged onto the outer motion element (margins, width overrides…). */
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * THE expand/collapse reveal. Animates grid-template-rows 0fr→1fr (+ opacity)
 * instead of height 0→"auto": no per-frame inline height writes, no measured
 * target going stale when content changes mid-animation, and no `height`
 * keyword (Never-Do list — never animate width/height/padding/margin).
 *
 * Render inside <AnimatePresence> at the call site and pass `key` there.
 * The inner div owns the clipping — `minHeight: 0` + `overflow: hidden` is
 * what lets the 0fr track actually collapse (grid items default to
 * min-height auto and would otherwise hold the row open).
 */
export function CollapseReveal({
  duration = BASE_DURATION,
  style,
  children,
}: CollapseRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, gridTemplateRows: '0fr' }}
      animate={{ opacity: 1, gridTemplateRows: '1fr' }}
      exit={{ opacity: 0, gridTemplateRows: '0fr' }}
      transition={{ duration, ease: EASE_OUT_EXPO }}
      style={{ display: 'grid', ...style }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </motion.div>
  );
}

'use client';

import React, { useRef } from 'react';
import { m as motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SPRING_CONFIG } from '@/lib/constants/motion';

// ─────────────────────────────────────────────
// Carousel — THE generic swipeable deck primitive.
//
// Controlled: the parent owns the active `index` (so a founder deck can sync it
// with a "currently viewed agent" selection). Renders a horizontal track of
// full-width slides and translates it on a spring. Touch-swipe past a threshold
// commits to the neighbour; arrow buttons + dots are the pointer affordances;
// ←/→ move focus-driven navigation. Transform + opacity only (Never-Do list —
// never animate width/height). Display-only (A-06), zero business logic.
//
// This is NOT AdCreativeCarousel (campaigns/) — that one is hard-coupled to the
// video player and the AdCreative type and has no touch support. This primitive
// is content-agnostic: pass any slides via the render slot.
// ─────────────────────────────────────────────

export interface CarouselProps<T> {
  items: T[];
  index: number;
  onIndexChange: (index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable key per item — defaults to the index. */
  getKey?: (item: T, index: number) => string;
  /** Accessible name for the carousel region. */
  ariaLabel?: string;
  /** Hide the dot indicator (e.g. when slide count is large). Default false. */
  hideDots?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Horizontal swipe must travel this fraction of the viewport width to commit. */
const SWIPE_COMMIT_RATIO = 0.18;
/** Below this absolute |Δx| we treat the gesture as a tap/scroll, never a swipe. */
const SWIPE_MIN_PX = 40;

export function Carousel<T>({
  items,
  index,
  onIndexChange,
  renderItem,
  getKey,
  ariaLabel = 'Carousel',
  hideDots = false,
  className,
  style,
}: CarouselProps<T>) {
  const count = items.length;
  const safeIndex = count > 0 ? Math.min(Math.max(index, 0), count - 1) : 0;
  const multiple = count > 1;

  // Touch tracking — axis-locked so a vertical scroll inside a slide never
  // triggers a horizontal page change.
  const touch = useRef<{ x: number; y: number; locked: 'h' | 'v' | null } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  function go(delta: number) {
    if (!multiple) return;
    const next = Math.min(Math.max(safeIndex + delta, 0), count - 1);
    if (next !== safeIndex) onIndexChange(next);
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touch.current = { x: t.clientX, y: t.clientY, locked: null };
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = touch.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (start.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      start.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t || start.locked !== 'h') return;
    const dx = t.clientX - start.x;
    const width = viewportRef.current?.clientWidth ?? 0;
    const threshold = Math.max(SWIPE_MIN_PX, width * SWIPE_COMMIT_RATIO);
    if (Math.abs(dx) < threshold) return;
    go(dx < 0 ? 1 : -1); // swipe left → next
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
  }

  if (count === 0) return null;

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minHeight: 0, ...style }}
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* Viewport + track */}
      <div
        ref={viewportRef}
        style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        <motion.div
          style={{ display: 'flex', height: '100%', width: '100%' }}
          animate={{ x: `-${safeIndex * 100}%` }}
          transition={SPRING_CONFIG}
          // touchAction pan-y: the browser keeps vertical scrolling; we own the
          // horizontal axis for the swipe gesture.
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {items.map((item, i) => (
            <div
              key={getKey ? getKey(item, i) : String(i)}
              aria-hidden={i !== safeIndex}
              style={{
                flex: '0 0 100%',
                width: '100%',
                height: '100%',
                minWidth: 0,
                overflowY: 'auto',
                touchAction: 'pan-y',
              }}
            >
              {renderItem(item, i)}
            </div>
          ))}
        </motion.div>
      </div>

      {/* Controls bar — prev · dots+counter · next, in a single themed row below
          the viewport. The arrows used to overlay the slide edges (absolute,
          on top of card content); docking them in this row keeps them off the
          content and reads as one navigation cluster. */}
      {multiple && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-4)',
            flexShrink: 0,
          }}
        >
          <CarouselArrow side="left" disabled={safeIndex === 0} onClick={() => go(-1)} />

          {!hideDots && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {items.map((item, i) => (
                <button
                  key={getKey ? getKey(item, i) : String(i)}
                  type="button"
                  aria-label={`Go to item ${i + 1}`}
                  aria-current={i === safeIndex}
                  onClick={() => onIndexChange(i)}
                  style={{
                    width: i === safeIndex ? '18px' : '6px',
                    height: '6px',
                    padding: 0,
                    border: 'none',
                    borderRadius: 'var(--radius-full)',
                    background: i === safeIndex ? 'var(--theme-accent)' : 'var(--theme-paper-border)',
                    cursor: 'pointer',
                    transition:
                      'width var(--duration-fast) var(--ease-out-expo), background var(--duration-fast) var(--ease-in-out)',
                  }}
                />
              ))}
              <span
                style={{
                  marginLeft: 'var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--theme-text-tertiary)',
                }}
              >
                {safeIndex + 1} / {count}
              </span>
            </div>
          )}

          <CarouselArrow side="right" disabled={safeIndex === count - 1} onClick={() => go(1)} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Arrow button — sits in the controls bar below the viewport (no longer
// overlaid on the slide). Secondary-button chrome (paper-subtle + paper-border,
// --shadow-1) so it reads as quiet navigation, not a floating accent.
// ─────────────────────────────────────────────

function CarouselArrow({
  side,
  onClick,
  disabled,
}: {
  side: 'left' | 'right';
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className="serene-pressable serene-touch"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '2.25rem',
        height: '2.25rem',
        flexShrink: 0,
        borderRadius: 'var(--radius-full)',
        background: 'var(--theme-paper-subtle)',
        border: '1px solid var(--theme-paper-border)',
        boxShadow: 'var(--shadow-1)',
        color: disabled ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? 'none' : undefined,
        transition:
          'opacity var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)',
      }}
    >
      <Icon style={{ width: '1.05rem', height: '1.05rem', strokeWidth: 1.5 }} aria-hidden="true" />
    </button>
  );
}

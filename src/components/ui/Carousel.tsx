'use client';

import { Button } from '@/components/ui/Button';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { m as motion, useMotionValue, animate, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SPRING_CONFIG } from '@/lib/constants/motion';

// ─────────────────────────────────────────────
// Carousel — THE generic swipeable deck primitive.
//
// Controlled: the parent owns the active `index` (so a founder deck can sync it
// with a "currently viewed agent" selection). Renders a horizontal track of
// full-width slides on a motion value and springs it to the active slide.
//
// The swipe follows the finger 1:1 (2026-09-25, Apple's fluid-interface rules:
// direct manipulation, momentum projection, velocity hand-off). It used to
// only lock the axis and jump after release. Now the track is dragged, the
// ends rubber-band, and on release the landing slide is chosen from where the
// flick would come to rest; the spring then starts at the finger's speed, so
// there is no seam between the drag and the settle. One slide per gesture.
// Arrow buttons + dots are the pointer affordances; ←/→ move focus-driven
// navigation. Transform + opacity only (Never-Do list). Display-only (A-06).
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
  /**
   * Hide the whole controls bar (arrows + dots + counter). For consumers
   * that own their own pager affordance — e.g. the mobile DomainSwiper,
   * which supplies a neu-token indicator (mobile-ops.md §6). Swipe +
   * keyboard navigation stay live. Default false.
   */
  hideControls?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Below this |Δx| with no fling the gesture is a tap or a scroll, never a page. */
const SWIPE_MIN_PX = 40;
/** A release faster than this (px/s) pages even from a short drag. */
const FLING_PX_PER_S = 300;
/** Scroll-deceleration rate (Apple's normal scroll feel). */
const DECELERATION = 0.998;

/** Where a flick at this speed would come to rest (the standard exponential decay). */
function project(velocityPxPerS: number): number {
  return ((velocityPxPerS / 1000) * DECELERATION) / (1 - DECELERATION);
}

export function Carousel<T>({
  items,
  index,
  onIndexChange,
  renderItem,
  getKey,
  ariaLabel = 'Carousel',
  hideDots = false,
  hideControls = false,
  className,
  style,
}: CarouselProps<T>) {
  const count = items.length;
  const safeIndex = count > 0 ? Math.min(Math.max(index, 0), count - 1) : 0;
  const multiple = count > 1;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  // The track's x, in px. Dragging writes it; the settle springs it.
  const x = useMotionValue(0);
  // The finger's release speed, handed to the spring that lands the next slide.
  const releaseVelocity = useRef(0);
  const prevWidth = useRef(0);

  // The slide width. Measured before paint, so a deck opened on slide 3 never
  // shows slide 1 first; re-measured on resize.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Land on the active slide: a resize (or the first measure) jumps straight
  // there; an index change springs from wherever the track is, at the speed
  // the finger left it.
  useLayoutEffect(() => {
    if (width === 0) return;
    const target = -safeIndex * width;
    if (prevWidth.current !== width) {
      prevWidth.current = width;
      x.set(target);
      return;
    }
    const controls = animate(x, target, { ...SPRING_CONFIG, velocity: releaseVelocity.current });
    releaseVelocity.current = 0;
    return () => controls.stop();
  }, [safeIndex, width, x]);

  function go(delta: number) {
    if (!multiple) return;
    const next = Math.min(Math.max(safeIndex + delta, 0), count - 1);
    if (next !== safeIndex) onIndexChange(next);
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    if (!multiple || width === 0) return;
    const velocity = info.velocity.x;
    // Choose the slide nearest to where the flick would stop, not to the
    // release point; a short, slow drag stays put.
    const projected = x.get() + project(velocity);
    let target = Math.round(-projected / width);
    if (Math.abs(info.offset.x) < SWIPE_MIN_PX && Math.abs(velocity) < FLING_PX_PER_S) target = safeIndex;
    // One slide per gesture, and never past the ends.
    target = Math.min(Math.max(target, safeIndex - 1, 0), safeIndex + 1, count - 1);
    releaseVelocity.current = velocity;
    if (target !== safeIndex) {
      onIndexChange(target);
    } else {
      animate(x, -safeIndex * width, { ...SPRING_CONFIG, velocity });
    }
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
          style={{ display: 'flex', height: '100%', width: '100%', x }}
          // The finger owns the horizontal axis; the browser keeps vertical
          // scrolling inside a slide (touch-action pan-y on the slides).
          drag={multiple ? 'x' : false}
          dragDirectionLock
          dragConstraints={{ left: -(count - 1) * width, right: 0 }}
          // Progressive resistance past either end, a soft boundary, not a wall.
          dragElastic={0.12}
          // The settle is ours (projection + velocity hand-off above).
          dragMomentum={false}
          onDragEnd={onDragEnd}
        >
          {items.map((item, i) => (
            <div
              key={getKey ? getKey(item, i) : String(i)}
              aria-hidden={i !== safeIndex}
              // Hidden slides are out of the tab order too, not only unread.
              inert={i !== safeIndex}
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
      {multiple && !hideControls && (
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
                    // Inactive dots need a visible putty tone — the bridged
                    // paper-border white hairline disappears on cream.
                    background: i === safeIndex ? 'var(--theme-accent)' : 'var(--neu-text-disabled)',
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
    <Button
      variant="control" iconOnly
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
        pointerEvents: disabled ? 'none' : undefined,
      }}
    >
      <Icon style={{ width: '1.05rem', height: '1.05rem', strokeWidth: 1.5 }} aria-hidden="true" />
    </Button>
  );
}

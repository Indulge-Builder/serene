'use client';

import React, { useId } from 'react';

// SeedMandala — THE procedural brand mark (design_handoff_logo_loading_motion).
// Seed-of-life rosette: 8 identical stroked circles whose centers sit on a
// ring of radius EXACTLY equal to the circle radius (offset === r === 46),
// 45° apart starting at 12 o'clock. Because center-distance == radius, every
// circle passes through the exact center point — their crossings there form
// the clean 8-petal seed flower that is the signature of the mark. If the
// middle reads as a mess of arcs, the geometry is wrong. Never eyeball it.
//
// PLUS the intersecting centre circle (r48 here, r24 in the Indulge app's 100
// box): part of the official Indulge logo, and the circle the Indulge app's
// splash draws LAST to seal the mark (indulge-app-example MandalaLogo, owner
// geometry FINAL 2026-07-28). Serene drew the 8 rings without it until
// 2026-09-25. It is larger than the petal knot, so it crosses the ring arcs.
//
// The three gradient stops below are BRAND-FIXED (the handoff's only
// sanctioned hex in components) — they never re-tint with the theme. Only
// glow washes / progress sweeps outside this component use --neu-accent.

export type SeedMandalaVariant = 'gradient' | 'currentColor' | 'darkDisc';

export interface SeedMandalaProps {
  /** Rendered edge length in px. */
  size?: number;
  /**
   * gradient (default): umber→gold across the whole mark, stroke 2.2.
   * currentColor: single-colour strokes for tiny inline sizes (<24px,
   *   buttons), stroke 7 so it survives at 18px.
   * darkDisc: light-gold gradient, stroke 4 — the charcoal Elaya disc.
   */
  variant?: SeedMandalaVariant;
  /** Trace each circle in (1.15s, 90ms stagger; the centre circle last). */
  draw?: boolean;
  /** Seconds per revolution, linear infinite. Never faster than 3.5. */
  spin?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Escape hatch — per-variant defaults above are the spec. */
  strokeWidth?: number;
}

const R = 46;
const CENTER = 100;
/** The intersecting centre circle (the official logo's ninth ring). */
const CENTER_R = 48;
const CIRCLES = Array.from({ length: 8 }, (_, k) => {
  const angle = (k / 8) * Math.PI * 2 - Math.PI / 2;
  return {
    cx: Number((CENTER + R * Math.cos(angle)).toFixed(4)),
    cy: Number((CENTER + R * Math.sin(angle)).toFixed(4)),
  };
});

const VARIANT_STROKE: Record<SeedMandalaVariant, number> = {
  gradient: 2.2,
  currentColor: 7,
  darkDisc: 4,
};

// Brand-fixed gradient stops (handoff §Design Tokens) — never theme-tinted.
// The stops resolve through --neu-mandala-* CSS variables (declared in
// serene-neumorphic-tokens.css :root / [data-neu="dark"]) so the ONE
// component covers both modes: dark lifts to #5A4426→#D6AF6E (disc
// #7A5C30→#E8CFA0) so the gold carries on charcoal. The literals here are
// the light values, kept as fallbacks for token-less contexts.
// stop-color must be set via `style` — CSS vars do not resolve inside SVG
// presentation attributes.
const GRADIENT_STOPS: Record<'gradient' | 'darkDisc', [string, string]> = {
  gradient: ['var(--neu-mandala-from, #2B1D10)', 'var(--neu-mandala-to, #C08A4E)'],
  darkDisc: ['var(--neu-mandala-disc-from, #E8CFA0)', 'var(--neu-mandala-disc-to, #C08A4E)'],
};

export function SeedMandala({
  size = 32,
  variant = 'gradient',
  draw = false,
  spin,
  className,
  style,
  strokeWidth,
}: SeedMandalaProps) {
  // useId can emit characters that break url(#…) references — sanitize.
  const gradientId = `seed-mandala-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const sw = strokeWidth ?? VARIANT_STROKE[variant];
  const stroke = variant === 'currentColor' ? 'currentColor' : `url(#${gradientId})`;

  const classes =
    [draw && 'serene-logo-draw', spin !== undefined && 'serene-logo-spin', className]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={classes}
      style={
        {
          display: 'block',
          overflow: 'visible',
          flexShrink: 0,
          ...(spin !== undefined ? { '--serene-logo-spin': `${spin}s` } : {}),
          ...style,
        } as React.CSSProperties
      }
    >
      {variant !== 'currentColor' && (
        <defs>
          {/* One linear gradient across the WHOLE mark (not per circle):
              top-right fades toward the background — intentional, matches
              the brand asset. x1=1 y1=0 → x2=0 y2=1. */}
          <linearGradient id={gradientId} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: GRADIENT_STOPS[variant][0] }} />
            <stop offset="100%" style={{ stopColor: GRADIENT_STOPS[variant][1] }} />
          </linearGradient>
        </defs>
      )}
      {CIRCLES.map((c, k) => (
        <circle
          key={k}
          cx={c.cx}
          cy={c.cy}
          r={R}
          stroke={stroke}
          strokeWidth={sw}
          {...(draw ? { pathLength: 1, strokeDasharray: 1 } : {})}
          style={draw ? { animationDelay: `${k * 90}ms` } : undefined}
        />
      ))}
      {/* The centre circle draws last, sealing the mark (the Indulge splash order). */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={CENTER_R}
        stroke={stroke}
        strokeWidth={sw}
        {...(draw ? { pathLength: 1, strokeDasharray: 1 } : {})}
        style={draw ? { animationDelay: `${CIRCLES.length * 90}ms` } : undefined}
      />
    </svg>
  );
}

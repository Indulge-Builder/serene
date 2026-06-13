import type { SVGProps } from "react";

interface ElayaGlyphProps extends SVGProps<SVGSVGElement> {
  size?: number;
  breathing?: boolean;
}

/**
 * Elaya's mark. Always breathing when she is present.
 * Pass breathing={false} only when she is absent.
 * Color is always inherited from `color` (set via --theme-accent on the parent).
 */
export function ElayaGlyph({ size = 32, breathing = true, className = "", ...props }: ElayaGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${breathing ? "elaya-breathe" : ""} ${className}`.trim()}
      aria-hidden="true"
      {...props}
    >
      {/* Outer ring */}
      <circle cx="16" cy="16" r="13.5" stroke="currentColor" strokeWidth="0.75" />
      {/* Inner ring */}
      <circle cx="16" cy="16" r="7" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
      {/* Center point */}
      <circle cx="16" cy="16" r="1.75" fill="currentColor" />
      {/* Cardinal ticks */}
      <line x1="16" y1="1" x2="16" y2="5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="16" y1="26.5" x2="16" y2="31" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="1" y1="16" x2="5.5" y2="16" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="26.5" y1="16" x2="31" y2="16" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

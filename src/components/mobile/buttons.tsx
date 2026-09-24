import type { ReactNode, ButtonHTMLAttributes } from 'react';

/**
 * Mobile button set (design_handoff_mobile_system §03 Buttons).
 * Touch scale is law: primary 56 · secondary 52 · quiet 44 · FAB 60 ·
 * icon knob 48/44 (44 is the floor — nothing touchable is smaller).
 * Press behaviour comes from the .neu-m-touch / .neu-m-touch-knob
 * recipe classes (serene-mobile.css).
 */

type MobileButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
  children: ReactNode;
};

export function MobileButton({
  variant = 'primary',
  children,
  className = '',
  style,
  ...rest
}: MobileButtonProps) {
  return (
    <button
      {...rest}
      data-variant={variant}
      className={`${variant === 'quiet' ? 'neu-m-touch-quiet' : 'neu-m-touch'} neu-m-button rounded-full flex items-center justify-center ${className}`}
      style={style}
    >
      {children}
    </button>
  );
}

/** Circular raised icon knob — 44Ø floor, 48Ø default for standalone use. */
export function IconKnob({
  size = 44,
  children,
  className = '',
  accent = false,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: number;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...rest}
      className={`neu-m-touch-knob neu-m-icon-knob shrink-0 rounded-full bg-(--neu-surface) border border-(--neu-edge) flex items-center justify-center ${
        accent ? 'text-(--neu-accent-deep)' : 'text-(--neu-text-secondary)'
      } ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      {children}
    </button>
  );
}

/** Accent-gradient FAB — 60Ø, dark ink glyph. */
export function Fab({
  children,
  className = '',
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`neu-m-touch-knob neu-m-fab shrink-0 w-15 h-15 rounded-full border border-(--neu-accent-btn-edge) flex items-center justify-center text-(--neu-accent-fg) ${className}`}
      style={style}
    >
      {children}
    </button>
  );
}

/** Sticky footer pair — quiet flex 1 / primary flex 1.6 (README §Buttons). */
export function StickyButtonPair({
  quietLabel,
  primaryLabel,
  onQuiet,
  onPrimary,
}: {
  quietLabel: string;
  primaryLabel: string;
  onQuiet?: () => void;
  onPrimary?: () => void;
}) {
  return (
    <div className="flex gap-3">
      <MobileButton
        variant="secondary"
        onClick={onQuiet}
        className="flex-1"
      >
        {quietLabel}
      </MobileButton>
      <MobileButton
        variant="primary"
        onClick={onPrimary}
        className="flex-[1.6]"
        style={{ height: '3.25rem', fontSize: 'var(--text-sm)' }}
      >
        {primaryLabel}
      </MobileButton>
    </div>
  );
}

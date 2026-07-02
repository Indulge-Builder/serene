import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type Props = {
  icon: LucideIcon;
  label: string;
  /** Optional right-hand slot — callers own its layout (e.g. marginLeft: 'auto'). */
  right?: ReactNode;
  /** Merged over the header strip (LeadNotesInput's accent-surface variant). */
  style?: CSSProperties;
  /** Merged over the icon (PersonalDetailsCard's active accent colour). */
  iconStyle?: CSSProperties;
  /** Merged over the micro-label (LeadNotesInput's accent label). */
  labelStyle?: CSSProperties;
};

/**
 * THE dossier card-header strip (DRY extraction, 2026-06-20 audit D3).
 * Flex row: Lucide icon (0.875rem, tertiary) + uppercase semibold micro-label
 * + optional right slot, on a paper-subtle strip with a bottom border.
 * Display-only (A-06); server-component-safe.
 */
export function CardHeader({ icon: Icon, label, right, style, iconStyle, labelStyle }: Props) {
  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-2)',
        padding:      'var(--space-4) var(--space-5)',
        borderBottom: '1px solid var(--theme-paper-border)',
        background:   'var(--theme-paper-subtle)',
        ...style,
      }}
    >
      <Icon
        style={{
          width:       '0.875rem',
          height:      '0.875rem',
          color:       'var(--theme-text-tertiary)',
          strokeWidth: 1.5,
          flexShrink:  0,
          ...iconStyle,
        }}
      />
      <span
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
          ...labelStyle,
        }}
      >
        {label}
      </span>
      {right}
    </div>
  );
}

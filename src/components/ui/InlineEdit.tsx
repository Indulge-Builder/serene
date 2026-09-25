'use client';

// InlineEdit — THE look of a dossier value you edit in place (lifted out of LeadInfoCard
// 2026-09-25 so the member facts cards share it): the value at rest with a dashed accent
// underline on hover / while open, the save feedback beside it (mandala while saving, a check
// for two seconds after), and the underline-only input that replaces the value while editing.
// Presentational only; each field keeps its own state and its own save action.

import { Check } from 'lucide-react';
import { SeedMandala } from '@/components/ui/SeedMandala';

export function EditableValueText({
  children,
  open,
  hovered,
  muted,
}: {
  children: React.ReactNode;
  open?:    boolean;
  hovered?: boolean;
  muted?:   boolean;
}) {
  return (
    <span
      style={{
        borderBottom: hovered || open ? '1px dashed var(--theme-accent)' : '1px dashed transparent',
        color:        open ? 'var(--theme-accent)' : muted ? 'var(--theme-text-tertiary)' : 'inherit',
        transition:   'border-color 0.15s ease, color 0.15s ease',
      }}
    >
      {children}
    </span>
  );
}

export function FieldSaveFeedback({
  saving,
  success,
  error,
}: {
  saving:  boolean;
  success: boolean;
  error:   string | null;
}) {
  if (saving)
    return (
      <SeedMandala
        size={16}
        variant="currentColor"
        spin={3.5}
        style={{ color: 'var(--neu-accent-deep)' }}
      />
    );
  if (success) {
    return (
      <Check
        style={{ width: '0.75rem', height: '0.75rem', color: 'var(--color-success-text)', strokeWidth: 2, flexShrink: 0 }}
      />
    );
  }
  if (error) {
    return (
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', marginTop: 'var(--space-1)' }}>
        {error}
      </span>
    );
  }
  return null;
}

/** The input that stands in for the value while editing: no box, one accent underline. */
export const INLINE_EDIT_INPUT_STYLE: React.CSSProperties = {
  width:        '100%',
  height:       '1.5rem',
  padding:      0,
  border:       'none',
  borderBottom: '1px solid var(--theme-accent)',
  background:   'transparent',
  fontFamily:   'var(--font-sans)',
  fontSize:     'var(--text-sm)',
  color:        'var(--theme-text-primary)',
  outline:      'none',
};

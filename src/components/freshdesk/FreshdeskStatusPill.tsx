// FreshdeskStatusPill — THE status pill for the Freshdesk mirror (list + dossier).
// Tone comes from constants/freshdesk.ts; colours are the semantic status tokens.

import { fdStatusTone, fdStatusLabel, type FdStatusTone } from '@/lib/constants/freshdesk';

const TONE_STYLE: Record<FdStatusTone, { bg: string; fg: string }> = {
  info:    { bg: 'var(--color-info-light)',    fg: 'var(--color-info-text)' },
  warning: { bg: 'var(--color-warning-light)', fg: 'var(--color-warning-text)' },
  success: { bg: 'var(--color-success-light)', fg: 'var(--color-success-text)' },
  danger:  { bg: 'var(--color-danger-light)',  fg: 'var(--color-danger-text)' },
  neutral: { bg: 'var(--color-neutral-light)', fg: 'var(--theme-text-secondary)' },
};

export function FreshdeskStatusPill({ status, label }: { status: number; label?: string | null }) {
  const tone = TONE_STYLE[fdStatusTone(status)];
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '3px var(--space-3)',
        borderRadius: 'var(--radius-full)',
        background: tone.bg,
        color: tone.fg,
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap',
      }}
    >
      {label ?? fdStatusLabel(status)}
    </span>
  );
}

export function FreshdeskPriorityDot({ priority }: { priority: number }) {
  // Low/Medium read quiet; High/Urgent carry the warning/danger colour.
  const color =
    priority >= 4 ? 'var(--color-danger)' : priority === 3 ? 'var(--color-warning)' : 'var(--theme-text-tertiary)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
        {priority >= 4 ? 'Urgent' : priority === 3 ? 'High' : priority === 2 ? 'Medium' : 'Low'}
      </span>
    </span>
  );
}

import { Badge } from '@/components/ui/Badge';
// FreshdeskStatusPill — THE status pill for the Freshdesk mirror (list + dossier).
// Tone comes from constants/freshdesk.ts; colours are the semantic status tokens.

import { fdStatusTone, fdStatusLabel } from '@/lib/constants/freshdesk';

export function FreshdeskStatusPill({ status, label }: { status: number; label?: string | null }) {
  return (
    <Badge tone={fdStatusTone(status)}>
      {label ?? fdStatusLabel(status)}
    </Badge>
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

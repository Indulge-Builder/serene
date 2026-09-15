// TicketChangesTimeline — how the ticket moved, as the mirror observed it (the append-only
// freshdesk.ticket_changes). Labels resolve ids to names where the vocab is known.

import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils/dates';
import { fdPriorityLabel, fdStatusLabel } from '@/lib/constants/freshdesk';
import type { FdTicketChangeRow } from '@/lib/types/freshdesk';

function pretty(field: string, v: string | null, names: { agents: Record<number, string>; groups: Record<number, string> }): string {
  if (v == null) return '—';
  if (field === 'status') return fdStatusLabel(Number(v));
  if (field === 'priority') return fdPriorityLabel(Number(v));
  if (field === 'responder_id') return names.agents[Number(v)] ?? `Agent ${v}`;
  if (field === 'group_id') return names.groups[Number(v)] ?? `Group ${v}`;
  if (field === 'tags') {
    try { return (JSON.parse(v) as string[]).join(', ') || '—'; } catch { return v; }
  }
  if (field === 'due_by' || field === 'fr_due_by') return formatDate(v, 'd MMM, h:mm a');
  return v;
}

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    status: 'Status', priority: 'Priority', responder_id: 'Agent', group_id: 'Queendom', ticket_type: 'Type',
    category: 'Category', sub_category: 'Sub-category', classification: 'Classification', subject: 'Subject',
    due_by: 'Resolve due', fr_due_by: 'Response due', is_escalated: 'Escalated', fr_escalated: 'Response escalated',
    spam: 'Spam', deleted: 'Deleted', tags: 'Tags',
  };
  if (map[field]) return map[field];
  return field.replace(/^cf\.cf_/, '').replace(/^cf\./, '').replace(/\d+$/, '').replace(/_/g, ' ');
}

export function TicketChangesTimeline({
  changes,
  agentNames,
  groupNames,
}: {
  changes: FdTicketChangeRow[];
  agentNames: Record<number, string>;
  groupNames: Record<number, string>;
}) {
  const names = { agents: agentNames, groups: groupNames };
  return (
    <SectionCard title="Movement" description="Every change the mirror has seen on this ticket">
      {changes.length === 0 ? (
        <EmptyState variant="inline" title="No movement observed yet." description="Changes are recorded from the moment the mirror first saw this ticket." />
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {changes.map((c) => (
            <li key={c.id} style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'baseline', fontSize: 'var(--text-sm)' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--theme-text-tertiary)',
                  whiteSpace: 'nowrap',
                  minWidth: 120,
                }}
              >
                {formatDate(c.observed_at, 'd MMM, h:mm a')}
              </span>
              <span style={{ color: 'var(--theme-text-primary)' }}>
                <span style={{ fontWeight: 'var(--weight-medium)' }}>{fieldLabel(c.field)}</span>
                <span style={{ color: 'var(--theme-text-tertiary)' }}> {pretty(c.field, c.old_value, names)} </span>
                <span style={{ color: 'var(--theme-text-tertiary)' }}>to</span>
                <span> {pretty(c.field, c.new_value, names)}</span>
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)', marginLeft: 'var(--space-2)' }}>via {c.source}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

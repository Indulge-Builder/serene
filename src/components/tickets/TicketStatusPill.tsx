import { Badge } from '@/components/ui/Badge';
// TicketStatusPill — THE status pill for Sia tickets; PriorityDot — the priority marker.
import { TICKET_STATUS_TONE, TICKET_STATUSES, TICKET_PRIORITIES, type TicketPriority, type TicketStatus } from '@/lib/constants/tickets';

/** `label` = the founder's renamed status from settings (resolveTicketStatusLabels); the built-in name otherwise. */
export function TicketStatusPill({ status, label }: { status: TicketStatus; label?: string }) {
  return (
    <Badge tone={TICKET_STATUS_TONE[status] ?? 'neutral'}>
      {label ?? TICKET_STATUSES.labels[status] ?? status}
    </Badge>
  );
}

export function PriorityDot({ priority, approved = true }: { priority: TicketPriority; approved?: boolean }) {
  const color = priority === 'urgent' ? 'var(--color-danger)' : priority === 'high' ? 'var(--color-warning)' : 'var(--theme-text-tertiary)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', whiteSpace: 'nowrap' }} title={approved ? 'Priority approved' : 'Priority not yet approved'}>
      <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: color, flexShrink: 0, opacity: approved ? 1 : 0.4 }} />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{TICKET_PRIORITIES.labels[priority]}{approved ? '' : ' (proposed)'}</span>
    </span>
  );
}

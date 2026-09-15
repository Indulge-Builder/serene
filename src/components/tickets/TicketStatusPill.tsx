// TicketStatusPill — THE status pill for Sia tickets; PriorityDot — the priority marker.
import { TICKET_STATUS_TONE, TICKET_STATUSES, TICKET_PRIORITIES, type TicketPriority, type TicketStatus, type TicketStatusTone } from '@/lib/constants/tickets';

const TONE: Record<TicketStatusTone, { bg: string; fg: string }> = {
  info: { bg: 'var(--color-info-light)', fg: 'var(--color-info-text)' },
  warning: { bg: 'var(--color-warning-light)', fg: 'var(--color-warning-text)' },
  success: { bg: 'var(--color-success-light)', fg: 'var(--color-success-text)' },
  danger: { bg: 'var(--color-danger-light)', fg: 'var(--color-danger-text)' },
  neutral: { bg: 'var(--color-neutral-light)', fg: 'var(--theme-text-secondary)' },
};

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  const t = TONE[TICKET_STATUS_TONE[status] ?? 'neutral'];
  return (
    <span style={{ display: 'inline-flex', padding: '3px var(--space-3)', borderRadius: 'var(--radius-full)', background: t.bg, color: t.fg, fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap' }}>
      {TICKET_STATUSES.labels[status] ?? status}
    </span>
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

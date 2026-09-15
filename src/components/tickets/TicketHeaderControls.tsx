'use client';

// TicketHeaderControls — status, priority (with the bishop's approval) and the assignee, in
// one strip. Every change is one action → one RPC → one event. The status menu offers only
// the moves the state machine allows.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { assignTicketAction, moveTicketStatusAction, setTicketPriorityAction } from '@/lib/actions/tickets';
import { TICKET_PRIORITIES, TICKET_REASSIGN_REASONS, TICKET_RESOLUTIONS, TICKET_STATUSES, TICKET_TRANSITIONS, type TicketPriority, type TicketStatus } from '@/lib/constants/tickets';
import { TicketStatusPill, PriorityDot } from './TicketStatusPill';
import type { StaffOption, TicketRow } from '@/lib/types/ticket';

const SELECT: React.CSSProperties = { padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit' };

export function TicketHeaderControls({ ticket, staff, canApprove, labels }: { ticket: TicketRow; staff: StaffOption[]; canApprove: boolean; labels?: Record<string, string> }) {
  const lab = (s: TicketStatus) => labels?.[s] ?? TICKET_STATUSES.labels[s];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState<TicketStatus | null>(null);
  const [resolution, setResolution] = useState<string>('delivered');
  const [reassign, setReassign] = useState<{ to: string; reason: string } | null>(null);
  const moves = TICKET_TRANSITIONS[ticket.status];

  function move(to: TicketStatus, res?: string) {
    start(async () => {
      const r = await moveTicketStatusAction({ ticket_id: ticket.id, status: to, resolution: res ?? null });
      if (r.error) { toast.danger(r.error); return; }
      setClosing(null); router.refresh();
    });
  }
  function assign(to: string, reason?: string) {
    start(async () => {
      const r = await assignTicketAction({ ticket_id: ticket.id, assignee_id: to || null, reason: reason ?? null });
      if (r.error) { toast.danger(r.error); return; }
      setReassign(null); router.refresh();
    });
  }
  function priority(p: TicketPriority, approve: boolean) {
    start(async () => {
      const r = await setTicketPriorityAction({ ticket_id: ticket.id, priority: p, approve });
      if (r.error) { toast.danger(r.error); return; }
      toast.success(approve ? 'Priority approved. The SLA is running.' : 'Priority changed.'); router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
      <TicketStatusPill status={ticket.status} />
      <select style={SELECT} value="" disabled={pending || moves.length === 0} onChange={(e) => {
        const to = e.target.value as TicketStatus; if (!to) return;
        if (to === 'resolved' || to === 'closed' || to === 'dropped') setClosing(to); else move(to);
      }}>
        <option value="">Move to…</option>
        {moves.map((m) => <option key={m} value={m}>{lab(m)}</option>)}
      </select>
      {closing && (
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <select style={SELECT} value={resolution} onChange={(e) => setResolution(e.target.value)}>
            {TICKET_RESOLUTIONS.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <Button size="xs" onClick={() => move(closing, resolution)} loading={pending}>{lab(closing)}</Button>
          <Button size="xs" variant="ghost" onClick={() => setClosing(null)}>Cancel</Button>
        </span>
      )}

      <span style={{ width: 1, height: 20, background: 'var(--theme-paper-border)' }} />
      <PriorityDot priority={ticket.priority} approved={Boolean(ticket.priority_approved_at)} />
      <select style={SELECT} value={ticket.priority} disabled={pending} onChange={(e) => priority(e.target.value as TicketPriority, canApprove)}>
        {TICKET_PRIORITIES.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {canApprove && !ticket.priority_approved_at && (
        <Button size="xs" onClick={() => priority(ticket.priority, true)} loading={pending}>Approve priority</Button>
      )}

      <span style={{ width: 1, height: 20, background: 'var(--theme-paper-border)' }} />
      {reassign ? (
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={SELECT} value={reassign.to} onChange={(e) => setReassign({ ...reassign, to: e.target.value })}>
            <option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          {ticket.assignee_id && (
            <select style={SELECT} value={reassign.reason} onChange={(e) => setReassign({ ...reassign, reason: e.target.value })}>
              {TICKET_REASSIGN_REASONS.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          <Button size="xs" onClick={() => assign(reassign.to, ticket.assignee_id ? reassign.reason : undefined)} loading={pending}>Save</Button>
          <Button size="xs" variant="ghost" onClick={() => setReassign(null)}>Cancel</Button>
        </span>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => setReassign({ to: ticket.assignee_id ?? '', reason: 'shift_end' })}>
          {ticket.assignee_id ? `Genie: ${staff.find((s) => s.id === ticket.assignee_id)?.full_name ?? '…'} · change` : 'Assign a genie'}
        </Button>
      )}
    </div>
  );
}

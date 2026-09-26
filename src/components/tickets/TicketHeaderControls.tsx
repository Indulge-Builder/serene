'use client';

// TicketHeaderControls — status, priority (with the bishop's approval) and the assignee, in
// one strip. Every change is one action → one RPC → one event. The status menu offers only
// the moves the state machine allows.

import { FormSelect } from '@/components/ui/FormSelect';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { assignTicketAction, moveTicketStatusAction, setTicketPriorityAction } from '@/lib/actions/tickets';
import { Modal } from '@/components/ui/modal';
import { VendorFinder } from '@/components/tickets/VendorFinder';
import { VendorReviewForm } from '@/components/tickets/VendorReviewForm';
import { TICKET_PRIORITIES, TICKET_REASSIGN_REASONS, TICKET_RESOLUTIONS, TICKET_STATUSES, TICKET_TRANSITIONS, TICKET_VENDOR_REQUIRED_STATUSES, type TicketPriority, type TicketStatus } from '@/lib/constants/tickets';
import { TicketStatusPill, PriorityDot } from './TicketStatusPill';
import type { StaffOption, TicketRow } from '@/lib/types/ticket';


export function TicketHeaderControls({ ticket, staff, canApprove, labels, vendorName = null }: { ticket: TicketRow; staff: StaffOption[]; canApprove: boolean; labels?: Record<string, string>; /** The vendor on the ticket, for the review asked right after resolving. */ vendorName?: string | null }) {
  const lab = (s: TicketStatus) => labels?.[s] ?? TICKET_STATUSES.labels[s];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState<TicketStatus | null>(null);
  const [resolution, setResolution] = useState<string>('delivered');
  const [reassign, setReassign] = useState<{ to: string; reason: string } | null>(null);
  // A vendor stage needs a vendor: the move waits in this dialog until one is chosen (2026-09-19).
  const [needsVendor, setNeedsVendor] = useState<TicketStatus | null>(null);
  // Right after resolving a ticket that had a vendor: how did it go, how did they do.
  const [askReview, setAskReview] = useState(false);
  const moves = TICKET_TRANSITIONS[ticket.status];

  function move(to: TicketStatus, res?: string, vendorId?: string) {
    if (TICKET_VENDOR_REQUIRED_STATUSES.includes(to) && !ticket.vendor_id && !vendorId) { setNeedsVendor(to); return; }
    start(async () => {
      const r = await moveTicketStatusAction({ ticket_id: ticket.id, status: to, resolution: res ?? null, vendor_id: vendorId ?? null });
      if (r.error) { toast.danger(r.error); return; }
      setClosing(null); setNeedsVendor(null);
      if (to === 'resolved' && ticket.vendor_id && (res ?? 'delivered') === 'delivered') setAskReview(true);
      router.refresh();
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
      <FormSelect aria-label="Move ticket" fullWidth={false} value="" disabled={pending || moves.length === 0} onValueChange={(nextValue) => {
        const to = nextValue as TicketStatus; if (!to) return;
        if (to === 'resolved' || to === 'closed' || to === 'dropped') setClosing(to); else move(to);
      }}>
        <option value="">Move to…</option>
        {moves.map((m) => <option key={m} value={m}>{lab(m)}</option>)}
      </FormSelect>
      {closing && (
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <FormSelect aria-label="Resolution" fullWidth={false} value={resolution} onValueChange={(nextValue) => setResolution(nextValue)}>
            {TICKET_RESOLUTIONS.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </FormSelect>
          <Button size="xs" onClick={() => move(closing, resolution)} loading={pending}>{lab(closing)}</Button>
          <Button size="xs" variant="ghost" onClick={() => setClosing(null)}>Cancel</Button>
        </span>
      )}

      <span className="max-md:hidden" style={{ width: 1, height: 20, background: 'var(--theme-paper-border)' }} />
      <PriorityDot priority={ticket.priority} approved={Boolean(ticket.priority_approved_at)} />
      <FormSelect aria-label="Priority" fullWidth={false} value={ticket.priority} disabled={pending} onValueChange={(nextValue) => priority(nextValue as TicketPriority, canApprove)}>
        {TICKET_PRIORITIES.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </FormSelect>
      {canApprove && !ticket.priority_approved_at && (
        <Button size="xs" onClick={() => priority(ticket.priority, true)} loading={pending}>Approve priority</Button>
      )}

      <span className="max-md:hidden" style={{ width: 1, height: 20, background: 'var(--theme-paper-border)' }} />
      {reassign ? (
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <FormSelect aria-label="Assign to" fullWidth={false} value={reassign.to} onValueChange={(nextValue) => setReassign({ ...reassign, to: nextValue })}>
            <option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </FormSelect>
          {ticket.assignee_id && (
            <FormSelect aria-label="Reassignment reason" fullWidth={false} value={reassign.reason} onValueChange={(nextValue) => setReassign({ ...reassign, reason: nextValue })}>
              {TICKET_REASSIGN_REASONS.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </FormSelect>
          )}
          <Button size="xs" onClick={() => assign(reassign.to, ticket.assignee_id ? reassign.reason : undefined)} loading={pending}>Save</Button>
          <Button size="xs" variant="ghost" onClick={() => setReassign(null)}>Cancel</Button>
        </span>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => setReassign({ to: ticket.assignee_id ?? '', reason: 'shift_end' })}>
          {ticket.assignee_id ? `Genie: ${staff.find((s) => s.id === ticket.assignee_id)?.full_name ?? '…'} · change` : 'Assign a genie'}
        </Button>
      )}
      <Modal open={needsVendor !== null} onClose={() => setNeedsVendor(null)} title="Who is doing this job?" description={`A ticket cannot move to ${needsVendor ? lab(needsVendor) : 'this stage'} until the vendor is chosen.`} size="md">
        {needsVendor && <VendorFinder ticketId={ticket.id} disabled={pending} action="Choose" onPick={(v) => move(needsVendor, undefined, v.id)} />}
      </Modal>
      <Modal open={askReview} onClose={() => setAskReview(false)} title={`How did ${vendorName ?? 'the vendor'} do?`} description="The ticket is resolved. A minute now is what makes the next suggestion better." size="md">
        {askReview && <VendorReviewForm ticketId={ticket.id} vendorName={vendorName ?? 'The vendor'} onDone={() => { setAskReview(false); router.refresh(); }} />}
      </Modal>
    </div>
  );
}

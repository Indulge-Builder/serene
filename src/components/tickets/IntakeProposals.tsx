'use client';

// IntakeProposals — the cards Serene proposes from the member groups (member-ticket-plan.md
// 7.8b, migration 0219). A card is a suggestion, never a ticket: "Review and create" opens the
// New ticket form already filled from the chat and the member's profile; the human checks it,
// fixes what is wrong and creates. Dismiss asks for the reason, because the reason is how
// intake gets better. Exactly two actions per card (the Elaya proposal rule).

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { formatRelativeTime } from '@/lib/utils/dates';
import { acceptIntakeUpdateAction, dismissIntakeProposalAction } from '@/lib/actions/tickets';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKETS_PATH } from '@/lib/constants/tickets';
import { INTAKE_DISMISS_REASONS, INTAKE_SURE_CONFIDENCE, type IntakeDismissReason } from '@/lib/constants/ticket-intake';
import type { IntakeProposal, IntakeStats } from '@/lib/types/intake';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const CHIP: React.CSSProperties = { fontSize: 'var(--text-2xs)', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', background: 'var(--theme-paper-subtle)', color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' };

function pct(n: number, of: number): string { return of > 0 ? `${Math.round((n / of) * 100)}%` : '—'; }

/** How intake is doing: the training-phase numbers (admin and founder only; the page decides). */
function StatsLine({ stats }: { stats: IntakeStats }) {
  const decided = stats.accepted + stats.dismissed;
  const parts = [
    `${stats.bursts_read} chats read in ${stats.days} days`,
    `${stats.proposed} suggested`,
    `${stats.accepted} accepted (${stats.accepted_untouched} with no edits)`,
    `${stats.dismissed} dismissed`,
    `right ${pct(stats.accepted, decided)} of the time`,
    `Freshdesk agreed on ${stats.freshdesk_agreed} of ${stats.freshdesk_checked}`,
    `about $${stats.cost_usd.toFixed(2)}`,
  ];
  return <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{parts.join(' · ')}</p>;
}

function Card({ p, onGone }: { p: IntakeProposal; onGone: (id: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const sure = p.confidence >= INTAKE_SURE_CONFIDENCE;
  const first = p.messages.find((m) => m.from_member) ?? p.messages[0];

  const dismiss = (reason: IntakeDismissReason) => start(async () => {
    const res = await dismissIntakeProposalAction({ proposal_id: p.id, reason });
    if (res.error) { toast.danger(res.error); return; }
    onGone(p.id);
  });
  const addToTicket = () => start(async () => {
    const res = await acceptIntakeUpdateAction({ proposal_id: p.id });
    if (res.error) { toast.danger(res.error); return; }
    toast.success(`Added to ${p.ticket_no ?? 'the ticket'}.`);
    onGone(p.id);
  });

  return (
    <li style={{ listStyle: 'none', padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--theme-paper-border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>{p.member_name}</span>
        <span style={CHIP}>{p.kind === 'update' ? `Update to ${p.ticket_no ?? 'a ticket'}` : sure ? 'A request' : 'Is this a request?'}</span>
        {p.kind === 'request' && p.draft.category && <span style={CHIP}>{TICKET_CATEGORIES.labels[p.draft.category] ?? p.draft.category}</span>}
        {p.kind === 'request' && p.draft.priority && <span style={CHIP}>{TICKET_PRIORITIES.labels[p.draft.priority]}</span>}
        {(p.tone === 'frustrated' || p.tone === 'angry') && <span style={{ ...CHIP, background: 'var(--color-warning-light)', color: 'var(--color-warning-text)' }}>{p.tone}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>{formatRelativeTime(p.last_message_at)}</span>
      </div>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)' }}>{p.kind === 'request' ? (p.draft.title || p.summary) : p.summary}</span>
      {first && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)', whiteSpace: 'pre-wrap' }}>“{first.text.slice(0, 220)}{first.text.length > 220 ? '…' : ''}”{p.messages.length > 1 ? `  +${p.messages.length - 1} more` : ''}</span>}

      {asking ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Why?</span>
          {INTAKE_DISMISS_REASONS.map((r) => <Button key={r.id} variant="ghost" size="xs" disabled={pending} onClick={() => dismiss(r.id)}>{r.label}</Button>)}
          <Button variant="ghost" size="xs" disabled={pending} onClick={() => setAsking(false)}>Back</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {p.kind === 'update'
            ? <Button size="xs" disabled={pending} onClick={addToTicket}>Add to {p.ticket_no ?? 'the ticket'}</Button>
            : <Link href={`${TICKETS_PATH}/new?proposal=${p.id}`} className="serene-btn-primary serene-pressable" style={{ padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)' }}>Review and create</Link>}
          <Button variant="ghost" size="xs" disabled={pending} onClick={() => setAsking(true)}>Dismiss</Button>
        </div>
      )}
    </li>
  );
}

export function IntakeProposals({ proposals, stats }: { proposals: IntakeProposal[]; stats: IntakeStats | null }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = proposals.filter((p) => !gone.has(p.id));
  if (shown.length === 0 && !stats) return null; // additive: nothing to show, nothing rendered
  return (
    <section style={{ ...SHELL, marginBottom: 'var(--space-4)' }}>
      <CardHeader icon={Sparkles} label="Suggested by Serene" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{shown.length}</span>} />
      {stats && <div style={{ padding: 'var(--space-3) var(--space-6)' }}><StatsLine stats={stats} /></div>}
      {shown.length > 0
        ? <ul style={{ margin: 0, padding: 0 }}>{shown.map((p) => <Card key={p.id} p={p} onGone={(id) => setGone((s) => new Set(s).add(id))} />)}</ul>
        : <div style={{ padding: '0 var(--space-6) var(--space-4)' }}><EmptyState variant="inline" title="Nothing waiting. Serene is listening." /></div>}
    </section>
  );
}

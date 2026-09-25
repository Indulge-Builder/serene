'use client';

// IntakeProposals — the cards Serene proposes from the member groups (member-ticket-plan.md
// 7.8b, migration 0219). A card is a suggestion, never a ticket: "Review and create" opens the
// New ticket form already filled from the chat and the member's profile; the human checks it,
// fixes what is wrong and creates. Dismiss asks for the reason, because the reason is how
// intake gets better. Exactly two actions per card (the Elaya proposal rule).

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { formatRelativeTime } from '@/lib/utils/dates';
import { acceptIntakeUpdateAction, dismissIntakeProposalAction } from '@/lib/actions/tickets';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKETS_PATH } from '@/lib/constants/tickets';
import { INTAKE_DISMISS_REASONS, INTAKE_STRIP_FIRST, INTAKE_SURE_CONFIDENCE, type IntakeDismissReason } from '@/lib/constants/ticket-intake';
import type { IntakeProposal, IntakeStats } from '@/lib/types/intake';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const CHIP: React.CSSProperties = { fontSize: 'var(--text-2xs)', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', background: 'var(--theme-paper-subtle)', color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' };

function pct(n: number, of: number): string { return of > 0 ? `${Math.round((n / of) * 100)}%` : '—'; }

/**
 * How intake is doing: the training-phase numbers (admin and founder only; the page decides).
 * `null` = still counting: the row keeps its height so the page does not move when it lands.
 */
export function IntakeStatsLine({ stats }: { stats: IntakeStats | null }) {
  const style: React.CSSProperties = { margin: 0, padding: 'var(--space-3) var(--space-6)', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-normal)', color: 'var(--theme-text-tertiary)', minHeight: 'calc(var(--space-3) * 2 + 1.5em)' };
  if (!stats) return <p style={style}>Counting the week…</p>;
  const decided = stats.accepted + stats.dismissed;
  const parts = [
    `${stats.bursts_read} chats read in ${stats.days} days`,
    `${stats.proposed} suggested`,
    `${stats.accepted} accepted (${stats.accepted_untouched} with no edits)`,
    `${stats.dismissed} dismissed`,
    `right ${pct(stats.accepted, decided)} of the time`,
    `Freshdesk agreed on ${stats.freshdesk_agreed} of ${stats.freshdesk_checked}`,
    `health: ${Object.entries(stats.health_by_signal).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ') || 'no signals yet'}`,
    `about $${stats.cost_usd.toFixed(2)}`,
  ];
  return <p style={style}>{parts.join(' · ')}</p>;
}

function Card({ p, onGone, grouped }: { p: IntakeProposal; onGone: (id: string) => void; grouped: boolean }) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const sure = p.confidence >= INTAKE_SURE_CONFIDENCE;
  const first = p.messages.find((m) => m.from_member) ?? p.messages[0];

  const dismiss = (reason: IntakeDismissReason) => start(async () => {
    const res = await dismissIntakeProposalAction({ proposal_id: p.id, reason, note: note.trim() || null });
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
    <li style={{ listStyle: 'none', padding: grouped ? 'var(--space-3) var(--space-6) var(--space-4)' : 'var(--space-4) var(--space-6)', borderTop: grouped ? undefined : '1px solid var(--theme-paper-border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {!grouped && <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>{p.member_name}</span>}
        <span style={CHIP}>{p.kind === 'update' ? `Update to ${p.ticket_no ?? 'a ticket'}` : sure ? 'A request' : 'Is this a request?'}</span>
        {p.kind === 'request' && p.draft.category && <span style={CHIP}>{TICKET_CATEGORIES.labels[p.draft.category] ?? p.draft.category}</span>}
        {p.kind === 'request' && p.draft.priority && <span style={CHIP}>{TICKET_PRIORITIES.labels[p.draft.priority]}</span>}
        {(p.tone === 'frustrated' || p.tone === 'angry') && <span style={{ ...CHIP, background: 'var(--color-warning-light)', color: 'var(--color-warning-text)' }}>{p.tone}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>{formatRelativeTime(p.last_message_at)}</span>
      </div>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)' }}>{p.kind === 'request' ? (p.draft.title || p.summary) : p.summary}</span>
      {first && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)', whiteSpace: 'pre-wrap' }}>“{first.text.slice(0, 220)}{first.text.length > 220 ? '…' : ''}”{p.messages.length > 1 ? `  +${p.messages.length - 1} more` : ''}</span>}

      {asking ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <input
            className="serene-input-bare"
            style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper-subtle)', color: 'var(--theme-text-primary)', maxWidth: 520 }}
            value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={pending}
            placeholder="In your words, why? (optional: this is how it learns)"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Because it is</span>
            {INTAKE_DISMISS_REASONS.map((r) => <Button key={r.id} variant="ghost" size="xs" disabled={pending} onClick={() => dismiss(r.id)}>{r.label}</Button>)}
            <Button variant="ghost" size="xs" disabled={pending} onClick={() => setAsking(false)}>Back</Button>
          </div>
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

/** The open cards, newest first, one group per member (a member with three bursts is one thing to look at, not three). */
function groupByMember(cards: IntakeProposal[]): { member_id: string; member_name: string; cards: IntakeProposal[] }[] {
  const out: { member_id: string; member_name: string; cards: IntakeProposal[] }[] = [];
  const at = new Map<string, number>();
  for (const p of cards) {
    const i = at.get(p.member_id);
    if (i === undefined) { at.set(p.member_id, out.length); out.push({ member_id: p.member_id, member_name: p.member_name, cards: [p] }); }
    else out[i].cards.push(p);
  }
  return out;
}

export function IntakeProposals({ proposals, total, statsSlot }: { proposals: IntakeProposal[]; total: number; statsSlot?: ReactNode }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const shown = proposals.filter((p) => !gone.has(p.id));
  const waiting = Math.max(0, total - gone.size);
  if (shown.length === 0 && !statsSlot) return null; // additive: nothing to show, nothing rendered
  const groups = groupByMember(shown);
  const visible = showAll ? groups : groups.slice(0, INTAKE_STRIP_FIRST);
  const hidden = groups.length - visible.length;
  const onGone = (id: string) => setGone((s) => new Set(s).add(id));
  return (
    <section style={{ ...SHELL, marginBottom: 'var(--space-4)' }}>
      <CardHeader icon={Sparkles} label="Suggested by Serene" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{waiting === 0 ? 'nothing waiting' : `${waiting} waiting · ${groups.length} member${groups.length === 1 ? '' : 's'}`}</span>} />
      {statsSlot}
      {shown.length > 0 ? (
        <>
          <ul style={{ margin: 0, padding: 0 }}>
            {visible.map((g) => (
              <li key={g.member_id} style={{ listStyle: 'none' }}>
                {g.cards.length > 1 && (
                  <div style={{ padding: 'var(--space-2) var(--space-6) 0', fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)', borderTop: '1px solid var(--theme-paper-border)' }}>{g.member_name} · {g.cards.length} suggestions</div>
                )}
                <ul style={{ margin: 0, padding: 0 }}>{g.cards.map((p) => <Card key={p.id} p={p} onGone={onGone} grouped={g.cards.length > 1} />)}</ul>
              </li>
            ))}
          </ul>
          {(hidden > 0 || showAll) && (
            <div style={{ padding: 'var(--space-3) var(--space-6)', borderTop: '1px solid var(--theme-paper-border)' }}>
              <Button variant="ghost" size="xs" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show ${hidden} more member${hidden === 1 ? '' : 's'}`}</Button>
              {showAll && waiting > shown.length && <span style={{ marginLeft: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{waiting - shown.length} older ones load once these are decided.</span>}
            </div>
          )}
        </>
      ) : <div style={{ padding: '0 var(--space-6) var(--space-4)' }}><EmptyState variant="inline" title="Nothing waiting. Serene is listening." /></div>}
    </section>
  );
}

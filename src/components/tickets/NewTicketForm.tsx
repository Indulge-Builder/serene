'use client';

// NewTicketForm — THE new-ticket page body (member-ticket-plan.md 7.8, phase 1).
//
// Two ways in, one form: (a) from Sia, the selected messages arrive through sessionStorage
// (the chat wrote them) and the ticket creator pre-fills everything; (b) by hand, the genie
// picks the member and fills the brief. Everything is editable before saving. Priority is a
// suggestion until a bishop approves it on the ticket page; the SLA starts then.

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { createTicketAction, draftTicketAction, listQueendomStaffAction } from '@/lib/actions/tickets';
import { searchMembersAction } from '@/lib/actions/members';
import {
  TICKET_BRIEF_FIELDS_BY_CATEGORY, TICKET_BRIEF_FIELD_LABELS, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_SUB_CATEGORIES, TICKETS_PATH,
  type TicketCategory, type TicketPriority, type TicketBriefField,
} from '@/lib/constants/tickets';
import type { MemberPickerHit } from '@/lib/types/member';
import type { StaffOption, TicketDraft } from '@/lib/types/ticket';
import type { IntakeProposal } from '@/lib/types/intake';

export const TICKET_SELECTION_KEY = 'serene:ticket-selection';
export type TicketSelection = {
  member_id: string;
  member_name: string;
  queendom_id: string | null;
  group_jid: string;
  messages: { chat_jid: string; wa_message_id: string; sender_jid: string; sender_name: string | null; from_member: boolean; at: string; text: string }[];
};

const FIELD: React.CSSProperties = { width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', boxSizing: 'border-box' };
const CARD: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', padding: 'var(--space-6)' };
function Label({ children }: { children: React.ReactNode }) {
  return <span className="label-micro" style={{ display: 'block', color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-2)' }}>{children}</span>;
}

type BriefState = Partial<Record<TicketBriefField, string | boolean>>;

export function NewTicketForm({ initialMember, callerQueendomId, initialProposal = null }: {
  initialMember: { id: string; full_name: string; queendom_id: string | null } | null;
  callerQueendomId: string | null;
  /** (c) From an intake card (0219): Serene found the messages AND already drafted the ticket. The human checks and creates. */
  initialProposal?: IntakeProposal | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [selection, setSelection] = useState<TicketSelection | null>(null);
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [member, setMember] = useState(initialMember);
  const [memberQuery, setMemberQuery] = useState('');
  const [hits, setHits] = useState<MemberPickerHit[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [form, setForm] = useState({ category: 'special_request' as TicketCategory, sub_category: '', title: '', priority: 'medium' as TicketPriority, requested_for: '', assignee_id: '', note: '' });
  const [brief, setBrief] = useState<BriefState>({});
  const [error, setError] = useState<string | null>(null);

  const applyDraft = (d: Partial<TicketDraft>) => {
    setForm((f) => ({ ...f, category: d.category ?? f.category, sub_category: d.sub_category ?? '', title: d.title ?? f.title, priority: d.priority ?? f.priority, requested_for: d.requested_for ? d.requested_for.slice(0, 16) : '' }));
    const b: BriefState = {};
    for (const [k, v] of Object.entries(d.brief ?? {})) if (v != null && v !== '') b[k as TicketBriefField] = typeof v === 'boolean' ? v : String(v);
    setBrief(b);
  };

  // (c) From an intake card: the messages and the draft arrive together; no model is asked again.
  useEffect(() => {
    if (!initialProposal) return;
    const p = initialProposal;
    setSelection({ member_id: p.member_id, member_name: p.member_name, queendom_id: p.queendom_id, group_jid: p.group_jid, messages: p.messages });
    setForm((f) => ({ ...f, note: p.messages.map((m) => `${m.from_member ? 'Member' : m.sender_name ?? 'Staff'}: ${m.text}`).join('\n') }));
    if (p.draft.title) setDraft(p.draft as TicketDraft);
    applyDraft(p.draft);
  }, [initialProposal]);

  // (a) From Sia: read the selection once, draft with the creator.
  useEffect(() => {
    if (initialProposal) return;
    try {
      const raw = sessionStorage.getItem(TICKET_SELECTION_KEY);
      if (!raw) return;
      const sel = JSON.parse(raw) as TicketSelection;
      sessionStorage.removeItem(TICKET_SELECTION_KEY);
      setSelection(sel);
      setMember({ id: sel.member_id, full_name: sel.member_name, queendom_id: sel.queendom_id });
      setForm((f) => ({ ...f, note: sel.messages.map((m) => `${m.from_member ? 'Member' : m.sender_name ?? 'Staff'}: ${m.text}`).join('\n') }));
      setDrafting(true);
      draftTicketAction({ member_id: sel.member_id, group_jid: sel.group_jid, messages: sel.messages }).then((res) => {
        setDrafting(false);
        if (res.error || !res.data) { toast.warning(res.error ?? 'Elaya could not draft this; fill it by hand.'); return; }
        setDraft(res.data);
        applyDraft(res.data);
      });
    } catch { /* no selection */ }
  }, [initialProposal]);

  // The member picker (by hand).
  useEffect(() => {
    const q = memberQuery.trim();
    if (q.length < 2) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => { const res = await searchMembersAction({ q, limit: 8 }); if (alive && res.data) setHits(res.data); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [memberQuery]);

  // The assignee list follows the member's queendom.
  useEffect(() => {
    const qid = member?.queendom_id ?? callerQueendomId;
    listQueendomStaffAction({ queendom_id: qid }).then((res) => { if (res.data) setStaff(res.data); });
  }, [member?.queendom_id, callerQueendomId]);

  const fields = useMemo(() => TICKET_BRIEF_FIELDS_BY_CATEGORY[form.category], [form.category]);
  const subs = TICKET_SUB_CATEGORIES[form.category];

  function submit() {
    if (!member) { setError('Pick the member first.'); return; }
    setError(null);
    start(async () => {
      const cleanBrief: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(brief)) if (v !== '' && v != null) cleanBrief[k] = v;
      const res = await createTicketAction({
        member_id: member.id, category: form.category, sub_category: form.sub_category || null, title: form.title, brief: cleanBrief,
        priority: form.priority, requested_for: form.requested_for ? new Date(form.requested_for).toISOString() : null,
        origin: selection ? 'whatsapp_group' : 'manual', group_jid: selection?.group_jid ?? null, assignee_id: form.assignee_id || null,
        message_links: (selection?.messages ?? []).map((m, i) => ({ chat_jid: m.chat_jid, wa_message_id: m.wa_message_id, sender_jid: m.sender_jid, link_kind: i === 0 ? 'origin' : 'update' })),
        proposed_by_run_id: draft?.run_id ?? null, note: form.note || null,
        proposal_id: initialProposal?.id ?? null,
      });
      if (res.error || !res.data) { setError(res.error ?? 'Could not create the ticket.'); return; }
      toast.success(`${res.data.ticket_no} created.`);
      router.push(`${TICKETS_PATH}/${res.data.id}`);
    });
  }

  return (
    <div className="serene-dossier-grid serene-dossier-grid--340" style={{ alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div style={CARD}>
          <Label>Member</Label>
          {member ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ fontWeight: 'var(--weight-medium)' }}>{member.full_name}</span>
              {!selection && <Button variant="ghost" size="xs" onClick={() => setMember(null)}>Change</Button>}
            </div>
          ) : (
            <>
              <input style={FIELD} value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Search a member by name or number" autoFocus />
              {hits.length > 0 && (
                <ul style={{ margin: 'var(--space-2) 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {hits.map((h) => (
                    <li key={h.id}><button type="button" onClick={() => { setMember({ id: h.id, full_name: h.full_name, queendom_id: null }); setHits([]); setMemberQuery(''); }} className="serene-pressable"
                      style={{ width: '100%', textAlign: 'left', background: 'none', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)' }}>
                      {h.full_name}<span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', marginLeft: 'var(--space-2)' }}>{h.primary_phone ?? ''}{h.queendom_name ? ` · ${h.queendom_name}` : ''}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div style={CARD}>
          {drafting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--neu-accent-deep)' }}>
              <Sparkles style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} /> Elaya is reading the messages…
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
            <label><Label>Category</Label>
              <select style={FIELD} value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value as TicketCategory, sub_category: '' }); }}>
                {TICKET_CATEGORIES.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            {subs.length > 0 && (
              <label><Label>Sub-category</Label>
                <select style={FIELD} value={form.sub_category} onChange={(e) => setForm({ ...form, sub_category: e.target.value })}>
                  <option value="">Not set</option>{subs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
            )}
            <label style={{ gridColumn: '1 / -1' }}><Label>Title</Label><input style={FIELD} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What the member wants, in one line" /></label>
            {fields.map((f) => (
              <label key={f} style={f === 'notes' || f === 'delivery_address' || f === 'product_details' ? { gridColumn: '1 / -1' } : undefined}>
                <Label>{TICKET_BRIEF_FIELD_LABELS[f]}</Label>
                {f === 'early_check_in' ? (
                  <select style={FIELD} value={brief[f] === true ? 'yes' : brief[f] === false ? 'no' : ''} onChange={(e) => setBrief({ ...brief, [f]: e.target.value === '' ? undefined : e.target.value === 'yes' })}><option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option></select>
                ) : (
                  <input style={FIELD} type={f === 'date' || f === 'date_to' ? 'datetime-local' : 'text'} value={typeof brief[f] === 'string' ? (brief[f] as string) : ''} onChange={(e) => setBrief({ ...brief, [f]: e.target.value })} />
                )}
              </label>
            ))}
            <label><Label>Priority (suggested)</Label>
              <select style={FIELD} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}>
                {TICKET_PRIORITIES.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {draft?.priority_reason && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{draft.priority_reason}</span>}
            </label>
            <label><Label>Needed by</Label><input style={FIELD} type="datetime-local" value={form.requested_for} onChange={(e) => setForm({ ...form, requested_for: e.target.value })} /></label>
            <label><Label>Genie</Label>
              <select style={FIELD} value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                <option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.sia_role ? ` (${s.sia_role})` : ''}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}><Label>Note (the member's words, or why)</Label><textarea style={{ ...FIELD, minHeight: 90, resize: 'vertical' }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          {error && <p style={{ margin: 'var(--space-4) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-danger-text)' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
            <Button variant="ghost" onClick={() => router.back()} disabled={pending}>Cancel</Button>
            <Button onClick={submit} loading={pending} loadingLabel="Creating…" disabled={!member || !form.title.trim() || drafting}>Create ticket</Button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {draft && (
          <div style={CARD}>
            <Label>Elaya suggests</Label>
            <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', whiteSpace: 'pre-wrap' }}>{draft.acknowledgement || 'No acknowledgement drafted.'}</p>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>A reply the genie can send in the group by hand. Confidence {Math.round(draft.confidence * 100)}%.</span>
            {draft.vendor_terms.length > 0 && <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>Vendor search: {draft.vendor_terms.join(', ')}</p>}
          </div>
        )}
        {selection && (
          <div style={CARD}>
            <Label>{selection.messages.length} selected messages</Label>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 360, overflowY: 'auto' }}>
              {selection.messages.map((m) => (
                <li key={m.wa_message_id} style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
                  <span style={{ color: 'var(--theme-text-tertiary)' }}>{m.from_member ? 'Member' : (m.sender_name ?? 'Staff')} · </span>{m.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

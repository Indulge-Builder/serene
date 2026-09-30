'use client';

// TicketInvoicePanel — the invoice for a Freshdesk ticket in Invoice Due (0250;
// docs/architecture/finance-plan.md). The right-hand working surface of the ticket page for a
// finance person: the ticket's thread stays readable on the left while the invoice is checked.
//
// Four states, one card:
//   ready     what Serene read from the template note, and one button: Generate invoice
//   preview   the invoice as it will be made: member, date, editable lines, the member's credit,
//             what the balance will be. Confirm and send asks once more, then writes
//   sending   the two halves, named as they land (Zoho Books, then the Freshdesk ticket)
//   done      the invoice number, what was applied, who the ticket shows it under
// Display and calls only: every write is a server action in actions/finance.ts.

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { Check, ExternalLink, FileText, Plus, ReceiptText, X } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Field, Input } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { DatePicker } from '@/components/ui/DatePicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CollapseReveal } from '@/components/ui/CollapseReveal';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import { toast } from '@/lib/toast';
import {
  createTicketInvoiceAction, draftTicketInvoiceAction, releaseInvoiceAction, searchMembersForInvoiceAction, updateTicketForInvoiceAction,
} from '@/lib/actions/finance';
import { FINANCE_INVOICE_DUE_STATUS, FINANCE_INVOICED_TAG, FINANCE_MAX_ITEMS, ZOHO_REIMBURSEMENT_ITEM_NAME } from '@/lib/constants/finance';
import { formatCurrency } from '@/lib/utils/numbers';
import { formatDate, parseIsoDate, toIsoDate } from '@/lib/utils/dates';
import type { FinanceInvoiceDraft, FinanceInvoiceRow } from '@/lib/types/finance';
import type { MemberPickerHit } from '@/lib/types/member';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' };
const QUIET: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' };
const MONEY: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

type Line = { key: string; description: string; amount: string; vendor: string | null; mode: string | null; noteId: number | null; asWritten: string | null };
type Phase = 'ready' | 'preview' | 'zoho' | 'freshdesk';

let lineSeq = 0;
const toLines = (draft: FinanceInvoiceDraft): Line[] => draft.items.map((i) => ({
  key: `l${lineSeq++}`, description: i.description, amount: i.amount != null ? String(i.amount) : '', vendor: i.vendor, mode: i.mode, noteId: i.noteId, asWritten: i.amountAsWritten,
}));
const amountOf = (l: Line): number => { const n = Number(l.amount.replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>{label}</span>
      <span style={{ ...MONEY, fontSize: strong ? 'var(--text-lg)' : 'var(--text-sm)', fontWeight: strong ? 'var(--weight-semibold)' : 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>{value}</span>
    </div>
  );
}

function Done({ invoice, zohoUrl, canRelease, onRetry, retrying, onReleased }: { invoice: FinanceInvoiceRow; zohoUrl: string | null; canRelease: boolean; onRetry: () => void; retrying: boolean; onReleased: () => void }) {
  const ticketDone = Boolean(invoice.steps.fd_note && invoice.steps.fd_fields);
  const [releasing, setReleasing] = useState(false);
  const [pending, start] = useTransition();
  const release = () => start(async () => {
    const r = await releaseInvoiceAction({ invoiceId: invoice.id, reason: 'Voided in Zoho Books; the ticket is released to be invoiced again.' });
    setReleasing(false);
    if (r.error) { toast.danger(r.error); return; }
    toast.success('Released. The ticket can be invoiced again.');
    onReleased();
  });
  return (
    <div style={BODY}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{ ...MONEY, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)' }}>{invoice.invoice_number ?? 'Invoice'}</span>
        <Badge tone={ticketDone ? 'success' : 'warning'}>{ticketDone ? 'Invoiced' : 'Ticket not updated yet'}</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Row label="Total" value={formatCurrency(Number(invoice.total))} strong />
        <Row label="Credit applied" value={formatCurrency(Number(invoice.credit_applied))} />
        <Row label="Balance" value={formatCurrency(Number(invoice.balance ?? 0))} />
      </div>
      <span style={QUIET}>Made by {invoice.created_by_name} on {formatDate(invoice.created_at, 'd MMM yyyy, h:mm a')}.</span>
      {invoice.error && <Alert tone="warning">{invoice.error}</Alert>}
      {ticketDone ? (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)', lineHeight: 1.5 }}>
          The ticket carries the note with the invoice, Billable is Yes, the invoice number is filled and it is tagged {FINANCE_INVOICED_TAG}. Its agent has been told. The status is theirs to change.
        </span>
      ) : (
        <div><Button size="sm" onClick={onRetry} loading={retrying} loadingLabel="Updating the ticket…">Update the ticket in Freshdesk</Button></div>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {zohoUrl && (
          <a href={zohoUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--neu-accent-deep)' }}>
            Open in Zoho Books <ExternalLink style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
          </a>
        )}
        {canRelease && <Button size="xs" variant="ghost" onClick={() => setReleasing(true)}>Release this ticket</Button>}
      </div>
      <ConfirmDialog
        open={releasing}
        title="Release this ticket?"
        body="Do this only after the invoice was voided in Zoho Books. Serene does not void it. The ticket can then be invoiced again."
        confirmLabel="Release"
        danger
        pending={pending}
        onConfirm={release}
        onCancel={() => setReleasing(false)}
      />
    </div>
  );
}

export function TicketInvoicePanel({ initialDraft, initialZohoUrl, canRelease }: { initialDraft: FinanceInvoiceDraft; initialZohoUrl: string | null; canRelease: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [invoice, setInvoice] = useState<FinanceInvoiceRow | null>(initialDraft.existing?.status === 'invoiced' ? initialDraft.existing : null);
  const [zohoUrl, setZohoUrl] = useState(initialZohoUrl);
  const [phase, setPhase] = useState<Phase>('ready');
  const [lines, setLines] = useState<Line[]>(() => toLines(initialDraft));
  const [date, setDate] = useState(initialDraft.date);
  const [applyCredit, setApplyCredit] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [hits, setHits] = useState<MemberPickerHit[]>([]);
  const [loadingMember, startMember] = useTransition();

  const total = useMemo(() => Math.round(lines.reduce((s, l) => s + amountOf(l), 0) * 100) / 100, [lines]);
  const wallet = draft.walletAvailable;
  const credit = applyCredit && wallet != null ? Math.min(wallet, total) : 0;
  const balance = Math.round((total - credit) * 100) / 100;
  const linesOk = lines.length > 0 && lines.every((l) => l.description.trim() && amountOf(l) > 0);
  const canSend = Boolean(draft.enabled && draft.key.saved && draft.member?.zohoCustomerId && linesOk && date);
  const busy = phase === 'zoho' || phase === 'freshdesk';

  // The member search, for a ticket nobody linked to a member.
  useEffect(() => {
    const q = memberQuery.trim();
    if (q.length < 2) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => { const r = await searchMembersForInvoiceAction({ q }); if (alive && r.data) setHits(r.data); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [memberQuery]);

  const pickMember = (hit: MemberPickerHit) => startMember(async () => {
    const r = await draftTicketInvoiceAction({ ticketId: draft.ticketId, memberId: hit.id });
    if (r.error || !r.data) { toast.danger(r.error ?? 'That member could not be read.'); return; }
    // Only the member and their credit change; the lines the person may have edited stay.
    setDraft((d) => ({ ...d, member: r.data!.member, walletAvailable: r.data!.walletAvailable, warnings: r.data!.warnings }));
    setMemberQuery(''); setHits([]);
  });

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { key: `l${lineSeq++}`, description: '', amount: '', vendor: null, mode: null, noteId: null, asWritten: null }]);
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  async function updateTicket(invoiceId: string) {
    setPhase('freshdesk');
    const r = await updateTicketForInvoiceAction({ invoiceId });
    setPhase('ready');
    if (r.error || !r.data) { setError(r.error ?? 'The ticket could not be updated.'); toast.danger(r.error ?? 'The ticket could not be updated.'); return; }
    setError(null);
    setInvoice(r.data.invoice);
    if (r.data.zohoUrl) setZohoUrl(r.data.zohoUrl);
    toast.success(`Invoice ${r.data.invoice.invoice_number ?? ''} is on the ticket.`);
    router.refresh();
  }

  async function send() {
    setConfirming(false);
    setError(null);
    setPhase('zoho');
    const made = await createTicketInvoiceAction({
      ticketId: draft.ticketId,
      memberId: draft.member?.id ?? null,
      date,
      items: lines.map((l) => ({ description: l.description, amount: amountOf(l), vendor: l.vendor, mode: l.mode, noteId: l.noteId })),
      applyCredit,
    });
    if (made.error || !made.data) { setPhase('preview'); setError(made.error ?? 'The invoice could not be made.'); return; }
    setInvoice(made.data.invoice);
    setZohoUrl(made.data.zohoUrl);
    if (made.data.note) toast.warning(made.data.note);
    await updateTicket(made.data.invoice.id);
  }

  const header = (
    <CardHeader
      icon={ReceiptText}
      label="Invoice"
      right={invoice ? null : <Badge tone={draft.ticketStatus === FINANCE_INVOICE_DUE_STATUS ? 'info' : 'neutral'} size="xs">{draft.ticketStatus === FINANCE_INVOICE_DUE_STATUS ? 'Invoice due' : 'Not in Invoice Due'}</Badge>}
    />
  );

  if (invoice) {
    return (
      <div style={SHELL}>
        {header}
        <Done
          invoice={invoice}
          zohoUrl={zohoUrl}
          canRelease={canRelease}
          retrying={phase === 'freshdesk'}
          onRetry={() => updateTicket(invoice.id)}
          onReleased={() => { setInvoice(null); router.refresh(); }}
        />
        {error && <div style={{ padding: '0 var(--space-5) var(--space-5)' }}><Alert tone="danger">{error}</Alert></div>}
      </div>
    );
  }

  if (busy) {
    return (
      <div style={SHELL}>
        {header}
        <div style={{ ...BODY, alignItems: 'center', padding: 'var(--space-8) var(--space-5)' }}>
          <LogoSpinner size="md" />
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--theme-text-secondary)' }}>
            {phase === 'zoho' ? 'Making the invoice in Zoho Books…' : 'Writing it to the ticket in Freshdesk…'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {phase === 'freshdesk' ? <Check style={{ width: '1rem', height: '1rem', strokeWidth: 1.5, color: 'var(--color-success)' }} /> : <span style={{ width: '1rem' }} />}
              Invoice in Zoho Books
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}><span style={{ width: '1rem' }} />Note, fields and tag on the ticket</span>
          </div>
        </div>
      </div>
    );
  }

  const blockers = (
    <>
      {!draft.enabled && <Alert tone="warning">Invoicing from Serene is switched off.</Alert>}
      {!draft.key.saved && (
        <Alert tone="warning">
          Save your Freshdesk API key on <Link href="/profile" style={{ textDecoration: 'underline' }}>your profile</Link> first. The ticket will then show the invoice under your own name.
        </Alert>
      )}
      {draft.ticketStatus !== FINANCE_INVOICE_DUE_STATUS && <Alert tone="warning">This ticket is not in Invoice Due. An invoice is made only for a ticket a genie has handed over.</Alert>}
    </>
  );

  if (phase === 'ready') {
    const readable = draft.items.filter((i) => i.amount != null);
    const readTotal = readable.reduce((s, i) => s + (i.amount ?? 0), 0);
    return (
      <div style={SHELL}>
        {header}
        <div style={BODY}>
          {blockers}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Row label="For" value={<span style={{ fontFamily: 'var(--font-sans)' }}>{draft.member?.fullName ?? 'No member linked'}</span>} />
            <Row label="Lines read from the notes" value={draft.items.length} />
            <Row label="Amount read" value={draft.items.length ? formatCurrency(readTotal) : '—'} strong />
          </div>
          {draft.items.length > readable.length && <span style={QUIET}>{draft.items.length - readable.length} line{draft.items.length - readable.length === 1 ? '' : 's'} need an amount typed.</span>}
          <div>
            <Button onClick={() => { setPhase('preview'); setError(null); }} disabled={draft.ticketStatus !== FINANCE_INVOICE_DUE_STATUS} iconLeft={FileText}>
              Generate invoice
            </Button>
          </div>
          <span style={QUIET}>Nothing is written until you confirm the preview.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={SHELL}>
      {header}
      <div style={BODY}>
        {blockers}

        {/* Who and when */}
        {draft.member ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Invoice to</span>
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)' }}>{draft.member.fullName}</span>
            {!draft.member.zohoCustomerId && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>No Zoho customer linked to this member.</span>}
          </div>
        ) : (
          <Field label="Invoice to" htmlFor="invoice-member" hint="This ticket is not linked to a member. Search by name or phone.">
            <Input id="invoice-member" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Member name" autoComplete="off" disabled={loadingMember} />
          </Field>
        )}
        {hits.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {hits.map((h) => (
              <button key={h.id} type="button" className="serene-pressable" onClick={() => pickMember(h)} style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--theme-paper-border)', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)' }}>
                {h.full_name}
                {h.queendom_name && <span style={{ ...QUIET, marginLeft: 'var(--space-2)' }}>{h.queendom_name}</span>}
              </button>
            ))}
          </div>
        )}

        <Field label="Invoice date" htmlFor="invoice-date">
          <DatePicker id="invoice-date" value={parseIsoDate(date)} onChange={(d) => setDate(d ? toIsoDate(d) : '')} maxDate={new Date()} />
        </Field>

        {/* The lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>{ZOHO_REIMBURSEMENT_ITEM_NAME}</span>
            <span style={QUIET}>{lines.length} line{lines.length === 1 ? '' : 's'}</span>
          </div>
          {lines.length === 0 && <span style={QUIET}>No lines yet. Add what the member is billed for.</span>}
          {lines.map((l, i) => (
            <div key={l.key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--neu-tile-bg)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="24.09.2026  Runner-Surat" />
                </div>
                <Button size="xs" variant="ghost" onClick={() => removeLine(l.key)} aria-label={`Remove line ${i + 1}`}><X style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} /></Button>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ width: '9rem' }}>
                  <Input aria-label={`Line ${i + 1} amount in rupees`} inputMode="decimal" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="₹ amount" style={MONEY} />
                </div>
                <span style={{ ...QUIET, minWidth: 0 }}>
                  {[l.vendor, l.mode].filter(Boolean).join(' · ') || 'vendor and mode not in the note'}
                  {l.asWritten && <span style={{ color: 'var(--color-warning-text)' }}> · written as {l.asWritten}</span>}
                </span>
              </div>
            </div>
          ))}
          {lines.length < FINANCE_MAX_ITEMS && (
            <div><Button size="xs" variant="ghost" onClick={addLine} iconLeft={Plus}>Add a line</Button></div>
          )}
        </div>

        {/* The money */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--theme-paper-border)' }}>
          <Row label="Total" value={formatCurrency(total)} strong />
          <Row label="Credit the member holds" value={wallet == null ? 'could not be read' : formatCurrency(wallet)} />
          <Toggle checked={applyCredit} onChange={setApplyCredit} size="sm" label="Apply the member's credit" description="What the credit does not cover stays as balance on the invoice." />
          <Row label="Credit applied" value={formatCurrency(credit)} />
          <Row label="Balance after" value={formatCurrency(balance)} />
        </div>

        {draft.warnings.length > 0 && (
          <Alert tone="info">
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>{draft.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Alert>
        )}

        {draft.sourceNotes.length > 0 && (
          <div>
            <Button size="xs" variant="ghost" onClick={() => setShowNotes((v) => !v)}>{showNotes ? 'Hide' : 'Show'} the note{draft.sourceNotes.length === 1 ? '' : 's'} this was read from</Button>
            <AnimatePresence initial={false}>
              {showNotes && (
                <CollapseReveal key="notes">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingTop: 'var(--space-3)' }}>
                    {draft.sourceNotes.map((n) => (
                      <div key={n.id}>
                        <span style={QUIET}>{formatDate(n.at, 'd MMM yyyy, h:mm a')}</span>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)', lineHeight: 1.6 }}>{n.text}</p>
                      </div>
                    ))}
                  </div>
                </CollapseReveal>
              )}
            </AnimatePresence>
          </div>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => { setPhase('ready'); setError(null); }}>Cancel</Button>
          <Button onClick={() => setConfirming(true)} disabled={!canSend}>Confirm and send</Button>
        </div>
        {draft.key.saved && <span style={{ ...QUIET, textAlign: 'right' }}>The ticket will show this as done by {draft.key.agentName}.</span>}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Make this invoice for ${formatCurrency(total)}?`}
        body={<>This creates the invoice in Zoho Books on <b style={{ fontWeight: 'var(--weight-semibold)' }}>{draft.member?.fullName}</b>{credit > 0 ? <>, applies {formatCurrency(credit)} of their credit</> : null}, and writes it to the Freshdesk ticket. The ticket&apos;s status is not changed.</>}
        confirmLabel="Make the invoice"
        onConfirm={send}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

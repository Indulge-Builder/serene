'use client';

// TicketBriefCard — the typed request, editable in place; the fields follow the category.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { InfoRow } from '@/components/ui/InfoRow';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { updateTicketBriefAction } from '@/lib/actions/tickets';
import { formatDate } from '@/lib/utils/dates';
import { TICKET_BRIEF_FIELDS_BY_CATEGORY, TICKET_BRIEF_FIELD_LABELS, TICKET_CATEGORIES, TICKET_SUB_CATEGORIES, type TicketBriefField } from '@/lib/constants/tickets';
import type { TicketRow } from '@/lib/types/ticket';

const FIELD: React.CSSProperties = { width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', boxSizing: 'border-box' };

function show(f: TicketBriefField, v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if ((f === 'date' || f === 'date_to') && typeof v === 'string' && !Number.isNaN(Date.parse(v))) return formatDate(v, 'd MMM yyyy, h:mm a');
  if (f === 'budget_inr' && typeof v === 'number') return `₹${v.toLocaleString('en-IN')}`;
  return String(v);
}

export function TicketBriefCard({ ticket }: { ticket: TicketRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [sub, setSub] = useState(ticket.sub_category ?? '');
  const [brief, setBrief] = useState<Record<string, string | boolean>>(() => Object.fromEntries(Object.entries(ticket.brief ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v)])));
  const fields = TICKET_BRIEF_FIELDS_BY_CATEGORY[ticket.category];
  const subs = TICKET_SUB_CATEGORIES[ticket.category];

  function save() {
    start(async () => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(brief)) if (v !== '' && v != null) clean[k] = v;
      const r = await updateTicketBriefAction({ ticket_id: ticket.id, title, sub_category: sub || null, brief: clean });
      if (r.error) { toast.danger(r.error); return; }
      setEditing(false); router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={FileText} label="Brief" right={<span style={{ marginLeft: 'auto' }}><Button variant="ghost" size="xs" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Edit'}</Button></span>} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {!editing ? (
          <>
            <InfoRow label="Category" value={`${TICKET_CATEGORIES.labels[ticket.category]}${ticket.sub_category ? ` · ${subs.find((s) => s.id === ticket.sub_category)?.label ?? ticket.sub_category}` : ''}`} />
            {ticket.requested_for && <InfoRow label="Needed by" value={formatDate(ticket.requested_for, 'd MMM yyyy, h:mm a')} />}
            {fields.filter((f) => ticket.brief?.[f] != null && ticket.brief?.[f] !== '').map((f) => <InfoRow key={f} label={TICKET_BRIEF_FIELD_LABELS[f]} value={show(f, ticket.brief[f])} />)}
            {fields.every((f) => ticket.brief?.[f] == null || ticket.brief?.[f] === '') && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-tertiary)' }}>No details yet. Edit to add them.</span>}
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
            <label style={{ gridColumn: '1 / -1' }}><span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Title</span><input style={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            {subs.length > 0 && (
              <label><span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Sub-category</span>
                <select style={FIELD} value={sub} onChange={(e) => setSub(e.target.value)}><option value="">Not set</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              </label>
            )}
            {fields.map((f) => (
              <label key={f} style={f === 'notes' || f === 'delivery_address' ? { gridColumn: '1 / -1' } : undefined}>
                <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>{TICKET_BRIEF_FIELD_LABELS[f]}</span>
                {f === 'early_check_in' ? (
                  <select style={FIELD} value={brief[f] === true ? 'yes' : brief[f] === false ? 'no' : ''} onChange={(e) => setBrief({ ...brief, [f]: e.target.value === 'yes' ? true : e.target.value === 'no' ? false : '' })}><option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option></select>
                ) : (
                  <input style={FIELD} value={typeof brief[f] === 'string' ? (brief[f] as string) : ''} onChange={(e) => setBrief({ ...brief, [f]: e.target.value })} />
                )}
              </label>
            ))}
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}><Button size="sm" onClick={save} loading={pending}>Save</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

// TicketMoneyCard — quote, cost, price and payment status on the ticket (Zoho stays the ledger).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { InfoRow } from '@/components/ui/InfoRow';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { updateTicketMoneyAction } from '@/lib/actions/tickets';
import type { TicketRow } from '@/lib/types/ticket';

const FIELD: React.CSSProperties = { width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', boxSizing: 'border-box' };
const inr = (v: unknown) => (typeof v === 'number' ? `₹${v.toLocaleString('en-IN')}` : '—');

export function TicketMoneyCard({ ticket }: { ticket: TicketRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const m = ticket.money ?? {};
  const [form, setForm] = useState({ quote_inr: m.quote_inr != null ? String(m.quote_inr) : '', cost_inr: m.cost_inr != null ? String(m.cost_inr) : '', price_inr: m.price_inr != null ? String(m.price_inr) : '', payment_status: m.payment_status ?? 'not_started', invoice_no: m.invoice_no ?? '' });
  function save() {
    start(async () => {
      const r = await updateTicketMoneyAction({ ticket_id: ticket.id, quote_inr: form.quote_inr ? Number(form.quote_inr) : null, cost_inr: form.cost_inr ? Number(form.cost_inr) : null, price_inr: form.price_inr ? Number(form.price_inr) : null, payment_status: form.payment_status, invoice_no: form.invoice_no || null });
      if (r.error) { toast.danger(r.error); return; }
      setEditing(false); router.refresh();
    });
  }
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={Landmark} label="Money" right={<span style={{ marginLeft: 'auto' }}><Button variant="ghost" size="xs" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Edit'}</Button></span>} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {!editing ? (
          <>
            <InfoRow label="Quote" value={inr(m.quote_inr)} /><InfoRow label="Cost" value={inr(m.cost_inr)} /><InfoRow label="Price to client" value={inr(m.price_inr)} />
            <InfoRow label="Payment" value={(m.payment_status ?? 'not started').replace(/_/g, ' ')} />{m.invoice_no && <InfoRow label="Invoice" value={m.invoice_no} />}
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
            <label><span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Quote (INR)</span><input style={FIELD} inputMode="numeric" value={form.quote_inr} onChange={(e) => setForm({ ...form, quote_inr: e.target.value })} /></label>
            <label><span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Cost (INR)</span><input style={FIELD} inputMode="numeric" value={form.cost_inr} onChange={(e) => setForm({ ...form, cost_inr: e.target.value })} /></label>
            <label><span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Price (INR)</span><input style={FIELD} inputMode="numeric" value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: e.target.value })} /></label>
            <label><span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Payment</span><select style={FIELD} value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value as typeof form.payment_status })}><option value="not_started">Not started</option><option value="requested">Requested</option><option value="paid">Paid</option><option value="waived">Waived</option></select></label>
            <label><span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Invoice no</span><input style={FIELD} value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} /></label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}><Button size="sm" onClick={save} loading={pending}>Save</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}

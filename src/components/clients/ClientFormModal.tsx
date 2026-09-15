'use client';

// ClientFormModal — THE New client / Edit client form (decided 2026-09-15: a manual form
// like the rest of Serene; the won-deal hook comes later). One component, two modes: with
// no `client` it creates; with one it updates the membership fields and the four links.
// Email and city are facts on create (the core seeds them); on edit they live on the card.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { createClientAction, updateClientAction } from '@/lib/actions/clients';
import { CLIENT_TIERS, CLIENT_STATUSES } from '@/lib/constants/client-facets';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import type { ClientRow, QueendomSummary } from '@/lib/types/client';

const FIELD: React.CSSProperties = {
  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)',
  background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', boxSizing: 'border-box',
};
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="label-micro" style={{ display: 'block', color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-2)' }}>
      {children}{required && <span style={{ color: 'var(--color-danger-text)' }}> *</span>}
    </span>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  queendoms: QueendomSummary[];
  /** The caller's own queendom (a Sia member); admin/founder pass null and pick. */
  defaultQueendomId: string | null;
  canPickQueendom: boolean;
  client?: ClientRow;
};

export function ClientFormModal({ open, onClose, queendoms, defaultQueendomId, canPickQueendom, client }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: client?.full_name ?? '',
    primary_phone: client?.primary_phone ?? '',
    queendom_id: client?.queendom_id ?? defaultQueendomId ?? '',
    tier: client?.tier ?? '',
    membership_status: client?.membership_status ?? 'Active',
    membership_start: client?.membership_start ?? '',
    membership_end: client?.membership_end ?? '',
    membership_amount_inr: client?.membership_amount_inr != null ? String(client.membership_amount_inr) : '',
    email: '',
    city: '',
    freshdesk_contact_id: client?.freshdesk_contact_id ?? '',
    zoho_customer_id: client?.zoho_customer_id ?? '',
    app_member_id: client?.app_member_id ?? '',
    wa_invite_link: client?.wa_invite_link ?? '',
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit() {
    setError(null);
    start(async () => {
      const base = {
        full_name: form.full_name,
        primary_phone: form.primary_phone || null,
        queendom_id: form.queendom_id || null,
        tier: form.tier || null,
        membership_status: form.membership_status || null,
        membership_start: form.membership_start || null,
        membership_end: form.membership_end || null,
        membership_amount_inr: form.membership_amount_inr ? Number(form.membership_amount_inr) : null,
      };
      const res = client
        ? await updateClientAction({
            ...base, client_id: client.id,
            freshdesk_contact_id: form.freshdesk_contact_id || null, zoho_customer_id: form.zoho_customer_id || null,
            app_member_id: form.app_member_id || null, wa_invite_link: form.wa_invite_link || null,
          })
        : await createClientAction({ ...base, email: form.email || null, city: form.city || null });
      if (res.error || !res.data) { setError(res.error ?? 'Could not save.'); return; }
      toast.success(client ? 'Client saved.' : `${res.data.full_name} added.`);
      onClose();
      if (client) router.refresh();
      else router.push(`${CLIENTS_PATH}/${res.data.id}`);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? 'Edit client' : 'New client'}
      description={client ? 'Membership and the links to the other systems.' : 'A membership. A couple is one client with two names; add the second person on the card.'}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending} loadingLabel="Saving…" disabled={!form.full_name.trim()}>{client ? 'Save' : 'Add client'}</Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <label><Label required>Name</Label><input style={FIELD} value={form.full_name} onChange={set('full_name')} placeholder="Rahul & Naina Verma" autoFocus /></label>
        <label><Label>WhatsApp number</Label><input style={FIELD} value={form.primary_phone} onChange={set('primary_phone')} placeholder="+91 98200 12345" /></label>
        {canPickQueendom && (
          <label><Label>Queendom</Label>
            <select style={FIELD} value={form.queendom_id} onChange={set('queendom_id')}>
              <option value="">Not assigned</option>
              {queendoms.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </label>
        )}
        <label><Label>Tier</Label>
          <select style={FIELD} value={form.tier} onChange={set('tier')}>
            <option value="">Not set</option>
            {CLIENT_TIERS.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label><Label>Status</Label>
          <select style={FIELD} value={form.membership_status} onChange={set('membership_status')}>
            {CLIENT_STATUSES.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label><Label>Membership start</Label><input style={FIELD} type="date" value={form.membership_start} onChange={set('membership_start')} /></label>
        <label><Label>Membership end</Label><input style={FIELD} type="date" value={form.membership_end} onChange={set('membership_end')} /></label>
        <label><Label>Amount (INR)</Label><input style={FIELD} inputMode="numeric" value={form.membership_amount_inr} onChange={set('membership_amount_inr')} placeholder="400000" /></label>
        {!client && (
          <>
            <label><Label>Email</Label><input style={FIELD} value={form.email} onChange={set('email')} placeholder="name@example.com" /></label>
            <label><Label>City</Label><input style={FIELD} value={form.city} onChange={set('city')} placeholder="Mumbai" /></label>
          </>
        )}
        {client && (
          <>
            <label><Label>Freshdesk contact id</Label><input style={FIELD} value={form.freshdesk_contact_id} onChange={set('freshdesk_contact_id')} placeholder="1070069107589" /></label>
            <label><Label>Zoho customer id</Label><input style={FIELD} value={form.zoho_customer_id} onChange={set('zoho_customer_id')} placeholder="1204503000022882881" /></label>
            <label><Label>App member id</Label><input style={FIELD} value={form.app_member_id} onChange={set('app_member_id')} placeholder="6aa3ec9377003e5eb5944e79" /></label>
            <label style={{ gridColumn: '1 / -1' }}><Label>WhatsApp invite link</Label><input style={FIELD} value={form.wa_invite_link} onChange={set('wa_invite_link')} placeholder="https://chat.whatsapp.com/…" /></label>
          </>
        )}
      </div>
      {error && <p style={{ margin: 'var(--space-4) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-danger-text)' }}>{error}</p>}
    </Modal>
  );
}

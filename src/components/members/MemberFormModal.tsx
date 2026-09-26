'use client';

// MemberFormModal — THE New member / Edit member form (decided 2026-09-15: a manual form
// like the rest of Serene; the won-deal hook comes later). One component, two modes: with
// no `member` it creates; with one it updates the membership fields and the four links.
// Email and city are facts on create (the core seeds them); on edit they live on the card.

import { FormSelect } from '@/components/ui/FormSelect';
import { Input } from '@/components/ui/Field';
import { DatePicker } from '@/components/ui/DatePicker';
import { parseIsoDate, toIsoDate } from '@/lib/utils/dates';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MQ, useMediaQuery } from '@/hooks/useMediaQuery';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { createMemberAction, updateMemberAction } from '@/lib/actions/members';
import { CLIENT_TIERS, CLIENT_STATUSES } from '@/lib/constants/member-facets';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import type { MemberRow, QueendomSummary } from '@/lib/types/member';


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
  /** False for a viewer the finance gate refuses (the Joker head): no Amount field, and the
   *  amount is left out of the save so an edit never blanks it. */
  canSeeMoney?: boolean;
  member?: MemberRow;
};

export function MemberFormModal({ open, onClose, queendoms, defaultQueendomId, canPickQueendom, canSeeMoney = true, member }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // No autofocus on a phone: the keyboard would cover the opening sheet.
  const touch = useMediaQuery(MQ.touch);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: member?.full_name ?? '',
    primary_phone: member?.primary_phone ?? '',
    queendom_id: member?.queendom_id ?? defaultQueendomId ?? '',
    tier: member?.tier ?? '',
    membership_status: member?.membership_status ?? 'Active',
    membership_start: member?.membership_start ?? '',
    membership_end: member?.membership_end ?? '',
    membership_amount_inr: member?.membership_amount_inr != null ? String(member.membership_amount_inr) : '',
    email: '',
    city: '',
    freshdesk_contact_id: member?.freshdesk_contact_id ?? '',
    zoho_customer_id: member?.zoho_customer_id ?? '',
    app_member_id: member?.app_member_id ?? '',
    wa_invite_link: member?.wa_invite_link ?? '',
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
        ...(canSeeMoney ? { membership_amount_inr: form.membership_amount_inr ? Number(form.membership_amount_inr) : null } : {}),
      };
      const res = member
        ? await updateMemberAction({
            ...base, member_id: member.id,
            freshdesk_contact_id: form.freshdesk_contact_id || null, zoho_customer_id: form.zoho_customer_id || null,
            app_member_id: form.app_member_id || null, wa_invite_link: form.wa_invite_link || null,
          })
        : await createMemberAction({ ...base, email: form.email || null, city: form.city || null });
      if (res.error || !res.data) { setError(res.error ?? 'Could not save.'); return; }
      toast.success(member ? 'Member saved.' : `${res.data.full_name} added.`);
      onClose();
      if (member) router.refresh();
      else router.push(`${CLIENTS_PATH}/${res.data.id}`);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? 'Edit member' : 'New member'}
      description={member ? 'Membership and the links to the other systems.' : 'A membership. A couple is one member with two names; add the second person on the card.'}
      size="lg"
      error={error ? <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-danger-text)' }}>{error}</p> : undefined}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending} loadingLabel="Saving…" disabled={!form.full_name.trim()}>{member ? 'Save' : 'Add member'}</Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <label><Label required>Name</Label><Input style={{ width: '100%' }} value={form.full_name} onChange={set('full_name')} placeholder="Rahul & Naina Verma" autoFocus={!touch} /></label>
        <label><Label>WhatsApp number</Label><Input type="tel" inputMode="tel" style={{ width: '100%' }} value={form.primary_phone} onChange={set('primary_phone')} placeholder="+91 98200 12345" /></label>
        {canPickQueendom && (
          <label><Label>Queendom</Label>
            <FormSelect style={{ width: '100%' }} value={form.queendom_id} onValueChange={nextValue => setForm(f => ({ ...f, ['queendom_id']: nextValue }))}>
              <option value="">Not assigned</option>
              {queendoms.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </FormSelect>
          </label>
        )}
        <label><Label>Tier</Label>
          <FormSelect style={{ width: '100%' }} value={form.tier} onValueChange={nextValue => setForm(f => ({ ...f, ['tier']: nextValue }))}>
            <option value="">Not set</option>
            {CLIENT_TIERS.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </FormSelect>
        </label>
        <label><Label>Status</Label>
          <FormSelect style={{ width: '100%' }} value={form.membership_status} onValueChange={nextValue => setForm(f => ({ ...f, ['membership_status']: nextValue }))}>
            {CLIENT_STATUSES.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </FormSelect>
        </label>
        <label><Label>Membership start</Label><DatePicker style={{ width: '100%' }} placeholder="Pick a date" value={parseIsoDate(form.membership_start)} onChange={(d) => setForm((f) => ({ ...f, membership_start: toIsoDate(d) }))} /></label>
        <label><Label>Membership end</Label><DatePicker style={{ width: '100%' }} placeholder="Pick a date" value={parseIsoDate(form.membership_end)} onChange={(d) => setForm((f) => ({ ...f, membership_end: toIsoDate(d) }))} /></label>
        {canSeeMoney && <label><Label>Amount (INR)</Label><Input style={{ width: '100%' }} inputMode="numeric" value={form.membership_amount_inr} onChange={set('membership_amount_inr')} placeholder="400000" /></label>}
        {!member && (
          <>
            <label><Label>Email</Label><Input type="email" inputMode="email" style={{ width: '100%' }} value={form.email} onChange={set('email')} placeholder="name@example.com" /></label>
            <label><Label>City</Label><Input style={{ width: '100%' }} value={form.city} onChange={set('city')} placeholder="Mumbai" /></label>
          </>
        )}
        {member && (
          <>
            <label><Label>Freshdesk contact id</Label><Input style={{ width: '100%' }} value={form.freshdesk_contact_id} onChange={set('freshdesk_contact_id')} placeholder="1070069107589" /></label>
            <label><Label>Zoho customer id</Label><Input style={{ width: '100%' }} value={form.zoho_customer_id} onChange={set('zoho_customer_id')} placeholder="1204503000022882881" /></label>
            <label><Label>App member id</Label><Input style={{ width: '100%' }} value={form.app_member_id} onChange={set('app_member_id')} placeholder="6aa3ec9377003e5eb5944e79" /></label>
            <label style={{ gridColumn: '1 / -1' }}><Label>WhatsApp invite link</Label><Input style={{ width: '100%' }} value={form.wa_invite_link} onChange={set('wa_invite_link')} placeholder="https://chat.whatsapp.com/…" /></label>
          </>
        )}
      </div>
    </Modal>
  );
}

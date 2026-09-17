'use client';

// MemberPeopleCard — the humans under a membership (a couple is one member with two names;
// children, parents, the driver, the house manager). Add and remove inline.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UsersRound, X } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { addMemberPersonAction, deleteMemberPersonAction } from '@/lib/actions/members';
import type { MemberPersonRow } from '@/lib/types/member';

const RELATIONS = ['primary', 'spouse', 'partner', 'child', 'parent', 'sibling', 'staff', 'other'] as const;

export function MemberPeopleCard({ clientId, people }: { clientId: string; people: MemberPersonRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', relation: 'spouse' as (typeof RELATIONS)[number], phone: '', note: '' });

  function submit() {
    start(async () => {
      const res = await addMemberPersonAction({ member_id: clientId, name: form.name, relation: form.relation, phone_e164: form.phone || null, note: form.note || null, can_request: true });
      if (res.error) { toast.danger(res.error); return; }
      setAdding(false); setForm({ name: '', relation: 'spouse', phone: '', note: '' }); router.refresh();
    });
  }
  function remove(id: string) {
    start(async () => {
      const res = await deleteMemberPersonAction({ member_id: clientId, person_id: id });
      if (res.error) { toast.danger(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={UsersRound} label="People" right={<span style={{ marginLeft: 'auto' }}><Button variant="ghost" size="xs" onClick={() => setAdding((v) => !v)}>Add</Button></span>} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {people.length === 0 && !adding && <EmptyState variant="inline" title="Only the member so far." description="Add the spouse, the children, the driver: who is around them and who may ask." />}
        {people.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
            <span style={{ fontWeight: 'var(--weight-medium)' }}>{p.name}</span>
            <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)' }}>{p.relation}{p.phone_e164 ? ` · ${p.phone_e164}` : ''}{p.note ? ` · ${p.note}` : ''}</span>
            <button type="button" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`} disabled={pending} style={{ marginLeft: 'auto', background: 'none', border: 0, cursor: 'pointer', color: 'var(--theme-text-tertiary)', display: 'inline-flex' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
        ))}
        {adding && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--theme-paper-border)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input className="serene-input neu-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" style={{ flex: '1 1 160px' }} autoFocus />
              <select className="serene-input neu-input" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value as (typeof RELATIONS)[number] })} style={{ width: 120 }}>
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input className="serene-input neu-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" style={{ flex: '1 1 140px' }} />
              <input className="serene-input neu-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="note (age, role)" style={{ flex: '2 1 160px' }} maxLength={300} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="xs" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="xs" onClick={submit} loading={pending} disabled={!form.name.trim()}>Add</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

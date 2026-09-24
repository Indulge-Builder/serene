'use client';

// MemberVaultCard — the member's cards and identity documents (migration 0236). The list shows
// only the label, the kind, the last four digits and an expiry; a secret is shown after the
// person says why, for VAULT_REVEAL_SECONDS, and that reveal is on record. Adding encrypts in
// the app before anything is stored. Removing is admin and founder, behind a ConfirmDialog.

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Copy } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { addMemberVaultItemAction, deleteMemberVaultItemAction, revealMemberVaultItemAction } from '@/lib/actions/members';
import { MEMBER_VAULT_KINDS, VAULT_REVEAL_SECONDS } from '@/lib/constants/member-facets';
import type { MemberVaultItem, MemberVaultKind } from '@/lib/types/member';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };
const FIELD: React.CSSProperties = { width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', boxSizing: 'border-box' };

function Row({ item, memberId, canDelete }: { item: MemberVaultItem; memberId: string; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<'reveal' | 'delete' | null>(null);
  const [reason, setReason] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (secret === null) return;
    setLeft(VAULT_REVEAL_SECONDS);
    const t = setInterval(() => setLeft((n) => { if (n <= 1) { clearInterval(t); setSecret(null); return 0; } return n - 1; }), 1000);
    return () => clearInterval(t);
  }, [secret]);

  const reveal = () => start(async () => {
    const res = await revealMemberVaultItemAction({ member_id: memberId, item_id: item.id, reason });
    if (res.error || !res.data) { toast.danger(res.error ?? 'Could not open that.'); return; }
    setSecret(res.data.secret); setAsking(null); setReason('');
  });
  const remove = () => start(async () => {
    const res = await deleteMemberVaultItemAction({ member_id: memberId, item_id: item.id, reason });
    if (res.error) { toast.danger(res.error); return; }
    toast.success('Removed. The removal is on record.'); setAsking(null); router.refresh();
  });

  const meta = [MEMBER_VAULT_KINDS.labels[item.kind], item.hint ? `ending ${item.hint}` : null, item.expires_on ? `expires ${item.expires_on.slice(0, 7)}` : null, item.source === 'freshdesk_note' ? 'from Freshdesk' : null].filter(Boolean).join(' · ');

  return (
    <li style={{ listStyle: 'none', padding: 'var(--space-3) 0', borderTop: '1px solid var(--theme-paper-border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>{item.label}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{meta}</span>
        </div>
        {secret === null && !asking && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => setAsking('reveal')}>Open</Button>
            {canDelete && <Button size="xs" variant="ghost" disabled={pending} onClick={() => setAsking('delete')}>Remove</Button>}
          </div>
        )}
      </div>
      {asking === 'reveal' && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input style={FIELD} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you need it? (kept on record)" maxLength={300} autoFocus />
          <Button size="xs" loading={pending} disabled={reason.trim().length < 3} onClick={reveal}>Open</Button>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => { setAsking(null); setReason(''); }}>Cancel</Button>
        </div>
      )}
      {secret !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--neu-radius-tile, var(--radius-md))', background: 'var(--theme-paper-subtle)' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)' }}>{secret}</pre>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Button size="xs" variant="ghost" onClick={() => { void navigator.clipboard.writeText(secret).then(() => toast.success('Copied.')); }}><Copy style={{ width: 14, height: 14 }} /> Copy</Button>
            <Button size="xs" variant="ghost" onClick={() => setSecret(null)}>Hide</Button>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>hides in {left}s</span>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={asking === 'delete'}
        title={`Remove ${item.label}?`}
        body={<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}><span>The details are deleted from Serene for good. That this was removed, by whom and why, stays on record.</span><input style={FIELD} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (required, kept on record)" maxLength={300} /></div>}
        confirmLabel="Remove"
        danger
        pending={pending}
        onConfirm={() => { if (reason.trim().length >= 3) remove(); else toast.warning('Say why first.'); }}
        onCancel={() => { setAsking(null); setReason(''); }}
      />
    </li>
  );
}

export function MemberVaultCard({ memberId, items, canDelete }: { memberId: string; items: MemberVaultItem[]; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: 'card' as MemberVaultKind, label: '', secret: '', expires: '' });
  const [error, setError] = useState<string | null>(null);

  const save = () => start(async () => {
    setError(null);
    const res = await addMemberVaultItemAction({ member_id: memberId, kind: form.kind, label: form.label, secret: form.secret, expires: form.expires || null });
    if (res.error) { setError(res.error); return; } // the form keeps what was typed
    toast.success('Stored, encrypted.'); setAdding(false); setForm({ kind: 'card', label: '', secret: '', expires: '' }); router.refresh();
  });

  return (
    <div style={SHELL}>
      <CardHeader icon={KeyRound} label="Cards & documents" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{items.length}</span>} />
      <div style={BODY}>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Encrypted. Every open is on record with your name and reason. Never shown to Elaya.</p>
        {items.length === 0
          ? <EmptyState variant="inline" title="Nothing on file." />
          : <ul style={{ margin: 0, padding: 0 }}>{items.map((it) => <Row key={it.id} item={it} memberId={memberId} canDelete={canDelete} />)}</ul>}
        {adding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <select style={{ ...FIELD, width: 'auto' }} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as MemberVaultKind })}>
                {MEMBER_VAULT_KINDS.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <input style={FIELD} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label, e.g. HDFC Visa (never the number)" maxLength={120} />
            </div>
            <textarea style={{ ...FIELD, resize: 'vertical', fontFamily: 'var(--font-mono)' }} rows={3} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="The details, as you would write them on a note. Encrypted before saving." maxLength={4000} />
            {form.kind === 'card' && <input style={{ ...FIELD, width: 'auto' }} type="month" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} aria-label="Expiry month" />}
            {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>{error}</span>}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button size="xs" loading={pending} disabled={form.label.trim().length < 2 || form.secret.trim().length < 2} onClick={save}>Store</Button>
              <Button size="xs" variant="ghost" disabled={pending} onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : <div><Button size="xs" variant="ghost" onClick={() => setAdding(true)}>Add a card or document</Button></div>}
      </div>
    </div>
  );
}

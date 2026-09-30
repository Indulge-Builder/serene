'use client';

// FreshdeskKeyCard — a finance person's own Freshdesk API key, on /profile (0250).
// Freshdesk records every change under the agent whose key made it, so the invoice note and the
// fields Serene fills show under the person's own name only when the write carries THEIR key.
// The key is checked with Freshdesk, stored encrypted, and never shown again: this card only
// ever knows who Freshdesk says the key is and its last four characters.

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/lib/toast';
import { removeFreshdeskKeyAction, saveFreshdeskKeyAction } from '@/lib/actions/finance';
import { formatDate } from '@/lib/utils/dates';
import type { FreshdeskKeyStatus } from '@/lib/types/finance';

export function FreshdeskKeyCard({ initial }: { initial: FreshdeskKeyStatus }) {
  const [status, setStatus] = useState(initial);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setError(null);
    const r = await saveFreshdeskKeyAction({ apiKey: key });
    if (r.error || !r.data) { setError(r.error ?? 'The key could not be saved.'); return; }
    setStatus(r.data);
    setKey('');
    toast.success(`Saved. Freshdesk knows this key as ${r.data.agentName}.`);
  });

  const remove = () => start(async () => {
    const r = await removeFreshdeskKeyAction();
    setRemoving(false);
    if (r.error || !r.data) { toast.danger(r.error ?? 'The key could not be removed.'); return; }
    setStatus(r.data);
    toast.success('Removed.');
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {status.saved ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Badge tone="success" size="xs">Saved</Badge>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>{status.agentName}</span>
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
              Key ending <span style={{ fontFamily: 'var(--font-mono)' }}>{status.lastFour}</span>
              {status.verifiedAt ? `, checked ${formatDate(status.verifiedAt, 'd MMM yyyy')}` : ''}
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(true)} disabled={pending}>Remove</Button>
        </div>
      ) : (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)', lineHeight: 1.6 }}>
          In Freshdesk, open your profile picture, then Profile settings, then View API key. Paste it here once.
        </span>
      )}
      <Field label={status.saved ? 'Replace the key' : 'Your Freshdesk API key'} htmlFor="freshdesk-key" error={error ?? undefined} hint="Stored encrypted. It is never shown again, here or anywhere.">
        <Input id="freshdesk-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="Paste the key" />
      </Field>
      <div><Button size="sm" onClick={save} disabled={key.length < 12} loading={pending} loadingLabel="Checking with Freshdesk…">Save key</Button></div>
      <ConfirmDialog
        open={removing}
        title="Remove your Freshdesk key?"
        body="You will not be able to make an invoice from Serene until you save a key again."
        confirmLabel="Remove"
        danger
        pending={pending}
        onConfirm={remove}
        onCancel={() => setRemoving(false)}
      />
    </div>
  );
}

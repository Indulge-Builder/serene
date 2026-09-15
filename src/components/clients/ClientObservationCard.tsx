'use client';

// ClientObservationCard — THE one box for what the team knows about a client. A person
// writes an observation in free form; the backend fixes the spelling, files the facts into
// the twin's drawers (Essentials / Preferences) and keeps the sentence as a note. After
// saving, the card shows what was understood for a moment so a wrong reading is caught.
// Past observations (the notes) list beneath, newest first. The draft is never cleared on
// error. Dictation composes the shared DictationButton.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Sparkles } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DictationButton } from '@/components/ui/DictationButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { addClientObservationAction } from '@/lib/actions/clients';
import { formatDate } from '@/lib/utils/dates';
import { CLIENT_FACETS, FACT_KEY_LABELS, type ClientFacet } from '@/lib/constants/client-facets';
import type { ClientFactView, ClientObservationResult } from '@/lib/types/client';

function keyLabel(facet: string, key: string): string {
  return FACT_KEY_LABELS[`${facet}.${key}`] ?? (key ? key.replace(/_/g, ' ') : CLIENT_FACETS.labels[facet as ClientFacet] ?? facet);
}

export function ClientObservationCard({ clientId, notes }: { clientId: string; notes: ClientFactView[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ClientObservationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    const text = draft.trim();
    if (text.length < 3 || pending) return;
    setError(null);
    start(async () => {
      const res = await addClientObservationAction({ client_id: clientId, text });
      if (res.error || !res.data) { setError(res.error ?? 'Could not save that.'); return; }
      setDraft('');
      setLast(res.data);
      if (!res.data.read) toast.warning('Saved as a note. The profile could not be updated this time.');
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={Eye} label="Observation" right={notes.length > 0 ? <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{notes.length}</span> : undefined} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <textarea
          className="serene-input neu-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }}
          placeholder="Write your observation on the client in free form. Example: he likes smart bands, uses a Whoop, his wife Priya is vegetarian."
          rows={3}
          maxLength={2000}
          style={{ width: '100%', resize: 'vertical', minHeight: 84, fontSize: 'var(--text-sm)', lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
            <DictationButton variant="inline" what="an observation" onTranscript={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} onError={(m) => toast.danger(m)} onBusyChange={setBusy} />
            <span>Spelling is fixed and the profile is updated for you. ⌘↵ to save.</span>
          </span>
          <Button size="sm" onClick={submit} loading={pending} loadingLabel="Filing…" disabled={draft.trim().length < 3 || busy}>Save</Button>
        </div>
        {error && <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>{error}</p>}

        {last && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--theme-paper-subtle)', border: '1px solid var(--theme-paper-border)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
              <Sparkles style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
              {last.facts.length === 0
                ? (last.read ? 'Saved as a note. Nothing new for the profile in it.' : 'Saved as a note.')
                : `Understood and filed${last.corrected ? ' (spelling fixed)' : ''}:`}
            </span>
            {last.facts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {last.facts.map((f) => (
                  <span key={f.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', background: 'var(--theme-accent-surface)', color: 'var(--neu-accent-deep)' }}>
                    <span style={{ opacity: 0.7 }}>{keyLabel(f.facet, f.key)}</span>
                    <span>{f.polarity === 'dislikes' ? 'avoids ' : f.polarity === 'likes' ? 'likes ' : ''}{f.value}</span>
                  </span>
                ))}
              </div>
            )}
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>Wrong? Use "correct" on the card it landed in.</span>
          </div>
        )}

        {notes.length === 0 ? (
          <EmptyState variant="inline" title="Nothing observed yet." />
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', borderTop: '1px solid var(--theme-paper-border)', paddingTop: 'var(--space-4)' }}>
            {notes.slice(0, 20).map((n) => (
              <li key={n.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <Avatar name={n.created_by_name ?? 'Team'} size="xs" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.value}</p>
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>{n.created_by_name ?? 'Team'} · {formatDate(n.observed_at, 'd MMM yyyy, h:mm a')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

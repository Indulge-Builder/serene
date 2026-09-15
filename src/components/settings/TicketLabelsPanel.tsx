'use client';

// TicketLabelsPanel — the status names the team sees (the state machine itself never
// changes; a rename is cosmetic and applies everywhere the status is shown) and the tag
// vocabulary the ticket page offers. Saves on Save; nothing is cleared on error.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { updateTicketSettingsAction } from '@/lib/actions/ticket-settings';
import { TICKET_STATUSES, TICKET_TAG_RE, type TicketStatus } from '@/lib/constants/tickets';

const INPUT: React.CSSProperties = { padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', width: '100%' };

export function TicketLabelsPanel({ statusOverrides, tags: initialTags }: { statusOverrides: Record<string, string>; tags: string[] }) {
  const router = useRouter();
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(TICKET_STATUSES.values.map((s) => [s, statusOverrides[s] ?? ''])));
  const [tags, setTags] = useState(initialTags);
  const [draft, setDraft] = useState('');
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const r = await updateTicketSettingsAction({ status_labels: labels as Record<TicketStatus, string>, tags });
      if (r.error) { toast.danger(r.error); return; }
      toast.success('Saved.');
      router.refresh();
    });
  }
  function addTag() {
    const t = draft.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t) return;
    if (!TICKET_TAG_RE.test(t)) { toast.warning('A tag is letters, digits and dashes, up to 30 characters.'); return; }
    setDraft('');
    if (!tags.includes(t)) setTags([...tags, t]);
  }

  return (
    <SectionCard title="Names and tags" description="Rename a status for the team (the flow underneath stays the same). The tag list is what the ticket page offers." headerRight={<Button size="sm" onClick={save} loading={pending}>Save</Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-6)' }}>
        <div>
          <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-3)' }}>Status names</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {TICKET_STATUSES.values.map((s) => (
              <label key={s} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--theme-text-secondary)' }}>{TICKET_STATUSES.labels[s]}</span>
                <input style={INPUT} value={labels[s] ?? ''} onChange={(e) => setLabels({ ...labels, [s]: e.target.value })} placeholder={TICKET_STATUSES.labels[s]} maxLength={30} />
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-3)' }}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            {tags.map((t) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', padding: '3px var(--space-3)', borderRadius: 'var(--radius-full)', background: 'var(--theme-accent-surface)', color: 'var(--neu-accent-deep)' }}>
                {t}
                <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', display: 'inline-flex' }}><X style={{ width: 10, height: 10 }} /></button>
              </span>
            ))}
            {tags.length === 0 && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>No tags yet.</span>}
          </div>
          <input style={INPUT} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add a tag and press Enter" maxLength={30} />
        </div>
      </div>
    </SectionCard>
  );
}

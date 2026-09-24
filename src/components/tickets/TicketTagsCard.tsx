'use client';

// TicketTagsCard — the ticket's tags: the vocabulary from settings as toggles, plus a free
// one (letters, digits, dashes). Saves on every change; reverts with a toast on error.

import { SelectionButton } from '@/components/ui/SelectionButton';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tag } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { toast } from '@/lib/toast';
import { updateTicketTagsAction } from '@/lib/actions/tickets';
import { TICKET_TAG_MAX, TICKET_TAG_RE } from '@/lib/constants/tickets';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };

export function TicketTagsCard({ ticketId, tags: initial, vocabulary }: { ticketId: string; tags: string[]; vocabulary: string[] }) {
  const router = useRouter();
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState('');
  const [pending, start] = useTransition();
  const all = [...new Set([...vocabulary, ...tags])];

  function save(next: string[]) {
    const prev = tags;
    setTags(next);
    start(async () => {
      const r = await updateTicketTagsAction({ ticket_id: ticketId, tags: next });
      if (r.error) { setTags(prev); toast.danger(r.error); return; }
      router.refresh();
    });
  }
  function toggle(t: string) { save(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]); }
  function addDraft() {
    const t = draft.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t) return;
    if (!TICKET_TAG_RE.test(t)) { toast.warning('A tag is letters, digits and dashes.'); return; }
    if (tags.length >= TICKET_TAG_MAX) { toast.warning(`Up to ${TICKET_TAG_MAX} tags.`); return; }
    setDraft('');
    if (!tags.includes(t)) save([...tags, t]);
  }

  return (
    <div style={SHELL}>
      <CardHeader icon={Tag} label="Tags" right={tags.length ? <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{tags.length}</span> : undefined} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {all.map((t) => {
            const on = tags.includes(t);
            return (
              <SelectionButton
                appearance="choice"
                selected={on}
                aria-pressed={on}
                key={t}
                type="button"
                onClick={() => toggle(t)}
                disabled={pending}
                className="serene-pressable"
                style={{
                        fontSize: 'var(--text-xs)',
                        padding: '3px var(--space-3)',
                    }}
              >
                {t}
              </SelectionButton>
            );
          })}
          {all.length === 0 && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>No tags yet.</span>}
        </div>
        <input className="serene-input neu-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} placeholder="Add a tag and press Enter" maxLength={30} style={{ fontSize: 'var(--text-xs)' }} />
      </div>
    </div>
  );
}

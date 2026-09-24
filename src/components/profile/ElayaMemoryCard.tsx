'use client';
// ElayaMemoryCard — "What Elaya has learned about you" (migration 0237): the living memory of one
// person, one entry per line with its kind, remove on each, and a box to add one by hand. Mounted on
// /profile for the owner and on /admin/users/[id] for an admin. Display + form state only (A-06):
// every write goes through actions/elaya-memory.ts; the list is the RSC's seed, refreshed after a write.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { addMemoryEntryAction, retireMemoryEntryAction } from '@/lib/actions/elaya-memory';
import { ELAYA_MEMORY_KIND_LABELS, ELAYA_MEMORY_KIND_OPTIONS, ELAYA_MEMORY_STATEMENT_MAX, type ElayaMemoryKind } from '@/lib/constants/elaya-memory';
import type { ElayaMemoryRow } from '@/lib/services/elaya-memory-service';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)',
  background: 'var(--theme-paper)', color: 'var(--theme-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
};

export function ElayaMemoryCard({ entries, userId, own }: { entries: ElayaMemoryRow[]; userId: string; own: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(entries);
  const [kind, setKind] = useState<ElayaMemoryKind>('rule');
  const [statement, setStatement] = useState('');
  const [pending, start] = useTransition();

  function add() {
    const text = statement.trim();
    if (text.length < 3) { toast.danger('Say it in a few words at least.'); return; }
    start(async () => {
      const r = await addMemoryEntryAction({ user_id: own ? undefined : userId, kind, statement: text });
      if (r.error || !r.data) { toast.danger(r.error ?? 'Could not save.'); return; }
      setRows([r.data, ...rows]);
      setStatement('');
      toast.success(own ? 'Elaya will keep that in mind from your next message.' : 'Saved. Elaya reads it on their next message.');
      router.refresh();
    });
  }
  function remove(row: ElayaMemoryRow) {
    const before = rows;
    setRows(rows.filter((r) => r.id !== row.id));
    start(async () => {
      const r = await retireMemoryEntryAction({ id: row.id });
      if (r.error) { setRows(before); toast.danger(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {rows.length === 0 ? (
        <EmptyState variant="inline" size="sm" title={own ? 'Nothing yet. Tell Elaya how you want things, in the chat or below.' : 'Nothing learned yet.'} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--theme-paper-border)' }}>
              <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)', minWidth: 76, paddingTop: 3 }}>{ELAYA_MEMORY_KIND_LABELS[r.kind]}</span>
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)' }}>{r.statement}</span>
              <Button variant="ghost-danger" size="xs" iconOnly type="button" aria-label="Remove memory" onClick={() => remove(r)} disabled={pending}>
                <X className="w-4 h-4" strokeWidth={1.5} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as ElayaMemoryKind)} style={{ ...INPUT, width: 'auto' }}>
          {ELAYA_MEMORY_KIND_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <input
          style={{ ...INPUT, flex: 1, minWidth: 200 }}
          value={statement}
          maxLength={ELAYA_MEMORY_STATEMENT_MAX}
          onChange={(e) => setStatement(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={own ? 'e.g. Number first, then the why. Never a long message.' : 'e.g. Wants the queendom view first.'}
        />
        <Button size="xs" variant="secondary" iconLeft={Plus} onClick={add} disabled={pending}>Add</Button>
      </div>
    </div>
  );
}

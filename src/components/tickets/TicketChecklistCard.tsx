'use client';

// TicketChecklistCard — the per-category checklist (Freshdesk's internal task list, done properly).
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { toast } from '@/lib/toast';
import { tickChecklistAction } from '@/lib/actions/tickets';
import type { TicketRow } from '@/lib/types/ticket';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckTile } from '@/components/ui/CheckTile';

export function TicketChecklistCard({ ticket }: { ticket: TicketRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const list = ticket.checklist ?? [];
  const done = list.filter((i) => i.done_at).length;
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={ListChecks} label="Checklist" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{done} of {list.length}</span>} />
      <ul style={{ margin: 0, padding: 'var(--space-3) var(--space-6) var(--space-4)', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {list.map((item, i) => (
          <li key={i}>
            {/* THE completion tile (ui/CheckTile); the words beside it toggle it too. */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-sm)', cursor: pending ? 'wait' : 'pointer', color: item.done_at ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)', textDecoration: item.done_at ? 'line-through' : 'none' }}>
              <CheckTile
                size={24}
                checked={Boolean(item.done_at)}
                disabled={pending}
                aria-label={item.label}
                onToggle={() => start(async () => {
                  const r = await tickChecklistAction({ ticket_id: ticket.id, index: i, done: !item.done_at });
                  if (r.error) toast.danger(r.error); else router.refresh();
                })}
              />
              {item.label}
            </label>
          </li>
        ))}
        {list.length === 0 && <li style={{ listStyle: 'none' }}><EmptyState title="No checklist for this category." /></li>}
      </ul>
    </div>
  );
}

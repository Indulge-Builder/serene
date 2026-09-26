'use client';

// VendorFinder — THE "who does this job" picker for a ticket: the ranked suggestions for THIS
// ticket (the one vendor ranking, asked with the ticket's own words and the member) until the
// person types, then a search by name. The Vendor card and the "choose the vendor" dialog both
// compose it; never rebuild the list.

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { useDebounce } from '@/hooks/useDebounce';
import { searchTicketVendorsAction, suggestTicketVendorsAction } from '@/lib/actions/tickets';
import type { TicketVendorOption } from '@/lib/services/ticket-vendor';

export function VendorFinder({ ticketId, disabled, action = 'Use', onPick }: { ticketId: string; disabled: boolean; action?: string; onPick: (v: TicketVendorOption) => void }) {
  const [options, setOptions] = useState<TicketVendorOption[] | null>(null);
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);

  useEffect(() => {
    let alive = true;
    const term = dq.trim();
    const run = term.length >= 2 ? searchTicketVendorsAction({ ticket_id: ticketId, q: term }) : suggestTicketVendorsAction({ ticket_id: ticketId });
    run.then((res) => { if (!alive) return; if (res.error) toast.danger(res.error); setOptions(res.data ?? []); });
    return () => { alive = false; };
  }, [dq, ticketId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <input className="serene-input neu-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, or pick a suggestion" enterKeyHint="search" />
      {options === null
        ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Looking…</span>
        : options.length === 0
          ? <EmptyState variant="inline" title={dq.trim().length >= 2 ? 'No vendor by that name.' : 'No past job matches this request yet.'} description={dq.trim().length >= 2 ? undefined : 'Search by name instead.'} />
          : (
            <ul style={{ margin: 0, padding: 0 }}>
              {options.map((v) => (
                <li key={v.id} style={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderTop: '1px solid var(--theme-paper-border)' }}>
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>
                      {v.name}{v.score != null && <span style={{ marginLeft: 'var(--space-2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{v.score.toFixed(1)}</span>}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{[v.category, v.city, v.phone].filter(Boolean).join(' · ') || 'No details on file'}</span>
                    {v.reasons[0] && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{v.reasons[0]}</span>}
                    {v.flags[0] && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning-text)' }}>{v.flags[0]}</span>}
                  </div>
                  <Button size="xs" variant="ghost" disabled={disabled} onClick={() => onPick(v)}>{action}</Button>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
}

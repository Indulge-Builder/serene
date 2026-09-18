'use client';

// TicketVendorCard — who does the job (ticket-vendor.ts). With no vendor it offers the ranked
// suggestions for THIS ticket (the one vendor ranking, asked with the ticket's own words and the
// member) and a search by name. Picking one puts the vendor on the ticket and opens the job on
// the vendor's record; resolving the ticket closes that job with the right outcome.

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { useDebounce } from '@/hooks/useDebounce';
import { searchTicketVendorsAction, setTicketVendorAction, suggestTicketVendorsAction } from '@/lib/actions/tickets';
import type { TicketVendorOption } from '@/lib/services/ticket-vendor';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

function Row({ v, action, disabled, onPick }: { v: TicketVendorOption; action: string; disabled: boolean; onPick: () => void }) {
  return (
    <li style={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderTop: '1px solid var(--theme-paper-border)' }}>
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>
          {v.name}{v.score != null && <span style={{ marginLeft: 'var(--space-2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{v.score.toFixed(1)}</span>}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{[v.category, v.city, v.phone].filter(Boolean).join(' · ') || 'No details on file'}</span>
        {v.reasons[0] && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{v.reasons[0]}</span>}
        {v.flags[0] && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning-text)' }}>{v.flags[0]}</span>}
      </div>
      <Button size="xs" variant="ghost" disabled={disabled} onClick={onPick}>{action}</Button>
    </li>
  );
}

export function TicketVendorCard({ ticketId, vendor, live }: { ticketId: string; vendor: TicketVendorOption | null; live: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [finding, setFinding] = useState(false);
  const [options, setOptions] = useState<TicketVendorOption[] | null>(null);
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);

  useEffect(() => {
    if (!finding) return;
    let alive = true;
    const run = dq.trim().length >= 2 ? searchTicketVendorsAction({ ticket_id: ticketId, q: dq.trim() }) : suggestTicketVendorsAction({ ticket_id: ticketId });
    run.then((res) => { if (!alive) return; if (res.error) toast.danger(res.error); setOptions(res.data ?? []); });
    return () => { alive = false; };
  }, [finding, dq, ticketId]);

  const set = (vendorId: string | null) => start(async () => {
    const res = await setTicketVendorAction({ ticket_id: ticketId, vendor_id: vendorId });
    if (res.error) { toast.danger(res.error); return; }
    setFinding(false); setOptions(null); setQ('');
    router.refresh();
  });

  return (
    <div style={SHELL}>
      <CardHeader icon={Building2} label="Vendor" />
      <div style={BODY}>
        {vendor && !finding && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>{vendor.name}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{[vendor.category, vendor.city, vendor.phone].filter(Boolean).join(' · ') || 'No details on file'}</span>
            </div>
            {live
              ? <div style={{ display: 'flex', gap: 'var(--space-2)' }}><Button size="xs" variant="ghost" disabled={pending} onClick={() => setFinding(true)}>Change</Button><Button size="xs" variant="ghost" disabled={pending} onClick={() => set(null)}>Remove</Button></div>
              : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>This job is on the vendor&apos;s record and counts toward their score.</span>}
          </>
        )}
        {!vendor && !finding && (
          live ? <Button size="xs" onClick={() => setFinding(true)}>Find a vendor</Button> : <EmptyState variant="inline" title="No vendor was used." />
        )}
        {finding && (
          <>
            <input className="serene-input neu-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, or pick a suggestion" />
            {options === null
              ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Looking…</span>
              : options.length === 0
                ? <EmptyState variant="inline" title={dq.trim().length >= 2 ? 'No vendor by that name.' : 'No past job matches this request yet.'} />
                : <ul style={{ margin: 0, padding: 0 }}>{options.map((v) => <Row key={v.id} v={v} action="Use" disabled={pending} onPick={() => set(v.id)} />)}</ul>}
            <div><Button size="xs" variant="ghost" disabled={pending} onClick={() => { setFinding(false); setOptions(null); setQ(''); }}>Cancel</Button></div>
          </>
        )}
      </div>
    </div>
  );
}

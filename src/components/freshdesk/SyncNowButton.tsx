'use client';

// SyncNowButton — runs one budgeted Freshdesk sync cycle on demand and reports it.
// Errors go to the app toast; success shows what the cycle wrote.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { runFreshdeskSyncNow } from '@/lib/actions/freshdesk';

export function SyncNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function onClick() {
    setBusy(true);
    startTransition(async () => {
      const res = await runFreshdeskSyncNow();
      setBusy(false);
      if (res.error || !res.data) {
        toast.danger(res.error ?? 'Sync failed.');
        return;
      }
      const d = res.data;
      if (d.error) toast.warning(`Synced with a problem: ${d.error}`);
      else toast.success(`Synced: ${d.ticketsWritten} tickets, ${d.conversationsWritten} messages, ${d.changesWritten} changes (${d.apiCalls} calls, ${d.rateRemaining ?? '?'} left).`);
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={onClick} loading={busy || pending} loadingLabel="Syncing…">
      <RefreshCw style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
      Sync now
    </Button>
  );
}

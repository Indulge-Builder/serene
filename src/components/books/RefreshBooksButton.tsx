'use client';

// RefreshBooksButton — drops the five-minute Redis copy of the overview and re-renders.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { refreshBooksOverviewAction } from '@/lib/actions/books';

export function RefreshBooksButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      loadingLabel="Asking Zoho…"
      onClick={() => start(async () => {
        const res = await refreshBooksOverviewAction();
        if (res.error) { toast.danger(res.error); return; }
        router.refresh();
      })}
    >
      <RefreshCw style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} /> Refresh
    </Button>
  );
}

'use client';

// RefreshClientFinanceButton — drop the one-minute Redis copy of this client's Zoho read.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { refreshClientFinanceAction } from '@/lib/actions/books';

export function RefreshClientFinanceButton({ clientId, zohoCustomerId }: { clientId: string; zohoCustomerId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="xs"
      loading={pending}
      onClick={() => start(async () => {
        const res = await refreshClientFinanceAction({ client_id: clientId, zoho_customer_id: zohoCustomerId });
        if (res.error) { toast.danger(res.error); return; }
        router.refresh();
      })}
    >
      <RefreshCw style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} /> Refresh
    </Button>
  );
}

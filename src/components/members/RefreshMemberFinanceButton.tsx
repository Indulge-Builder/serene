'use client';

// RefreshMemberFinanceButton — drop the one-minute Redis copy of this member's Zoho read.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { refreshMemberFinanceAction } from '@/lib/actions/books';

export function RefreshMemberFinanceButton({ clientId, zohoCustomerId }: { clientId: string; zohoCustomerId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="xs"
      loading={pending}
      onClick={() => start(async () => {
        const res = await refreshMemberFinanceAction({ member_id: clientId, zoho_customer_id: zohoCustomerId });
        if (res.error) { toast.danger(res.error); return; }
        router.refresh();
      })}
    >
      <RefreshCw style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} /> Refresh
    </Button>
  );
}

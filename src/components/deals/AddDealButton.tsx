'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { UserRole, AppDomain } from '@/lib/types/database';

// Load-on-intent (perf audit G-1): chunk fetched on first open, not with /deals.
const NewDealModal = dynamic(
  () => import('@/components/deals/NewDealModal').then((m) => m.NewDealModal),
  { ssr: false },
);

type Props = {
  callerRole:   UserRole;
  callerDomain: AppDomain;
  callerName:   string;
  callerId:     string;
};

export function AddDealButton({ callerRole, callerDomain, callerName, callerId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        iconLeft={Plus}
        iconMotion="rotate"
        onClick={() => setOpen(true)}
      >
        New Deal
      </Button>

      {open && (
        <NewDealModal
          open={open}
          onClose={() => setOpen(false)}
          callerRole={callerRole}
          callerDomain={callerDomain}
          callerName={callerName}
          callerId={callerId}
        />
      )}
    </>
  );
}

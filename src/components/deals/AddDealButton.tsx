'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { NewDealModal } from '@/components/deals/NewDealModal';
import type { UserRole, AppDomain } from '@/lib/types/database';

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

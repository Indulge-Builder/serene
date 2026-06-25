'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { UserRole, AppDomain } from '@/lib/types/database';

// Heavy modal loading rule (perf audit G-1): load on intent. The call site
// conditional-renders on `open`, so the chunk defers to first open.
const CompletedTasksModal = dynamic(
  () => import('./CompletedTasksModal').then((m) => m.CompletedTasksModal),
  { ssr: false },
);

interface CompletedTasksButtonProps {
  currentUser: {
    id: string;
    full_name: string;
    role: UserRole;
    domain: AppDomain;
  };
}

export function CompletedTasksButton({ currentUser }: CompletedTasksButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        iconLeft={History}
        onClick={() => setOpen(true)}
      >
        Completed
      </Button>

      {open && (
        <CompletedTasksModal
          open={open}
          onClose={() => setOpen(false)}
          currentUser={currentUser}
        />
      )}
    </>
  );
}

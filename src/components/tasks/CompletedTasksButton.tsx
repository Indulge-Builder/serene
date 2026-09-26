'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
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
  // The /tasks header carries TWO CTAs + the bell next to a 52px-indented
  // title — the labelled button overflows a ~375px row. Icon-only below md.
  const isMobile = useMediaQuery(MQ.mobile);

  return (
    <>
      {/* The pill names the icon-only form; never tooltip the visible label. */}
      <Tooltip label="Completed tasks" side="bottom" disabled={!isMobile}>
      <Button
        variant="secondary"
        size="sm"
        iconLeft={History}
        onClick={() => setOpen(true)}
        aria-label="Completed tasks"
      >
        {isMobile ? null : 'Completed'}
      </Button>
      </Tooltip>

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

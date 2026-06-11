'use client';

import { BarChart2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export function PerformanceRosterEmptyState() {
  return (
    <EmptyState
      icon={BarChart2}
      title="Select an agent."
      description="Choose someone from the roster to see their performance for this period."
      framed
      ambient
      minHeight="min(320px, 40vh)"
    />
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition }              from 'react';
import { TabSelector, type TabItem } from '@/components/ui/TabSelector';
import type { PerformancePeriod }     from '@/lib/services/performance-service';

const PERIODS: TabItem[] = [
  { id: 'this_week',   label: 'This Week'  },
  { id: 'this_month',  label: 'This Month' },
  { id: 'last_month',  label: 'Last Month' },
  { id: 'all_time',    label: 'All Time'   },
];

type Props = {
  current: PerformancePeriod;
};

export function PerformancePeriodSelector({ current }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleSelect(period: PerformancePeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', period);
    startTransition(() => {
      router.push(`/performance?${params.toString()}`);
    });
  }

  return (
    <TabSelector
      tabs={PERIODS}
      activeTab={current}
      onChange={(id) => handleSelect(id as PerformancePeriod)}
      variant="pill"
      style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity var(--duration-fast) var(--ease-in-out)' }}
    />
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition }              from 'react';
import { SlidersHorizontal }          from 'lucide-react';
import { FilterDropdown }             from '@/components/ui/FilterDropdown';
import type { PerformancePeriod }     from '@/lib/services/performance-service';

const PERIOD_ITEMS = [
  { id: 'this_week',  label: 'This Week'  },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'all_time',   label: 'All Time'   },
];

type Props = {
  current: PerformancePeriod;
};

export function PerformancePeriodSelector({ current }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(selected: string[]) {
    const period = selected[0] as PerformancePeriod | undefined;
    if (!period) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', period);
    startTransition(() => {
      router.push(`/performance?${params.toString()}`);
    });
  }

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-3)',
        opacity:    isPending ? 0.6 : 1,
        transition: 'opacity var(--duration-fast) var(--ease-in-out)',
      }}
    >
      <SlidersHorizontal
        style={{ width: '1rem', height: '1rem', color: 'var(--theme-text-tertiary)', strokeWidth: 1.5, flexShrink: 0 }}
      />
      <FilterDropdown
        label="Time Period"
        items={PERIOD_ITEMS}
        selected={[current]}
        onChange={handleChange}
        multi={false}
      />
    </div>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition }              from 'react';
import type { PerformancePeriod }     from '@/lib/services/performance-service';

const PERIODS: { value: PerformancePeriod; label: string }[] = [
  { value: 'this_week',   label: 'This Week'  },
  { value: 'this_month',  label: 'This Month' },
  { value: 'last_month',  label: 'Last Month' },
  { value: 'all_time',    label: 'All Time'   },
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
    <div
      style={{
        display:         "flex",
        alignItems:      "center",
        gap:             "var(--space-1)",
        flexWrap:        "wrap",
        opacity:         isPending ? 0.6 : 1,
        transition:      "opacity var(--duration-fast) var(--ease-in-out)",
      }}
      role="group"
      aria-label="Select performance period"
    >
      {PERIODS.map(({ value, label }) => {
        const isActive = current === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => handleSelect(value)}
            aria-pressed={isActive}
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              padding:        "6px var(--space-4)",
              borderRadius:   "var(--radius-md)",
              border:         isActive
                ? "1px solid color-mix(in srgb, var(--theme-accent) 35%, transparent)"
                : "1px solid var(--theme-paper-border)",
              background:     isActive ? "var(--theme-accent-surface)" : "transparent",
              color:          isActive ? "var(--theme-accent)" : "var(--theme-text-secondary)",
              fontFamily:     "var(--font-sans)",
              fontSize:       "var(--text-sm)",
              fontWeight:     isActive ? "var(--weight-medium)" : "var(--weight-normal)",
              letterSpacing:  "var(--tracking-wide)",
              cursor:         "pointer",
              transition:     "all var(--duration-fast) var(--ease-in-out)",
              whiteSpace:     "nowrap",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "var(--theme-paper-subtle)";
                e.currentTarget.style.color      = "var(--theme-text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color      = "var(--theme-text-secondary)";
              }
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

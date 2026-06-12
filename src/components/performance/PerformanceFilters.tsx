'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { FilterBar } from '@/components/ui/FilterBar';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { DatePicker } from '@/components/ui/DatePicker';
import { m as motion, AnimatePresence } from 'framer-motion';
import { BASE_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import { buildFilterParams } from '@/lib/utils/filter-params';
import type { PerformancePeriod } from '@/lib/services/performance-service';

const PERIOD_ITEMS = [
  { id: 'today',      label: 'Today' },
  { id: 'this_week',  label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Previous Month' },
  { id: 'custom',     label: 'Custom' },
];

type PerformanceFiltersProps = {
  period:     PerformancePeriod;
  customFrom: string | null;
  customTo:   string | null;
  /** Agent roster search — hidden on agent self-view */
  showSearch: boolean;
};

export function PerformanceFilters({
  period,
  customFrom,
  customTo,
  showSearch,
}: PerformanceFiltersProps) {
  const router              = useRouter();
  const pathname            = usePathname();
  const params              = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const searchParam = params.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(searchParam);

  const [fromDate, setFromDate] = useState<Date | null>(
    customFrom ? new Date(customFrom) : null,
  );
  const [toDate, setToDate] = useState<Date | null>(
    customTo ? new Date(customTo) : null,
  );

  useEffect(() => {
    setSearchInput(params.get('search') ?? '');
  }, [params]);

  useEffect(() => {
    setFromDate(customFrom ? new Date(customFrom) : null);
    setToDate(customTo ? new Date(customTo) : null);
  }, [customFrom, customTo]);

  useEffect(() => {
    if (!showSearch) return;
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      const current = params.get('search') ?? '';
      if (trimmed === current) return;
      push({ search: trimmed || null });
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, showSearch]);

  const activeCount =
    (period !== 'this_month' ? 1 : 0) +
    (searchParam ? 1 : 0) +
    (customFrom ? 1 : 0) +
    (customTo ? 1 : 0);

  function push(updates: Record<string, string | null>) {
    const next = buildFilterParams(params, updates);
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function clearAll() {
    setSearchInput('');
    startTransition(() => {
      router.push(pathname);
    });
  }

  function handlePeriodSelect(selected: string[]) {
    const nextPeriod = (selected[0] ?? 'this_month') as PerformancePeriod;
    if (nextPeriod === period && nextPeriod !== 'custom') return;
    if (nextPeriod === 'custom') {
      push({ period: 'custom' });
      return;
    }
    push({ period: nextPeriod, from: null, to: null });
  }

  function handleFromChange(date: Date | null) {
    setFromDate(date);
    if (!date) return;
    push({
      period: 'custom',
      from:   date.toISOString(),
      to:     toDate ? toDate.toISOString() : null,
    });
  }

  function handleToChange(date: Date | null) {
    setToDate(date);
    if (!date) return;
    push({
      period: 'custom',
      from:   fromDate ? fromDate.toISOString() : null,
      to:     date.toISOString(),
    });
  }

  return (
    <FilterBar
      searchValue={searchInput}
      onSearchChange={setSearchInput}
      searchPlaceholder="Search agents…"
      searchAriaLabel="Search agents"
      searchStyle={{ flex: '1 1 220px', minWidth: '180px' }}
      hideSearch={!showSearch}
      activeCount={activeCount}
      onClearAll={clearAll}
      style={{
        opacity:    isPending ? 0.6 : 1,
        transition: 'opacity var(--duration-fast) var(--ease-in-out)',
      }}
    >
      <FilterDropdown
        label="Period"
        icon={Calendar}
        items={PERIOD_ITEMS}
        selected={[period]}
        onChange={handlePeriodSelect}
        multi={false}
        menuPortal
      />

      <AnimatePresence>
        {period === 'custom' && (
          <motion.div
            key="custom-date-pickers"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}
          >
            <DatePicker
              value={fromDate}
              onChange={handleFromChange}
              placeholder="From…"
              maxDate={toDate ?? undefined}
              aria-label="Custom from date"
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>→</span>
            <DatePicker
              value={toDate}
              onChange={handleToChange}
              placeholder="To…"
              minDate={fromDate ?? undefined}
              aria-label="Custom to date"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </FilterBar>
  );
}

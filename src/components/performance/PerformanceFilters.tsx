'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { Calendar, SlidersHorizontal, X } from 'lucide-react';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { DatePicker } from '@/components/ui/DatePicker';
import { SearchBar } from '@/components/ui/SearchBar';
import { motion, AnimatePresence } from 'framer-motion';
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
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-3)',
        flexWrap:   'wrap',
        opacity:    isPending ? 0.6 : 1,
        transition: 'opacity var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {/* Filter icon + active count badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        <SlidersHorizontal
          style={{ width: '1rem', height: '1rem', color: 'var(--theme-text-tertiary)', strokeWidth: 1.5 }}
        />
        {activeCount > 0 && (
          <span
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              minWidth:       '1.25rem',
              height:         '1.25rem',
              padding:        '0 0.25rem',
              borderRadius:   'var(--radius-full)',
              background:     'var(--theme-accent)',
              color:          'var(--theme-accent-fg)',
              fontSize:       'var(--text-2xs)',
              fontWeight:     'var(--weight-medium)',
              lineHeight:     1,
            }}
          >
            {activeCount}
          </span>
        )}
      </div>

      {showSearch && (
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search agents…"
          size="md"
          aria-label="Search agents"
          style={{ flex: '1 1 220px', minWidth: '180px' }}
        />
      )}

      <FilterDropdown
        label="Period"
        icon={Calendar}
        items={PERIOD_ITEMS}
        selected={[period]}
        onChange={handlePeriodSelect}
        multi={false}
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

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          disabled={isPending}
          style={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:        'var(--space-1)',
            height:     '2.25rem',
            padding:    '0 var(--space-2)',
            border:     'none',
            background: 'transparent',
            color:      'var(--theme-text-tertiary)',
            fontSize:   'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            cursor:     isPending ? 'not-allowed' : 'pointer',
            opacity:    isPending ? 0.5 : 1,
            flexShrink: 0,
            transition: 'color var(--duration-fast) var(--ease-in-out)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-primary)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)'; }}
        >
          <X style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
          <span>Clear filters</span>
        </button>
      )}
    </div>
  );
}

'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { DatePicker } from '@/components/ui/DatePicker';
import { SearchBar } from '@/components/ui/SearchBar';
import { GIA_DOMAIN_FILTER_ITEMS } from '@/lib/constants/domains';
import {
  buildFilterParams,
  dateFromUrlParam,
  dateToUrlParam,
} from '@/lib/utils/filter-params';
import type { UserRole } from '@/lib/types/database';

type CampaignFiltersProps = {
  role:             UserRole;
  showDomainFilter: boolean;
};

export function CampaignFilters({ role: _role, showDomainFilter }: CampaignFiltersProps) {
  const router              = useRouter();
  const pathname            = usePathname();
  const params              = useSearchParams();
  const [, startTransition] = useTransition();

  const domainFilter = showDomainFilter ? params.get('domain') : null;
  const dateFrom     = params.get('date_from');
  const dateTo       = params.get('date_to');
  const searchParam  = params.get('search') ?? '';

  const [searchInput, setSearchInput] = useState(searchParam);

  useEffect(() => {
    setSearchInput(params.get('search') ?? '');
  }, [params]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      const current = params.get('search') ?? '';
      if (trimmed === current) return;
      const next = buildFilterParams(params, { search: trimmed || null });
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`);
      });
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const activeCount =
    (searchParam ? 1 : 0) +
    (domainFilter ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

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

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-3)',
        flexWrap:   'wrap',
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
              fontSize:       '10px',
              fontWeight:     'var(--weight-medium)',
              lineHeight:     1,
            }}
          >
            {activeCount}
          </span>
        )}
      </div>

      {/* Search — debounced 500ms → URL `search` param */}
      <SearchBar
        value={searchInput}
        onChange={setSearchInput}
        placeholder="Search campaigns…"
        size="md"
        aria-label="Search campaigns"
        style={{ flex: '1 1 220px', minWidth: '180px' }}
      />

      {/* Domain — single select, admin/founder only (GIA_DOMAINS) */}
      {showDomainFilter && (
        <FilterDropdown
          label="Domain"
          items={GIA_DOMAIN_FILTER_ITEMS}
          selected={domainFilter ? [domainFilter] : []}
          onChange={(next) => push({ domain: next[0] ?? null })}
        />
      )}

      {/* Date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        <DatePicker
          value={dateFromUrlParam(dateFrom)}
          onChange={(d) => push({ date_from: dateToUrlParam(d) })}
          placeholder="From…"
          maxDate={dateTo ? dateFromUrlParam(dateTo) ?? undefined : undefined}
          aria-label="From date"
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>→</span>
        <DatePicker
          value={dateFromUrlParam(dateTo)}
          onChange={(d) => push({ date_to: dateToUrlParam(d) })}
          placeholder="To…"
          minDate={dateFrom ? dateFromUrlParam(dateFrom) ?? undefined : undefined}
          aria-label="To date"
        />
      </div>

      {/* Clear all */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
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
            cursor:     'pointer',
            transition: 'color var(--duration-fast) var(--ease-in-out)',
            flexShrink: 0,
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

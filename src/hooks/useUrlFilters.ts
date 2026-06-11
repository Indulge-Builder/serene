'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { buildFilterParams } from '@/lib/utils/filter-params';

type UseUrlFiltersOptions = {
  /** Keys removed on every filter change (e.g. leads/deals `page`). */
  resetKeys?: string[];
  /** Debounce for search → URL push. 350ms is the standard — do not fork. */
  searchDelay?: number;
};

/**
 * THE URL-param filter plumbing for list-page filter bars (leads, deals,
 * campaigns — any page whose filters live in the URL). Owns:
 *
 * - `searchInput` controlled state, seeded from the `search` URL param
 * - debounced (350ms via useDebounce) search → one `router.push`
 * - re-sync of the search input on browser back/forward (`params` change)
 * - `push(updates)` — buildFilterParams + startTransition router.push
 * - `clearAll()` — clears search input immediately + pushes bare pathname
 *
 * Pair with <FilterBar> from src/components/ui/FilterBar.tsx. Client-state
 * filter bars (TasksFilters) do NOT use this hook — they pass their own
 * value/onChange straight to <FilterBar>.
 *
 * Never re-implement this plumbing inline in a filter component.
 */
export function useUrlFilters(options: UseUrlFiltersOptions = {}) {
  const { resetKeys, searchDelay = 350 } = options;

  const router              = useRouter();
  const pathname            = usePathname();
  const params              = useSearchParams();
  const [, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(() => params.get('search') ?? '');
  const debouncedSearch = useDebounce(searchInput, searchDelay);

  // Sync search input when the URL changes (browser back/forward, clearAll).
  useEffect(() => {
    setSearchInput(params.get('search') ?? '');
  }, [params]);

  // Push debounced search to URL (skips on mount and no-op after clearAll).
  useEffect(() => {
    const trimmed = debouncedSearch.trim();
    if (trimmed === (params.get('search') ?? '')) return;
    const next = buildFilterParams(params, { search: trimmed || null }, { resetKeys });
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
    // deps: debouncedSearch only — params/router/pathname are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function push(updates: Record<string, string | null>) {
    const next = buildFilterParams(params, updates, { resetKeys });
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

  return { params, pathname, searchInput, setSearchInput, push, clearAll };
}

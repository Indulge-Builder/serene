'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition, useState, useEffect, useRef } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { buildFilterParams, parseMultiParam } from '@/lib/utils/filter-params';

type UseUrlFiltersOptions = {
  /** Keys removed on every filter change (e.g. leads/deals `page`). */
  resetKeys?: string[];
  /** Debounce for search + pushDebounced → URL push. 350ms is the standard — do not fork. */
  searchDelay?: number;
};

/**
 * THE URL-param filter plumbing for list-page filter bars (leads, deals,
 * campaigns — any page whose filters live in the URL). Owns:
 *
 * - `searchInput` controlled state, seeded from the `search` URL param
 * - debounced (350ms via useDebounce) search → one `router.push`
 * - re-sync of the search input on browser back/forward only — never on the
 *   echo of its own push (in-flight ledger) or on an unrelated filter commit
 * - `push(updates)` — buildFilterParams + startTransition router.push
 * - `pushDebounced(updates)` — merges rapid updates (multi-select toggle
 *   bursts) into one accumulator and flushes them as ONE router.push
 * - `clearAll()` — clears search input immediately + pushes bare pathname
 *
 * Every commit path drains the pending accumulator first, so an immediate
 * push (single-select, dates, search) can never race a pending debounced
 * commit into dropping a filter key — they merge into the same navigation.
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

  // Latest committed params, for commits fired from timer closures —
  // a flush must build on whatever navigation landed since it was armed.
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // Debounced-commit accumulator (pushDebounced). Lives in refs so a burst
  // of updates costs zero re-renders until the single flush navigates.
  const pendingRef    = useRef<Record<string, string | null>>({});
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchInput, setSearchInput] = useState(() => params.get('search') ?? '');
  const debouncedSearch = useDebounce(searchInput, searchDelay);

  // Search values this hook has pushed that have not echoed back in the URL
  // yet (oldest first). Several can be in flight on a slow list page: the
  // debounce fires every 350ms while an RSC navigation takes longer.
  const inFlightSearchRef = useRef<string[]>([]);
  // The `search` param as of the last URL commit we processed.
  const urlSearchRef = useRef(params.get('search') ?? '');

  // Re-sync the input ONLY on an external search change (browser
  // back/forward, a link with ?search=). Bug fix 2026-09-10: this used to run
  // on every params change, so the echo of our own debounced push overwrote
  // whatever the user had typed since (characters vanished, trailing space
  // trimmed mid-word), and an unrelated filter commit wiped a pending search.
  useEffect(() => {
    const urlSearch = params.get('search') ?? '';
    if (urlSearch === urlSearchRef.current) return;   // search param unchanged
    urlSearchRef.current = urlSearch;

    const idx = inFlightSearchRef.current.indexOf(urlSearch);
    if (idx !== -1) {
      // Our own echo — drop it and anything older it superseded; keep typing.
      inFlightSearchRef.current.splice(0, idx + 1);
      return;
    }
    inFlightSearchRef.current = [];
    setSearchInput(urlSearch);
  }, [params]);

  /** Cancel the flush timer and hand back whatever was accumulated. */
  function drainPending(): Record<string, string | null> {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    const pending      = pendingRef.current;
    pendingRef.current = {};
    return pending;
  }

  function push(updates: Record<string, string | null>) {
    // Carry the newest in-flight search along: paramsRef lags a pending
    // search navigation, so a filter commit landing after it must not build
    // on a URL that predates the search and silently drop it.
    const inFlight = inFlightSearchRef.current.at(-1);
    const carried: Record<string, string | null> =
      inFlight !== undefined && !('search' in updates) ? { search: inFlight || null } : {};
    const next = buildFilterParams(
      paramsRef.current,
      { ...carried, ...drainPending(), ...updates },
      { resetKeys },
    );
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function pushDebounced(updates: Record<string, string | null>) {
    Object.assign(pendingRef.current, updates);
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => push({}), searchDelay);
  }

  // Push debounced search to URL (skips on mount and no-op after clearAll).
  // Compares against the newest in-flight push, not the committed URL, so
  // "type, then delete back" while a navigation is pending still corrects it.
  useEffect(() => {
    const trimmed   = debouncedSearch.trim();
    const committed = inFlightSearchRef.current.at(-1) ?? urlSearchRef.current;
    if (trimmed === committed) return;
    inFlightSearchRef.current.push(trimmed);
    push({ search: trimmed || null });
    // deps: debouncedSearch only — params/router/pathname are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function clearAll() {
    drainPending();
    setSearchInput('');
    inFlightSearchRef.current.push('');
    startTransition(() => {
      router.push(pathname);
    });
  }

  // Never flush after unmount.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  return { params, pathname, searchInput, setSearchInput, push, pushDebounced, clearAll };
}

type UseUrlFiltersReturn = ReturnType<typeof useUrlFilters>;

/**
 * THE optimistic multi-select URL param for immediate-commit filter bars
 * (leads Status/Outcome). Local state echoes the URL value so checkboxes
 * tick instantly (useSearchParams only updates after the navigation
 * commits); the URL commit goes through `pushDebounced`, so a burst of
 * toggles lands as ONE router.push / one RSC render. Re-syncs from the URL
 * on commit echo, browser back/forward, and clearAll.
 */
export function useMultiSelectUrlParam<T extends string>(
  url: UseUrlFiltersReturn,
  key: string,
): [T[], (next: T[]) => void] {
  const { params, pushDebounced } = url;

  const [values, setValues] = useState<T[]>(() => parseMultiParam<T>(params, key));

  useEffect(() => {
    setValues(parseMultiParam<T>(params, key));
  }, [params, key]);

  function onChange(next: T[]) {
    setValues(next);
    pushDebounced({ [key]: next.length > 0 ? next.join(',') : null });
  }

  return [values, onChange];
}

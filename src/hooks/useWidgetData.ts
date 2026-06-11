'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type DependencyList,
  type SetStateAction,
} from 'react';

type WidgetFetcher<T> = () => Promise<{ data: T | null }>;

type UseWidgetDataOptions<T> = {
  /** RSC-provided payload. Non-null seed marks the widget loaded with zero client fetches. */
  seed: T | null;
  /** The widget's ONE fetcher — used by the auto-fetch effect and refetch() alike. */
  fetcher: WidgetFetcher<T>;
  /**
   * Gate for the deps-driven fetch effect. Default: fetch only when no seed exists.
   * Cohort widgets pass "the active view is not the RSC-seeded one".
   */
  autoFetch?: boolean;
  /** Dependencies that re-trigger the auto fetch (date range, domain tab, userId…). */
  deps?: DependencyList;
};

/**
 * THE dashboard-widget data lifecycle (dry-audit H-6). Owns the contract every
 * widget previously hand-rolled: seed from RSC `initialData` (skip the mount
 * fetch when seeded), deps-driven auto-fetch with a cancelled flag inside
 * `useTransition`, and a `refetch` for refresh buttons / tab changes.
 *
 * - `apply` seeds fresh RSC payloads (pair with `useDashboardCohortSync`).
 * - `refetch(override?)` accepts a one-off fetcher so tab-change handlers can
 *   fetch with the just-selected value before state commits.
 * - `setData` is exposed for Realtime merges (AgentActivityWidget).
 * - Failed fetches (`data: null`) keep previous data and never flip `loaded`,
 *   matching the original per-widget behaviour.
 */
export function useWidgetData<T>(options: UseWidgetDataOptions<T>): {
  data: T | null;
  loaded: boolean;
  isPending: boolean;
  refetch: (override?: WidgetFetcher<T>) => void;
  apply: (next: T) => void;
  setData: Dispatch<SetStateAction<T | null>>;
} {
  const { seed, fetcher, deps = [] } = options;
  const autoFetch = options.autoFetch ?? seed === null;

  const [data, setData] = useState<T | null>(seed);
  const [loaded, setLoaded] = useState(seed !== null);
  const [isPending, startTransition] = useTransition();

  // Always call the latest fetcher closure — effects and refetch read through the ref.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const apply = useCallback((next: T) => {
    setData(next);
    setLoaded(true);
  }, []);

  const refetch = useCallback((override?: WidgetFetcher<T>) => {
    startTransition(async () => {
      const result = await (override ?? fetcherRef.current)();
      if (result.data !== null) {
        setData(result.data);
        setLoaded(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!autoFetch) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await fetcherRef.current();
      if (!cancelled && result.data !== null) {
        setData(result.data);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, ...deps]);

  return { data, loaded, isPending, refetch, apply, setData };
}

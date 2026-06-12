/**
 * Shared URL filter param helpers for list-page filter bars (leads, campaigns, etc.).
 * Client components only — used with useSearchParams + router.push.
 */

export type BuildFilterParamsOptions = {
  /** Keys removed whenever any filter changes (e.g. leads `page`) */
  resetKeys?: string[];
};

export function buildFilterParams(
  current: URLSearchParams,
  updates: Record<string, string | null>,
  options: BuildFilterParamsOptions = {},
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [key, val] of Object.entries(updates)) {
    if (val === null || val === '') {
      next.delete(key);
    } else {
      next.set(key, val);
    }
  }
  for (const key of options.resetKeys ?? []) {
    next.delete(key);
  }
  return next;
}

/** Parse a comma-separated multi-select URL param ('a,b' → ['a','b']). */
export function parseMultiParam<T extends string>(
  params: URLSearchParams,
  key: string,
): T[] {
  const val = params.get(key);
  if (!val) return [];
  return val.split(',').filter(Boolean) as T[];
}

/** Parse YYYY-MM-DD URL param as local calendar date (IST-safe). */
export function dateFromUrlParam(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Serialize local calendar date to YYYY-MM-DD for URL params. */
export function dateToUrlParam(d: Date | null): string | null {
  if (!d) return null;
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

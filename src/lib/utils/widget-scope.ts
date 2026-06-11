import type { AppDomain } from '@/lib/types/database';
import type { GiaDomain } from '@/lib/constants/domains';

/** Domain-picker state shared by the cohort dashboard widgets (pipeline, campaigns, volume). */
export type WidgetDomainMode = 'all' | GiaDomain;

/**
 * THE manager-vs-domain-picker scope decision for dashboard widget fetches
 * (dry-audit H-5) — previously re-derived in ~9 branch sites across 3 widgets.
 *
 * Managers are always scoped to their own domain by the server; they never
 * request a target domain. Admin/founder on the "All" tab request the
 * unscoped summary; on a domain tab they request that domain. The server
 * action re-enforces the manager override regardless of what is sent here.
 */
export function resolveWidgetScope(role: string, mode: WidgetDomainMode): AppDomain | undefined {
  if (role === 'manager' || mode === 'all') return undefined;
  return mode;
}

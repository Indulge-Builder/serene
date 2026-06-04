// Async server component — direct child of <Suspense>.
// Fetches agent roster for a domain in the given period.
// domain is ALWAYS from the server-verified profile (manager) or from
// FounderPerformanceShell (founder/admin, read from URL params there).
// Never trust a raw URL domain param directly in this component.

import {
  getAgentRosterPerformance,
  getPeriodDateRange,
  type PerformancePeriod,
} from '@/lib/services/performance-service';
import type { AppDomain }          from '@/lib/types/database';
import { ManagerPerformancePanel } from '@/components/performance/ManagerPerformancePanel';

type Props = {
  domain:      AppDomain;
  period:      PerformancePeriod;
  customFrom?: string;
  customTo?:   string;
  // When true (founder/admin all-domains view), roster shows all agents across all domains.
  allDomains?: boolean;
};

export async function ManagerPerformanceAsync({ domain, period, customFrom, customTo, allDomains = false }: Props) {
  const range    = getPeriodDateRange(period);
  const from     = (period === 'custom' && customFrom) ? customFrom : range.from;
  const to       = (period === 'custom' && customTo)   ? customTo   : range.to;

  // Roster: null domain → all agents across all domains (founder/admin).
  const rosterDomain = allDomains ? null : domain;
  const agentRoster  = await getAgentRosterPerformance(rosterDomain, from, to);

  return (
    <ManagerPerformancePanel
      agentRoster={agentRoster}
      domain={domain}
      period={period}
      customFrom={(period === 'custom' && customFrom) ? customFrom : undefined}
      customTo={(period === 'custom' && customTo)     ? customTo   : undefined}
      allDomains={allDomains}
    />
  );
}

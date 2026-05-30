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
  domain: AppDomain;
  period: PerformancePeriod;
};

export async function ManagerPerformanceAsync({ domain, period }: Props) {
  const { from, to } = getPeriodDateRange(period);
  const agentRoster  = await getAgentRosterPerformance(domain, from, to);

  return (
    <ManagerPerformancePanel
      agentRoster={agentRoster}
      domain={domain}
      period={period}
    />
  );
}

// Async server component — direct child of <Suspense>.
// Fetches agent roster for a domain in the given period.
// domain is ALWAYS from the server-verified profile (manager) or from
// FounderPerformanceShell (founder/admin, read from URL params there).
// Never trust a raw URL domain param directly in this component.

import {
  getAgentRosterPerformance,
  getAgentDetailMetrics,
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

  // Fetch roster first — we need roster[0].id to pre-fetch detail.
  // Roster query is fast (profiles + lead aggregates, capped at domain agent count).
  const agentRoster = await getAgentRosterPerformance(domain, from, to);

  const firstAgentId = agentRoster.length > 0 ? agentRoster[0].id : null;

  // Pre-fetch the top agent's detail metrics server-side so the right panel
  // arrives with real data on first paint — no skeleton flash for the default selection.
  // Guard: never call getAgentDetailMetrics with a null/undefined id.
  const initialDetailMetrics = firstAgentId
    ? await getAgentDetailMetrics(firstAgentId, domain, from, to)
    : null;

  return (
    <ManagerPerformancePanel
      key={period}
      agentRoster={agentRoster}
      domain={domain}
      period={period}
      initialAgentId={firstAgentId}
      initialDetailMetrics={initialDetailMetrics}
    />
  );
}

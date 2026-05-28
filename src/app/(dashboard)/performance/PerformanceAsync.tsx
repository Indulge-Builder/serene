// Async server component — direct child of <Suspense>.
// Calls all six service functions in one Promise.all.
// No UI of its own — orchestrates and passes typed props to client components.

import {
  getCoreFourMetrics,
  getEffortMetrics,
  getCallOutcomeBreakdown,
  getPreviousPeriodCoreMetrics,
  getTeamBenchmarks,
  type PerformancePeriod,
} from '@/lib/services/performance-service';
import type { AppDomain } from '@/lib/types/database';
import { CoreFourGrid }   from '@/components/performance/CoreFourGrid';
import { EffortGrid }     from '@/components/performance/EffortGrid';
import { CallOutcomeBar } from '@/components/performance/CallOutcomeBar';

type Props = {
  agentId: string;
  domain:  AppDomain;
  period:  PerformancePeriod;
};

export async function PerformanceAsync({ agentId, domain, period }: Props) {
  const [coreMetrics, effortMetrics, outcomeBreakdown, prevMetrics, benchmarks] =
    await Promise.all([
      getCoreFourMetrics(agentId, period),
      getEffortMetrics(agentId, period),
      getCallOutcomeBreakdown(agentId, period),
      getPreviousPeriodCoreMetrics(agentId, period),
      getTeamBenchmarks(domain, period),
    ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <CoreFourGrid
        current={coreMetrics}
        previous={prevMetrics ?? null}
        benchmarks={benchmarks}
      />
      <EffortGrid metrics={effortMetrics} />
      <CallOutcomeBar breakdown={outcomeBreakdown} />
    </div>
  );
}

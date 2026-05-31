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
} from "@/lib/services/performance-service";
import type { AppDomain } from "@/lib/types/database";
import { CoreFourGrid } from "@/components/performance/CoreFourGrid";
import { EffortGrid } from "@/components/performance/EffortGrid";
import { CallOutcomeBar } from "@/components/performance/CallOutcomeBar";

type Props = {
  agentId: string;
  domain: AppDomain;
  period: PerformancePeriod;
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        marginBottom: "var(--space-1)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-2xs)",
          fontWeight: "var(--weight-medium)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--theme-text-tertiary)",
          margin: 0,
          flexShrink: 0,
        }}
      >
        {label}
      </p>
      <div
        style={{
          flex: 1,
          height: "1px",
          background: "var(--theme-paper-border)",
        }}
      />
    </div>
  );
}

export async function PerformanceAsync({ agentId, domain, period }: Props) {
  const [
    coreMetrics,
    effortMetrics,
    outcomeBreakdown,
    prevMetrics,
    benchmarks,
  ] = await Promise.all([
    getCoreFourMetrics(agentId, period),
    getEffortMetrics(agentId, period),
    getCallOutcomeBreakdown(agentId, period),
    getPreviousPeriodCoreMetrics(agentId, period),
    getTeamBenchmarks(domain, period),
  ]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
      }}
    >
      {/* Tier 1 — Core Four KPIs in one row */}
      <div>
        <SectionLabel label="Key Performance Indicators" />
        <CoreFourGrid
          current={coreMetrics}
          previous={prevMetrics ?? null}
          benchmarks={benchmarks}
        />
      </div>

      {/* Tier 2 — Effort metrics */}
      <div>
        <SectionLabel label="Effort & Pipeline" />
        <EffortGrid metrics={effortMetrics} />
      </div>

      {/* Tier 3 — Call outcome donut */}
      <div>
        <SectionLabel label="Call Outcomes" />
        <CallOutcomeBar breakdown={outcomeBreakdown} />
      </div>
    </div>
  );
}

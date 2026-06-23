import { StatTile } from "@/components/ui/StatTile";
import { formatCount } from "@/lib/utils/numbers";
import type { AgentOversightMetrics } from "@/lib/types/oversight";

// Tier 3 metric tiles — composes the shared StatTile (variant="card", R-01).
// Display-only, server-component-safe. The Overdue tile carries a warning sub
// line when > 0 (the StatTile sub slot, not a one-edge border — V-11).
export function AgentOversightMetricsRow({
  metrics,
}: {
  metrics: AgentOversightMetrics;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatTile label="Open" value={formatCount(metrics.openCount)} variant="card" />
      <StatTile
        label="In Review"
        value={formatCount(metrics.inReviewCount)}
        variant="card"
      />
      <StatTile
        label="Overdue"
        value={formatCount(metrics.overdueCount)}
        variant="card"
        sub={
          metrics.overdueCount > 0
            ? { text: "needs attention", color: "var(--color-warning)" }
            : undefined
        }
      />
      <StatTile
        label="Completed"
        value={formatCount(metrics.completedCount)}
        variant="card"
        sub={{ text: "last 30 days", color: "var(--theme-text-tertiary)" }}
      />
    </div>
  );
}

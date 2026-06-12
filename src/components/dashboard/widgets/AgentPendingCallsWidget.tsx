"use client";

import { SnapshotCountWidget } from "./SnapshotCountWidget";
import type { WidgetProps } from "@/components/dashboard/DashboardWidgetSlot";

/**
 * Pending Calls — the agent's open Gia follow-up tasks (non-terminal).
 * Live pipeline snapshot: seeded by get_dashboard_summary (migration 0115),
 * never scoped by the dashboard date filter.
 */
export function AgentPendingCallsWidget({ initialData }: WidgetProps) {
  return (
    <SnapshotCountWidget
      count={initialData?.pending_calls_count ?? 0}
      label="Pending Calls"
      hint="open follow-up calls on your plate"
      href="/tasks?tab=gia"
      positiveColor="var(--color-info-text)"
    />
  );
}

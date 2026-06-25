"use client";

import { UserPlus } from "lucide-react";
import { SnapshotCountWidget } from "./SnapshotCountWidget";
import type { WidgetProps } from "@/components/dashboard/DashboardWidgetSlot";

/**
 * New Leads — the agent's own leads still at status 'new'.
 * Live pipeline snapshot: seeded by get_dashboard_summary (migration 0115),
 * never scoped by the dashboard date filter.
 */
export function AgentNewLeadsWidget({ initialData }: WidgetProps) {
  return (
    <SnapshotCountWidget
      count={initialData?.new_leads_count ?? 0}
      label="New Leads"
      hint="untouched leads waiting for a first call"
      href="/leads?status=new"
      icon={UserPlus}
      positiveColor="var(--color-success-text)"
    />
  );
}

"use client";

import { SnapshotCountWidget } from "./SnapshotCountWidget";
import type { WidgetProps } from "@/components/dashboard/DashboardWidgetSlot";

export function ManagerColdLeadsWidget({ initialData }: WidgetProps) {
  return (
    <SnapshotCountWidget
      count={initialData?.cold_leads_count ?? 0}
      label="Going Cold"
      hint="leads with no activity in 5+ days"
      href="/leads?going_cold=true"
      positiveColor="var(--color-warning)"
    />
  );
}

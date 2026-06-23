"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import {
  WIDGET_MAP,
  type WidgetSize,
} from "@/lib/constants/dashboard-widgets";
import { useWidgetDensity, WidgetDensityProvider } from "@/hooks/useWidgetDensity";
import { WidgetSkeleton } from "./WidgetSkeleton";
import type { UserRole, AppDomain } from "@/lib/types/database";
import type { GiaDomain } from "@/lib/constants/domains";
import type { DashboardSummary } from "@/lib/types";
import type { DateRange } from "@/lib/utils/date-range";

// Static dynamic import map — never use require() from a string.
// Each widget is code-split independently. Roles that cannot see a widget
// never load its bundle.
const WIDGET_COMPONENTS: Record<
  string,
  React.LazyExoticComponent<React.ComponentType<WidgetProps>>
> = {
  "agent-tasks": lazy(() =>
    import("./widgets/AgentTasksWidget").then((m) => ({
      default: m.AgentTasksWidget,
    })),
  ),
  "agent-activity": lazy(() =>
    import("./widgets/AgentActivityWidget").then((m) => ({
      default: m.AgentActivityWidget,
    })),
  ),
  "manager-lead-status": lazy(() =>
    import("./widgets/ManagerLeadStatusWidget").then((m) => ({
      default: m.ManagerLeadStatusWidget,
    })),
  ),
  "manager-lead-volume": lazy(() =>
    import("./widgets/ManagerLeadVolumeWidget").then((m) => ({
      default: m.ManagerLeadVolumeWidget,
    })),
  ),
  "manager-campaigns": lazy(() =>
    import("./widgets/ManagerCampaignWidget").then((m) => ({
      default: m.ManagerCampaignWidget,
    })),
  ),
  "manager-cold-leads": lazy(() =>
    import("./widgets/ManagerColdLeadsWidget").then((m) => ({
      default: m.ManagerColdLeadsWidget,
    })),
  ),
  "agent-pending-calls": lazy(() =>
    import("./widgets/AgentPendingCallsWidget").then((m) => ({
      default: m.AgentPendingCallsWidget,
    })),
  ),
  "agent-new-leads": lazy(() =>
    import("./widgets/AgentNewLeadsWidget").then((m) => ({
      default: m.AgentNewLeadsWidget,
    })),
  ),
  "elaya-presence": lazy(() =>
    import("./widgets/ElayaPresenceCard").then((m) => ({
      default: m.ElayaPresenceCard,
    })),
  ),
  "manager-budget": lazy(() =>
    import("./widgets/ManagerBudgetWidget").then((m) => ({
      default: m.ManagerBudgetWidget,
    })),
  ),
};

export type WidgetProps = {
  userId: string;
  role: UserRole;
  domain: AppDomain;
  /** Caller's first name — used by presence surfaces (Elaya card greeting). */
  firstName?: string;
  /** Pre-fetched dashboard summary from the RSC. When present widgets skip their mount fetch. */
  initialData?: DashboardSummary;
  /**
   * Default size tier. Retained for back-compat of widget signatures, but the
   * SLOT now owns the rendered height (continuous heightPx, 2026-06-24) — a
   * widget must fill its slot (height:100%), never read a size→px map.
   */
  size?: WidgetSize;
  /**
   * Active date range from the global dashboard date filter.
   * Pipeline, Volume, and Campaigns widgets use this to scope their data.
   * Agent Tasks and Recent Activity always ignore it (they are "live / now").
   */
  dateRange?: DateRange;
  /**
   * Global domain scope from the shared selector (serene-domain param/cookie),
   * resolved server-side per role. Admin/founder → the chosen Gia domain, or
   * null for the org-wide "All domains" aggregate. Manager/agent → always null
   * (the server pins managers to their own domain). The three cohort widgets
   * (pipeline, volume, campaigns) seed from this; there is no per-widget tab.
   */
  scopeDomain?: GiaDomain | null;
};

type DashboardWidgetSlotProps = WidgetProps & {
  widgetId: string;
  size: WidgetSize;
  editMode: boolean;
  onRemove: (widgetId: string) => void;
  /** RGL drag-handle element (rendered only in edit mode; carries the drag class). */
  dragHandle?: React.ReactNode;
};

// Enforce minimum skeleton display time (V-08: never < 150ms)
function MinSkeletonBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return <WidgetSkeleton fill />;
  return <>{children}</>;
}

export function DashboardWidgetSlot({
  widgetId,
  editMode,
  onRemove,
  dragHandle,
  userId,
  role,
  domain,
  firstName,
  initialData,
  size,
  dateRange,
  scopeDomain,
}: DashboardWidgetSlotProps) {
  const definition = WIDGET_MAP[widgetId];
  const Component = WIDGET_COMPONENTS[widgetId];

  // Measure the cell live → resolve a density tier → hand it to the widget via
  // context. RGL sizes the parent .react-grid-item; the slot fills it (100%).
  const { ref: densityRef, tier, measured } = useWidgetDensity<HTMLDivElement>();

  if (!definition || !Component) return null;

  return (
    <div
      ref={densityRef}
      role="group"
      aria-label={definition.label}
      style={{ position: "relative", height: "100%", width: "100%" }}
    >
      {/* Edit mode overlay — dashed accent border */}
      {editMode && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: "var(--z-raised)",
            borderRadius: "var(--radius-lg)",
            border: "2px dashed var(--theme-accent)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Edit mode controls — drag handle (RGL grabs this), remove */}
      {editMode && (
        <div
          style={{
            position: "absolute",
            top: "var(--space-2)",
            right: "var(--space-2)",
            zIndex: "calc(var(--z-raised) + 1)",
            display: "flex",
            gap: "var(--space-1)",
            alignItems: "center",
          }}
        >
          {dragHandle}
          <button
            onClick={() => onRemove(widgetId)}
            aria-label={`Remove ${definition.label}`}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--theme-paper-border)",
              background: "var(--theme-paper)",
              color: "var(--color-danger)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Withhold the widget until the slot has a real measured box — a chart's
          ResponsiveContainer measures synchronously on first render and reads -1
          before RGL resolves the item height. The skeleton holds the seat. */}
      <WidgetDensityProvider value={tier}>
        {measured ? (
          <Suspense fallback={<WidgetSkeleton fill />}>
            <MinSkeletonBoundary>
              <Component
                userId={userId}
                role={role}
                domain={domain}
                firstName={firstName}
                initialData={initialData}
                size={size}
                dateRange={dateRange}
                scopeDomain={scopeDomain}
              />
            </MinSkeletonBoundary>
          </Suspense>
        ) : (
          <WidgetSkeleton fill />
        )}
      </WidgetDensityProvider>
    </div>
  );
}

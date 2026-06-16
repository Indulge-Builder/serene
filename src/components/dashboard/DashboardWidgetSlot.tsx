"use client";

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  WIDGET_MAP,
  WIDGET_HEIGHT_BY_SIZE,
  WIDGET_SIZE_LABELS,
  type WidgetSize,
  type WidgetColSpan,
} from "@/lib/constants/dashboard-widgets";
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
  /** Current size tier — widgets use this for their container height. */
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
  colSpan: WidgetColSpan;
  editMode: boolean;
  onRemove: (widgetId: string) => void;
  onResize: (widgetId: string, size: WidgetSize, colSpan: WidgetColSpan) => void;
  dragHandle?: React.ReactNode;
};

// Enforce minimum skeleton display time (V-08: never < 150ms)
function MinSkeletonBoundary({
  size,
  children,
}: {
  size: WidgetSize;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return <WidgetSkeleton size={size} />;
  return <>{children}</>;
}

const SIZE_ORDER: WidgetSize[] = ["sm", "md", "lg", "xl"];

// Compact popover for resizing height + width of a widget in edit mode
function ResizePopover({
  widgetId,
  size,
  colSpan,
  onResize,
}: {
  widgetId: string;
  size: WidgetSize;
  colSpan: WidgetColSpan;
  onResize: (widgetId: string, size: WidgetSize, colSpan: WidgetColSpan) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Resize widget"
        aria-expanded={open}
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "2px",
          height:         "24px",
          padding:        "0 6px",
          fontSize:       "var(--text-2xs)",
          fontWeight:     "var(--weight-medium)",
          color:          "var(--theme-text-secondary)",
          background:     open ? "var(--theme-accent-surface)" : "var(--theme-paper)",
          border:         `1px solid ${open ? "var(--theme-accent-muted)" : "var(--theme-paper-border)"}`,
          borderRadius:   "var(--radius-sm)",
          cursor:         "pointer",
          whiteSpace:     "nowrap",
          transition:     "background 150ms, border-color 150ms",
        }}
      >
        {WIDGET_SIZE_LABELS[size]}
        <ChevronDown
          size={10}
          strokeWidth={2}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position:     "absolute",
            top:          "calc(100% + 4px)",
            right:        0,
            zIndex:       "var(--z-dropdown)",
            background:   "var(--theme-paper)",
            border:       "1px solid var(--theme-paper-border)",
            borderRadius: "var(--radius-md)",
            boxShadow:    "var(--shadow-3)",
            padding:      "var(--space-2)",
            minWidth:     "148px",
          }}
        >
          {/* Height section */}
          <p
            style={{
              fontSize:      "var(--text-2xs)",
              fontWeight:    "var(--weight-medium)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color:         "var(--theme-text-tertiary)",
              margin:        "0 0 var(--space-1) var(--space-1)",
            }}
          >
            Height
          </p>
          {SIZE_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onResize(widgetId, s, colSpan);
                setOpen(false);
              }}
              style={{
                display:      "flex",
                alignItems:   "center",
                justifyContent: "space-between",
                width:        "100%",
                padding:      "var(--space-1) var(--space-2)",
                borderRadius: "var(--radius-sm)",
                border:       "none",
                background:   s === size ? "var(--theme-accent-surface)" : "transparent",
                color:        s === size ? "var(--theme-accent)" : "var(--theme-text-primary)",
                fontSize:     "var(--text-sm)",
                cursor:       "pointer",
                textAlign:    "left",
                transition:   "background 100ms",
              }}
            >
              <span>{WIDGET_SIZE_LABELS[s]}</span>
              <span
                style={{
                  fontSize: "var(--text-2xs)",
                  color: s === size ? "var(--theme-accent)" : "var(--theme-text-tertiary)",
                }}
              >
                {WIDGET_HEIGHT_BY_SIZE[s]}
              </span>
            </button>
          ))}

          {/* Divider */}
          <div
            style={{
              height:     "1px",
              background: "var(--theme-paper-border)",
              margin:     "var(--space-2) 0",
            }}
          />

          {/* Width section */}
          <p
            style={{
              fontSize:      "var(--text-2xs)",
              fontWeight:    "var(--weight-medium)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color:         "var(--theme-text-tertiary)",
              margin:        "0 0 var(--space-1) var(--space-1)",
            }}
          >
            Width
          </p>
          {([1, 2] as WidgetColSpan[]).map((span) => (
            <button
              key={span}
              type="button"
              onClick={() => {
                onResize(widgetId, size, span);
                setOpen(false);
              }}
              style={{
                display:      "flex",
                alignItems:   "center",
                width:        "100%",
                padding:      "var(--space-1) var(--space-2)",
                borderRadius: "var(--radius-sm)",
                border:       "none",
                background:   span === colSpan ? "var(--theme-accent-surface)" : "transparent",
                color:        span === colSpan ? "var(--theme-accent)" : "var(--theme-text-primary)",
                fontSize:     "var(--text-sm)",
                cursor:       "pointer",
                textAlign:    "left",
                transition:   "background 100ms",
              }}
            >
              {span === 1 ? "Half width" : "Full width"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardWidgetSlot({
  widgetId,
  size,
  colSpan,
  editMode,
  onRemove,
  onResize,
  dragHandle,
  userId,
  role,
  domain,
  firstName,
  initialData,
  dateRange,
  scopeDomain,
}: DashboardWidgetSlotProps) {
  const definition = WIDGET_MAP[widgetId];
  const Component = WIDGET_COMPONENTS[widgetId];

  if (!definition || !Component) return null;

  return (
    <div style={{ position: "relative" }}>
      {/* Edit mode overlay — dashed accent border */}
      {editMode && (
        <div
          style={{
            position:     "absolute",
            inset:        0,
            zIndex:       "var(--z-raised)",
            borderRadius: "var(--radius-lg)",
            border:       "2px dashed var(--theme-accent)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Edit mode controls — drag handle, resize, remove */}
      {editMode && (
        <div
          style={{
            position:   "absolute",
            top:        "var(--space-2)",
            right:      "var(--space-2)",
            zIndex:     "calc(var(--z-raised) + 1)",
            display:    "flex",
            gap:        "var(--space-1)",
            alignItems: "center",
          }}
        >
          <ResizePopover
            widgetId={widgetId}
            size={size}
            colSpan={colSpan}
            onResize={onResize}
          />
          {dragHandle}
          <button
            onClick={() => onRemove(widgetId)}
            aria-label={`Remove ${definition.label}`}
            style={{
              width:          "24px",
              height:         "24px",
              borderRadius:   "var(--radius-full)",
              border:         "1px solid var(--theme-paper-border)",
              background:     "var(--theme-paper)",
              color:          "var(--color-danger)",
              cursor:         "pointer",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       "14px",
              lineHeight:     1,
            }}
          >
            ×
          </button>
        </div>
      )}

      <Suspense fallback={<WidgetSkeleton size={size} />}>
        <MinSkeletonBoundary size={size}>
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
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Phone, UserPlus, ArrowRight, Copy, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAgentRecentActivityAction } from "@/lib/actions/dashboard";
import { CALL_OUTCOME_LABELS } from "@/lib/constants/call-outcomes";
import { LEAD_STATUS_LABELS } from "@/lib/constants/lead-statuses";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import type { DashboardAgentActivity } from "@/lib/types";
import type { WidgetProps } from "../DashboardWidgetSlot";
import type { CallOutcome, LeadStatus } from "@/lib/types/database";

// note_added always fires alongside call_logged — it adds no signal, skip it.
const SKIP_TYPES = new Set(["note_added"]);

type ActivityMeta = {
  icon: React.ElementType;
  color: string;
  label: (activity: DashboardAgentActivity) => string;
  sub: (activity: DashboardAgentActivity) => string | null;
};

const ACTIVITY_MAP: Record<string, ActivityMeta> = {
  call_logged: {
    icon: Phone,
    color: "var(--color-info-text)",
    label: (a) => a.lead_name ?? "Unknown lead",
    sub: (a) => {
      const outcome = a.details?.outcome as CallOutcome | undefined;
      return outcome
        ? (CALL_OUTCOME_LABELS[outcome] ?? outcome)
        : "Call logged";
    },
  },
  status_changed: {
    icon: ArrowRight,
    color: "var(--theme-accent)",
    label: (a) => a.lead_name ?? "Unknown lead",
    sub: (a) => {
      const from = a.details?.old_status as LeadStatus | undefined;
      const to = a.details?.new_status as LeadStatus | undefined;
      if (from && to) {
        return `${LEAD_STATUS_LABELS[from] ?? from} → ${LEAD_STATUS_LABELS[to] ?? to}`;
      }
      return "Status changed";
    },
  },
  lead_created: {
    icon: UserPlus,
    color: "var(--color-success-text)",
    label: (a) => a.lead_name ?? "New lead",
    sub: () => "Entered the system",
  },
  agent_assigned: {
    icon: User,
    color: "var(--theme-text-secondary)",
    label: (a) => a.lead_name ?? "Lead",
    sub: () => "Assigned to you",
  },
  duplicate_submission: {
    icon: Copy,
    color: "var(--color-warning-text)",
    label: (a) => a.lead_name ?? "Lead",
    sub: () => "Duplicate submission",
  },
};

const FALLBACK_META: ActivityMeta = {
  icon: ArrowRight,
  color: "var(--theme-text-tertiary)",
  label: (a) => a.lead_name ?? "Lead",
  sub: (a) => a.action_type.replace(/_/g, " "),
};

function formatRelativeTime(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

function ActivityItem({ activity }: { activity: DashboardAgentActivity }) {
  const meta = ACTIVITY_MAP[activity.action_type] ?? FALLBACK_META;
  const Icon = meta.icon;
  const label = meta.label(activity);
  const sub = meta.sub(activity);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-2) 0",
        borderBottom: "1px solid var(--theme-paper-border)",
      }}
    >
      {/* Icon */}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "var(--radius-full)",
          background: "var(--theme-paper-subtle)",
          flexShrink: 0,
          color: meta.color,
        }}
      >
        <Icon size={13} strokeWidth={1.5} />
      </span>

      {/* Label + sub */}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            color: "var(--theme-text-primary)",
            fontWeight: "var(--weight-medium)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            style={{
              display: "block",
              fontSize: "var(--text-xs)",
              color: "var(--theme-text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </span>
        )}
      </span>

      {/* Timestamp */}
      <span
        style={{
          fontSize: "var(--text-2xs)",
          color: "var(--theme-text-tertiary)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {formatRelativeTime(activity.created_at)}
      </span>
    </motion.div>
  );
}

const ACTIVITY_CAP = 25;
const ROW_HEIGHT = 48; // px — matches ActivityItem padding + content
const SCROLL_SPEED = 0.11; // px per frame (~9px/s at 60fps)
const FRAME_INTERVAL = 16; // ms (~60fps)

export function AgentActivityWidget({ userId, role, initialData, size = 'md' }: WidgetProps) {
  const rawSeed = initialData?.agent_activity ?? null;
  const seed = rawSeed
    ? rawSeed.filter((a) => !SKIP_TYPES.has(a.action_type))
    : null;
  const [activities, setActivities] = useState<DashboardAgentActivity[]>(
    seed ?? [],
  );
  const [loaded, setLoaded] = useState(seed !== null);
  const mountId = useId();
  const innerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0); // current translateY (negative = scrolled down)
  const pausedRef = useRef(false); // true while hovered
  const rafIdRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  // Only fetch on mount when no server-provided initialData
  useEffect(() => {
    if (seed !== null) return;
    let cancelled = false;
    getAgentRecentActivityAction(userId).then((result) => {
      if (!cancelled && result.data) {
        setActivities(
          result.data.filter((a) => !SKIP_TYPES.has(a.action_type)),
        );
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Auto-scroll ticker — transform-only, GPU-safe
  useEffect(() => {
    if (!loaded) return;

    const tick = () => {
      if (!pausedRef.current && innerRef.current) {
        const viewportHeight = viewportRef.current?.clientHeight ?? 220;
        const totalHeight = activities.length * ROW_HEIGHT;
        const maxScroll = Math.max(0, totalHeight - viewportHeight);

        if (maxScroll > 0) {
          offsetRef.current = offsetRef.current - SCROLL_SPEED;
          if (offsetRef.current < -maxScroll) offsetRef.current = 0; // wrap to top
          innerRef.current.style.transform = `translateY(${offsetRef.current}px)`;
        }
      }
      rafIdRef.current = window.setTimeout(tick, FRAME_INTERVAL);
    };

    rafIdRef.current = window.setTimeout(tick, FRAME_INTERVAL);
    return () => window.clearTimeout(rafIdRef.current);
  }, [loaded, activities.length]);

  // Realtime subscription — scoped by role (P-06 compliance)
  // admin/founder: no filter (all activities); agent: filter by actor_id
  // manager: filter by actor_id (domain-scoped initial load; Realtime limited to own actions for simplicity)
  useEffect(() => {
    const supabase = createClient();
    const channelName = `agent-activity:${userId}:${mountId}`;

    const isAdminOrFounder = role === 'admin' || role === 'founder';

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lead_activities",
          // P-06: admin/founder subscribe with no filter (all activity); agents filter to own actor_id
          ...(isAdminOrFounder ? {} : { filter: `actor_id=eq.${userId}` }),
        },
        (payload) => {
          const newRow = payload.new as {
            id: string;
            action_type: string;
            details: Record<string, unknown> | null;
            created_at: string;
            lead_id: string | null;
          };

          if (SKIP_TYPES.has(newRow.action_type)) return;

          // Reset to top so new item is immediately visible
          offsetRef.current = 0;
          if (innerRef.current)
            innerRef.current.style.transform = "translateY(0px)";

          setActivities((prev) => {
            const activity: DashboardAgentActivity = {
              id: newRow.id,
              action_type: newRow.action_type,
              details: newRow.details,
              created_at: newRow.created_at,
              lead_id: newRow.lead_id,
              lead_name: null,
            };
            return [activity, ...prev].slice(0, ACTIVITY_CAP);
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, mountId]);

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--theme-paper-border)",
        background: "var(--theme-paper)",
        boxShadow: "var(--shadow-1)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        height: WIDGET_HEIGHT_BY_SIZE[size],
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <p
          style={{
            fontSize: "var(--text-md)",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            color: "var(--theme-text-primary)",
            margin: 0,
          }}
        >
          {!loaded ? (
            "Loading…"
          ) : activities.length === 0 ? (
            "No activity yet."
          ) : (
            <>
              Live Lead Activity<span className="page-title-dot">.</span>
            </>
          )}
        </p>
      </div>

      {/* Ticker viewport — flex-fills remaining space, overflow hidden, fades at edges */}
      <div
        ref={viewportRef}
        style={{
          position: "relative",
          flex: 1,
          minHeight: "160px",
          overflow: "hidden",
        }}
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
      >
        {/* Fade masks — top and bottom */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background: `linear-gradient(to bottom,
            var(--theme-paper) 0%,
            transparent 18%,
            transparent 82%,
            var(--theme-paper) 100%
          )`,
            pointerEvents: "none",
          }}
        />

        {/* Scrolling inner list */}
        <div ref={innerRef} style={{ willChange: "transform" }}>
          {loaded && activities.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: "var(--text-sm)",
                color: "var(--theme-text-tertiary)",
                textAlign: "center",
                padding: "var(--space-6) 0",
                margin: 0,
              }}
            >
              Nothing logged yet.
            </p>
          ) : (
            activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

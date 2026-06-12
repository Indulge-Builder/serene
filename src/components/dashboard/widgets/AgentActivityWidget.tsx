"use client";

import { useEffect, useId, useRef } from "react";
import { m as motion } from "framer-motion";
import { Phone, UserPlus, ArrowRight, Copy, User, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAgentRecentActivityAction } from "@/lib/actions/dashboard";
import { CALL_OUTCOME_LABELS } from "@/lib/constants/call-outcomes";
import { LEAD_STATUS_LABELS } from "@/lib/constants/lead-statuses";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import { formatRelativeTime } from "@/lib/utils/dates";
import type { DashboardAgentActivity } from "@/lib/types";
import type { WidgetProps } from "../DashboardWidgetSlot";
import type { CallOutcome, LeadStatus } from "@/lib/types/database";
import { useWidgetData } from "@/hooks/useWidgetData";

// A call note writes call_logged + note_added as a pair — the paired note adds
// no signal, so it is dropped. STANDALONE notes (dossier "Add note") have no
// twin call_logged within the window and stay in the feed (2026-06-12 enrich).
const PAIRED_NOTE_WINDOW_MS = 5000;

function isPairedNote(
  activity: DashboardAgentActivity,
  pool: DashboardAgentActivity[],
): boolean {
  if (activity.action_type !== "note_added") return false;
  const t = new Date(activity.created_at).getTime();
  return pool.some(
    (b) =>
      b.action_type === "call_logged" &&
      b.lead_id != null &&
      b.lead_id === activity.lead_id &&
      Math.abs(new Date(b.created_at).getTime() - t) < PAIRED_NOTE_WINDOW_MS,
  );
}

function enrichFeed(rows: DashboardAgentActivity[]): DashboardAgentActivity[] {
  return rows.filter((a) => !isPairedNote(a, rows));
}

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
  note_added: {
    icon: FileText,
    color: "var(--theme-text-secondary)",
    label: (a) => a.lead_name ?? "Lead",
    sub: (a) => {
      const content = a.details?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        const text = content.trim();
        return text.length > 60 ? `${text.slice(0, 59)}…` : text;
      }
      return "Note added";
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
const SCROLL_SPEED = 0.11; // px per frame (~7px/s at 60fps) — gentle drift

export function AgentActivityWidget({ userId, role, initialData, size = 'lg' }: WidgetProps) {
  const rawSeed = initialData?.agent_activity ?? null;
  const seed = rawSeed ? enrichFeed(rawSeed) : null;
  const { data, loaded, setData: setActivities } = useWidgetData<DashboardAgentActivity[]>({
    seed,
    fetcher: async () => {
      const result = await getAgentRecentActivityAction(userId);
      return {
        data: result.data ? enrichFeed(result.data) : null,
      };
    },
    deps: [userId],
  });
  const activities = data ?? [];
  const mountId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0); // fractional auto-scroll position
  const pausedRef = useRef(false); // true while hovered / touch-scrolling
  const rafRef = useRef<number>(0);
  const touchResumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  // Auto-advance ticker over a NATIVELY SCROLLABLE viewport — the pointer can
  // scroll the list directly (hover pauses the drift; onScroll keeps the
  // ticker position in sync so resuming never jumps). Pauses on hidden tab.
  useEffect(() => {
    if (!loaded) return;

    const tick = () => {
      const vp = viewportRef.current;
      if (!pausedRef.current && vp) {
        const maxScroll = vp.scrollHeight - vp.clientHeight;
        if (maxScroll > 0) {
          let next = scrollPosRef.current + SCROLL_SPEED;
          if (next >= maxScroll) next = 0; // wrap to top
          scrollPosRef.current = next;
          vp.scrollTop = next;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // Pause loop when tab is hidden; resume when visible — prevents CPU burn on long shifts
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loaded, activities.length]);

  useEffect(() => {
    return () => {
      if (touchResumeRef.current) clearTimeout(touchResumeRef.current);
    };
  }, []);

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

          const activity: DashboardAgentActivity = {
            id: newRow.id,
            action_type: newRow.action_type,
            details: newRow.details,
            created_at: newRow.created_at,
            lead_id: newRow.lead_id,
            lead_name: null,
          };

          setActivities((prev) => {
            // Drop the note half of a call-note pair (same rule as the seed filter)
            if (isPairedNote(activity, prev ?? [])) return prev;
            return [activity, ...(prev ?? [])].slice(0, ACTIVITY_CAP);
          });

          // Surface the new item — slide-in entrance plays at the top
          scrollPosRef.current = 0;
          if (viewportRef.current) viewportRef.current.scrollTop = 0;
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
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
        <span
          title="Always shows live data — not affected by date filter"
          style={{
            fontSize:     "var(--text-2xs)",
            fontWeight:   "var(--weight-medium)",
            color:        "var(--color-success-text)",
            background:   "var(--color-success-light)",
            border:       "1px solid var(--color-success-text)",
            borderRadius: "var(--radius-full)",
            padding:      "1px 6px",
            letterSpacing: "0.03em",
            flexShrink:   0,
          }}
        >
          Live
        </span>
      </div>

      {/* Feed — natively scrollable; gentle auto-drift when idle, fades at edges */}
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: "160px",
        }}
      >
        <div
          ref={viewportRef}
          onMouseEnter={() => {
            pausedRef.current = true;
          }}
          onMouseLeave={() => {
            pausedRef.current = false;
          }}
          onTouchStart={() => {
            pausedRef.current = true;
            if (touchResumeRef.current) clearTimeout(touchResumeRef.current);
          }}
          onTouchEnd={() => {
            if (touchResumeRef.current) clearTimeout(touchResumeRef.current);
            touchResumeRef.current = setTimeout(() => {
              pausedRef.current = false;
            }, 1500);
          }}
          onScroll={(e) => {
            // Keep the ticker in sync with manual scrolling — resuming the
            // drift continues from wherever the pointer left the list.
            scrollPosRef.current = e.currentTarget.scrollTop;
          }}
          style={{
            position: "absolute",
            inset: 0,
            overflowY: "auto",
            scrollbarWidth: "none",
          }}
        >
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

        {/* Fade masks — top and bottom, fixed over the scrolling viewport */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background: `linear-gradient(to bottom,
            var(--theme-paper) 0%,
            transparent 12%,
            transparent 88%,
            var(--theme-paper) 100%
          )`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

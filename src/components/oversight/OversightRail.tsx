"use client";

// THE live activity rail for /oversight — ONE rail body, two thin wrappers
// (R-01). Seeds from a bounded task_events read (passed in), then subscribes to
// Supabase Realtime INSERTs on task_events and prepends them. This is what
// proves the oversight stream is task_events, not a remarks feed: a status
// change made with NO remark still emits a status_changed event and lands here.
//
// Realtime contract (P-06 / Q-14): channel name carries a useId() mount nonce
// (Strict-Mode double-mount safety), the subscription is FILTERED (domain or
// subject_id — never the whole table), teardown is supabase.removeChannel().
// The session client's manager+ SELECT RLS double-enforces; the page already
// clamped which domain/agent renders, so a manager's rail only ever filters
// their own team.

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils/dates";
import {
  ListChecks,
  RefreshCw,
  UserCog,
  MessageSquare,
  AlarmClock,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppDomain } from "@/lib/types/database";
import type { TaskEventRow, TaskEventType } from "@/lib/types/oversight";

const EVENT_META: Record<TaskEventType, { icon: LucideIcon; verb: string }> = {
  created: { icon: ListChecks, verb: "created" },
  status_changed: { icon: RefreshCw, verb: "moved" },
  reassigned: { icon: UserCog, verb: "reassigned" },
  remark_added: { icon: MessageSquare, verb: "noted on" },
  overdue: { icon: AlarmClock, verb: "overdue" },
};

const MAX_RAIL_ROWS = 40;

// ── Shared rail body ─────────────────────────────────────────────────────────
function OversightRail({
  initialEvents,
  channelKey,
  filter,
}: {
  initialEvents: TaskEventRow[];
  /** Stable base for the channel name (a nonce is appended). */
  channelKey: string;
  /** Realtime postgres_changes filter, e.g. `domain=eq.shop`. */
  filter: string;
}) {
  const mountId = useId();
  const [events, setEvents] = useState<TaskEventRow[]>(initialEvents);

  useEffect(() => {
    // Re-seed when the underlying scope changes (domain/agent switch).
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`oversight-${channelKey}-${mountId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_events",
          filter,
        },
        (payload) => {
          const row = payload.new as TaskEventRow;
          setEvents((prev) => {
            if (prev.some((e) => e.id === row.id)) return prev; // de-dupe
            return [row, ...prev].slice(0, MAX_RAIL_ROWS);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelKey, filter, mountId]);

  return (
    <aside
      className="rounded-lg border bg-(--theme-paper) shadow-(--shadow-1)"
      style={{
        borderColor: "var(--theme-paper-border)",
        padding: "var(--space-5)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity
          aria-hidden="true"
          style={{ width: 15, height: 15, strokeWidth: 1.5, color: "var(--theme-accent)" }}
        />
        <span className="label-micro" style={{ color: "var(--theme-text-secondary)" }}>
          Live activity
        </span>
      </div>

      {events.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: "var(--text-sm)",
            color: "var(--theme-text-tertiary)",
            margin: 0,
          }}
        >
          Quiet for now.
        </p>
      ) : (
        <ul className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          {events.map((ev) => (
            <RailRow key={ev.id} event={ev} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function RailRow({ event }: { event: TaskEventRow }) {
  const meta = EVENT_META[event.event_type] ?? EVENT_META.status_changed;
  const Icon = meta.icon;
  const detail = describeMeta(event);

  return (
    <li className="flex items-start" style={{ gap: "var(--space-3)" }}>
      <span
        aria-hidden="true"
        className="flex items-center justify-center shrink-0"
        style={{
          width: 26,
          height: 26,
          borderRadius: "var(--radius-md)",
          background: "var(--theme-paper-subtle)",
          color:
            event.event_type === "overdue"
              ? "var(--color-warning)"
              : "var(--theme-text-secondary)",
        }}
      >
        <Icon style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-xs)",
            color: "var(--theme-text-primary)",
            lineHeight: "var(--leading-snug)",
          }}
        >
          <span style={{ fontWeight: "var(--weight-medium)" }}>{meta.verb}</span>{" "}
          <span style={{ color: "var(--theme-text-secondary)" }}>
            {event.task_title ?? "a task"}
          </span>
          {detail && (
            <span style={{ color: "var(--theme-text-tertiary)" }}> · {detail}</span>
          )}
        </span>
        <span
          style={{
            fontSize: "var(--text-2xs)",
            color: "var(--theme-text-tertiary)",
          }}
        >
          {formatRelativeTime(event.created_at)}
        </span>
      </span>
    </li>
  );
}

// Render the event-specific meta as a short suffix (never PII — task_events
// stores no names/phones; from/to here are statuses or domain-agnostic ids).
function describeMeta(event: TaskEventRow): string | null {
  const m = event.meta ?? {};
  if (event.event_type === "status_changed") {
    const to = typeof m.to === "string" ? m.to.replace(/_/g, " ") : null;
    return to ? `→ ${to}` : null;
  }
  if (event.event_type === "reassigned") return "reassigned";
  return null;
}

// ── Tier 2 wrapper — team rail (filter on domain) ───────────────────────────
export function OversightTeamRail({
  domain,
  initialEvents,
}: {
  domain: AppDomain;
  initialEvents: TaskEventRow[];
}) {
  return (
    <OversightRail
      initialEvents={initialEvents}
      channelKey={`team-${domain}`}
      filter={`domain=eq.${domain}`}
    />
  );
}

// ── Tier 3 wrapper — agent rail (filter on subject_id) ──────────────────────
export function OversightAgentRail({
  agentId,
  initialEvents,
}: {
  agentId: string;
  initialEvents: TaskEventRow[];
}) {
  return (
    <OversightRail
      initialEvents={initialEvents}
      channelKey={`agent-${agentId}`}
      filter={`subject_id=eq.${agentId}`}
    />
  );
}

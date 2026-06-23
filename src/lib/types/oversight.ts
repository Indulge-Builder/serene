// Oversight (/oversight) row types — hand-declared until
// `supabase gen types typescript` is re-run after migration
// 20260624000144_oversight_task_events is applied (the generated Database type
// does not know the task_events table, the task_event_type enum, or the three
// oversight RPCs yet). Shapes mirror the migration exactly. Types only — no
// runtime values. The vocabulary (which event_types exist) lives alongside the
// emit helper in `src/lib/services/task-events.ts`.

import type { AppDomain, UserRole } from "@/lib/types/database";

/** task_events.event_type enum — mirrors the migration's task_event_type. */
export type TaskEventType =
  | "created"
  | "status_changed"
  | "reassigned"
  | "remark_added"
  | "overdue";

/**
 * task_events row (the append-only stream backing the /oversight live rails).
 * `domain` and `subject_id` are point-in-time snapshots at emit time — a
 * cross-team reassignment legitimately makes a task's events span domains
 * (see docs/oversight.md §4c). `task_title` is denormalised so a rail renders
 * without joining `tasks`.
 */
export type TaskEventRow = {
  id: string;
  task_id: string;
  domain: AppDomain;
  actor_id: string | null;
  subject_id: string | null;
  event_type: TaskEventType;
  task_title: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

/** Tier 1 — one row per app_domain that owns an active-agent roster. */
export type TeamTaskOverviewRow = {
  domain: AppDomain;
  agentCount: number;
  openCount: number;
  overdueCount: number;
  completedCount: number;
  inReviewCount: number;
  /** Overlaid in the service from listLivePresence() — agents present now. */
  presentAgentCount: number;
};

/** Tier 2 — one row per active agent in the team, with their task tallies. */
export type TeamAgentBreakdownRow = {
  agentId: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  openCount: number;
  overdueCount: number;
  completedCount: number;
  inReviewCount: number;
  /** Overlaid in the service from listLivePresence() — is this agent online now. */
  isPresent: boolean;
};

/** Tier 3 — one task row in the agent's oversight list. */
export type AgentOversightTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  taskCategory: string;
  module: string;
  groupId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  overdueAt: string | null;
  createdAt: string;
  groupTitle: string | null;
  /** Present iff this is a lead follow-up (task_gia_meta row — meta-presence). */
  leadId: string | null;
  leadFirstName: string | null;
  leadLastName: string | null;
  leadSlug: string | null;
};

/** Tier 3 metric tallies, derived in the service mapper from the task rows. */
export type AgentOversightMetrics = {
  openCount: number;
  inReviewCount: number;
  overdueCount: number;
  completedCount: number;
  totalCount: number;
};

/** The Tier 3 envelope — one RPC read → task list + derived counts. */
export type AgentOversightResult = {
  tasks: AgentOversightTask[];
  metrics: AgentOversightMetrics;
};

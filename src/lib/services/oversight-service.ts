import "server-only";

// Oversight (/oversight) reads — the three tier aggregations. SERVER ONLY.
//
// Each tier is ONE aggregation query (the sign-off "one aggregation query per
// tier"). All three RPCs are SECURITY DEFINER scope-param functions with EXECUTE
// REVOKEd from authenticated (Q-13 Tier-2, migration 20260624000144) → called
// via the ADMIN client with SESSION-DERIVED args. The CALLER (action) is the
// trust boundary and clamps a manager to their own domain BEFORE calling here;
// the RPC re-applies the clamp in SQL as defence in depth.
//
// These readers take an explicit caller {role, domain} + target — they are NOT
// auth.uid()-scoped. That is the whole point: oversight reads ANOTHER user's
// load, which auth.uid()-bound readers (getPersonalTasks /
// get_group_task_summaries) silently cannot do (they would return the caller's
// own rows / empty). Never back oversight with a self-scoped reader.
//
// COUNT(*) returns bigint — every count is Number()-coerced here (Q-09); a raw
// BigInt would break JSON serialisation to the client.
//
// Interim `as any` on `.rpc` — the generated Database type does not know the
// three oversight RPCs until `supabase gen types` is re-run after the migration
// (same pattern as the dashboard/performance scope-param RPC wrappers).

import { createAdminClient } from "@/lib/supabase/admin";
import { listLivePresence } from "@/lib/services/usage-service";
import { mapRows } from "@/lib/utils/rows";
import type { AppDomain, UserRole } from "@/lib/types/database";
import type {
  TeamTaskOverviewRow,
  TeamAgentBreakdownRow,
  AgentOversightResult,
  AgentOversightTask,
  AgentOversightMetrics,
} from "@/lib/types/oversight";

// ── Raw RPC row shapes (untyped — crossed via mapRows, Q-18) ────────────────
type OverviewRpcRow = {
  domain: AppDomain;
  agent_count: number | string;
  open_count: number | string;
  overdue_count: number | string;
  completed_count: number | string;
  in_review_count: number | string;
};
type BreakdownRpcRow = {
  agent_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  open_count: number | string;
  overdue_count: number | string;
  completed_count: number | string;
  in_review_count: number | string;
};
type AgentTaskRpcRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  task_category: string;
  module: string;
  group_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  overdue_at: string | null;
  created_at: string;
  group_title: string | null;
  lead_id: string | null;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_slug: string | null;
};

/** Set of userIds whose role is agent and who have a live presence heartbeat. */
async function presentAgentIds(): Promise<Set<string>> {
  const live = await listLivePresence();
  return new Set(live.filter((p) => p.role === "agent").map((p) => p.userId));
}

// ─────────────────────────────────────────────
// Tier 1 — getTeamTaskOverview(caller) → one row per rostered app_domain.
// `presentAgentCount` overlays listLivePresence() (the only live presence
// reader, reused). Manager scope is clamped in the ACTION before this runs;
// p_domain is forwarded so the RPC's own clamp matches.
// ─────────────────────────────────────────────
export async function getTeamTaskOverview(caller: {
  role: UserRole;
  domain: AppDomain;
}): Promise<TeamTaskOverviewRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("get_team_task_overview", {
    p_role: caller.role,
    p_domain: caller.domain,
  });

  if (error || !data) {
    if (error) console.warn("[oversight-service] team overview failed", error);
    return [];
  }

  // present-agent count per domain (agents only) — the Tier-1 live pulse.
  const live = await listLivePresence();
  const byDomain = new Map<string, number>();
  for (const p of live) {
    if (p.role !== "agent") continue;
    byDomain.set(p.domain, (byDomain.get(p.domain) ?? 0) + 1);
  }

  return mapRows<OverviewRpcRow, TeamTaskOverviewRow>(data, (r) => ({
    domain: r.domain,
    agentCount: Number(r.agent_count),
    openCount: Number(r.open_count),
    overdueCount: Number(r.overdue_count),
    completedCount: Number(r.completed_count),
    inReviewCount: Number(r.in_review_count),
    presentAgentCount: byDomain.get(r.domain) ?? 0,
  }));
}

// ─────────────────────────────────────────────
// Tier 2 — getTeamAgentBreakdown(caller, targetDomain) → per-agent rows.
// The action has ALREADY rejected a manager requesting another team; here the
// caller's own domain is passed as p_caller_domain and the RPC force-clamps a
// manager to it regardless of targetDomain (third layer).
// ─────────────────────────────────────────────
export async function getTeamAgentBreakdown(
  caller: { role: UserRole; domain: AppDomain },
  targetDomain: AppDomain,
): Promise<TeamAgentBreakdownRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("get_team_agent_breakdown", {
    p_role: caller.role,
    p_caller_domain: caller.domain,
    p_domain: targetDomain,
  });

  if (error || !data) {
    if (error) console.warn("[oversight-service] agent breakdown failed", error);
    return [];
  }

  const present = await presentAgentIds();

  return mapRows<BreakdownRpcRow, TeamAgentBreakdownRow>(data, (r) => ({
    agentId: r.agent_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    role: r.role as UserRole,
    openCount: Number(r.open_count),
    overdueCount: Number(r.overdue_count),
    completedCount: Number(r.completed_count),
    inReviewCount: Number(r.in_review_count),
    isPresent: present.has(r.agent_id),
  }));
}

// ─────────────────────────────────────────────
// Tier 3 — getAgentTasksOversight(caller, agentId) → task list + DERIVED
// metric counts (one RPC read; the mapper tallies the counts so there is no
// second aggregation call). The RPC force-clamps a manager to an agent in their
// own domain (out-of-domain → zero rows); the action rejects first.
// ─────────────────────────────────────────────
export async function getAgentTasksOversight(
  caller: { role: UserRole; domain: AppDomain },
  agentId: string,
): Promise<AgentOversightResult> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc(
    "get_agent_tasks_oversight",
    {
      p_agent: agentId,
      p_role: caller.role,
      p_caller_domain: caller.domain,
    },
  );

  if (error || !data) {
    if (error) console.warn("[oversight-service] agent tasks failed", error);
    return { tasks: [], metrics: emptyMetrics() };
  }

  const tasks = mapRows<AgentTaskRpcRow, AgentOversightTask>(data, (r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    taskCategory: r.task_category,
    module: r.module,
    groupId: r.group_id,
    dueAt: r.due_at,
    completedAt: r.completed_at,
    overdueAt: r.overdue_at,
    createdAt: r.created_at,
    groupTitle: r.group_title,
    leadId: r.lead_id,
    leadFirstName: r.lead_first_name,
    leadLastName: r.lead_last_name,
    leadSlug: r.lead_slug,
  }));

  return { tasks, metrics: deriveMetrics(tasks) };
}

// ── Metric tallies derived from the Tier-3 task rows (no second query) ──────
const OPEN_STATUSES = ["to_do", "in_progress", "in_review"];
const CLOSED_STATUSES = ["completed", "cancelled", "error"];

function emptyMetrics(): AgentOversightMetrics {
  return {
    openCount: 0,
    inReviewCount: 0,
    overdueCount: 0,
    completedCount: 0,
    totalCount: 0,
  };
}

function deriveMetrics(tasks: AgentOversightTask[]): AgentOversightMetrics {
  let openCount = 0;
  let inReviewCount = 0;
  let overdueCount = 0;
  let completedCount = 0;
  for (const t of tasks) {
    if (OPEN_STATUSES.includes(t.status)) openCount += 1;
    if (t.status === "in_review") inReviewCount += 1;
    if (t.status === "completed") completedCount += 1;
    if (t.overdueAt && !CLOSED_STATUSES.includes(t.status)) overdueCount += 1;
  }
  return {
    openCount,
    inReviewCount,
    overdueCount,
    completedCount,
    totalCount: tasks.length,
  };
}

// ─────────────────────────────────────────────
// Live rail seeds — bounded task_events reads (newest-first). Display rows for
// the rail; the client subscribes to Realtime INSERTs from there. manager+ SELECT
// RLS double-enforces; the action already clamped which domain/agent is rendered.
// Interim `as any` on `.from` (task_events not in generated types yet).
// ─────────────────────────────────────────────
import type { TaskEventRow } from "@/lib/types/oversight";

const RAIL_SEED_LIMIT = 30;

export async function getTeamEvents(
  domain: AppDomain,
  limit = RAIL_SEED_LIMIT,
): Promise<TaskEventRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("task_events")
    .select("*")
    .eq("domain", domain)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as TaskEventRow[];
}

export async function getAgentEvents(
  agentId: string,
  limit = RAIL_SEED_LIMIT,
): Promise<TaskEventRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("task_events")
    .select("*")
    .eq("subject_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as TaskEventRow[];
}

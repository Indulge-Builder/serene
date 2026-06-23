"use server";

// Oversight (/oversight) actions — the SERVER-SIDE SCOPE CLAMP (the security
// spine). Every action begins with requireProfile(['manager','admin','founder'])
// (A-18). Then, BEFORE calling the service/RPC, a MANAGER is clamped to their
// own domain: a manager requesting another team's domain — or an agent outside
// their domain — is DENIED here (formErrors.unauthorized), not merely served
// their own data.
//
// Why the clamp must live here (not only in RLS): the manager `tasks` SELECT
// RLS policy is ROLE-ONLY — it has NO domain predicate, so RLS lets a manager
// read every team's tasks. Oversight isolation is therefore the action's job
// (+ the RPC's SQL re-clamp as the third layer). See docs/oversight.md §6.

import { requireProfile } from "@/lib/actions/_auth";
import { formErrors } from "@/lib/validations/form-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAppDomain } from "@/lib/constants/domains";
import {
  getTeamTaskOverview,
  getTeamAgentBreakdown,
  getAgentTasksOversight,
  getTeamEvents,
  getAgentEvents,
} from "@/lib/services/oversight-service";
import type { ActionResult } from "@/lib/types/index";
import type {
  TeamTaskOverviewRow,
  TeamAgentBreakdownRow,
  AgentOversightResult,
  TaskEventRow,
} from "@/lib/types/oversight";
import type { AppDomain } from "@/lib/types/database";

// Resolve an agent's domain (one read) so a manager request can be validated
// against their own domain. Returns null when the agent does not exist.
async function agentDomain(agentId: string): Promise<AppDomain | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("domain")
    .eq("id", agentId)
    .single();
  return (data?.domain as AppDomain | undefined) ?? null;
}

// ── Tier 1 — team overview (founder/admin land here; managers never reach it) ─
export async function getTeamTaskOverviewAction(): Promise<
  ActionResult<TeamTaskOverviewRow[]>
> {
  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // A manager has no Tier 1 — the service/RPC would clamp to their one domain,
  // but Tier 1 is a founder/admin surface; the page redirects managers to their
  // team. The action stays available (returns their single-domain row) so a
  // mis-render can never leak another team.
  const rows = await getTeamTaskOverview({
    role: caller.role,
    domain: caller.domain,
  });
  return { data: rows, error: null };
}

// ── Tier 2 — team agent breakdown (manager clamped to own domain) ────────────
export async function getTeamAgentBreakdownAction(
  domain: string,
): Promise<ActionResult<TeamAgentBreakdownRow[]>> {
  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  if (!isAppDomain(domain)) return { data: null, error: formErrors.generic };

  // MANAGER CLAMP — reject another team outright (not merely serve own).
  if (caller.role === "manager" && domain !== caller.domain) {
    return { data: null, error: formErrors.unauthorized };
  }

  const rows = await getTeamAgentBreakdown(
    { role: caller.role, domain: caller.domain },
    domain,
  );
  return { data: rows, error: null };
}

// ── Tier 3 — agent task drill (manager clamped to own-domain agents) ─────────
export async function getAgentTasksOversightAction(
  agentId: string,
): Promise<ActionResult<AgentOversightResult>> {
  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // MANAGER CLAMP — an agent outside the manager's domain is denied here.
  if (caller.role === "manager") {
    const dom = await agentDomain(agentId);
    if (dom === null) return { data: null, error: formErrors.generic };
    if (dom !== caller.domain) {
      return { data: null, error: formErrors.unauthorized };
    }
  }

  const result = await getAgentTasksOversight(
    { role: caller.role, domain: caller.domain },
    agentId,
  );
  return { data: result, error: null };
}

// ── Live rail seeds (client subscribes to Realtime from there) ───────────────
export async function getTeamEventsAction(
  domain: string,
): Promise<ActionResult<TaskEventRow[]>> {
  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  if (!isAppDomain(domain)) return { data: null, error: formErrors.generic };
  if (caller.role === "manager" && domain !== caller.domain) {
    return { data: null, error: formErrors.unauthorized };
  }

  const rows = await getTeamEvents(domain);
  return { data: rows, error: null };
}

export async function getAgentEventsAction(
  agentId: string,
): Promise<ActionResult<TaskEventRow[]>> {
  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  if (caller.role === "manager") {
    const dom = await agentDomain(agentId);
    if (dom === null) return { data: null, error: formErrors.generic };
    if (dom !== caller.domain) {
      return { data: null, error: formErrors.unauthorized };
    }
  }

  const rows = await getAgentEvents(agentId);
  return { data: rows, error: null };
}

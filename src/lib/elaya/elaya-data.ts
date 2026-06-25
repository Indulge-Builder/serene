// Elaya data-access layer — THE single chokepoint every Elaya tool fetches through.
// SERVER ONLY.
//
// THE PARITY RULE (Phase 1 — docs/architecture/elaya-jarvis-architecture.md):
//   Every read an Elaya tool performs goes through a function HERE. Each one:
//     1. takes the verified ElayaPrincipal (identity is NEVER channel- or model-derived),
//     2. uses the ADMIN client (works in the sessionless WhatsApp webhook AND in-app),
//     3. scopes by the principal's role/userId/domain IN CODE (never auth.uid()),
//   so a tool works IDENTICALLY on both channels by construction. A tool must call ONLY
//   this module — never a general *-service.ts function directly — so it is physically
//   impossible to (re)introduce a login-session dependency that would blank on WhatsApp.
//
//   The per-resource access GATE (canAccessLead / canMutateTask) stays in the tool layer
//   as the trust boundary (Q-13) — this module fetches scoped data; the tool re-checks
//   the specific resource before a write. PII masking stays at the executeTool seam.
//
// Why admin client is correct here (not "less secure"): identity is the verified principal
// (phone→profile or session→profile, both verified upstream), and scoping is enforced in
// code. RLS/auth.uid() cannot be used in the sessionless context, so the access decision
// MUST live in code — exactly the searchLeadsForElaya / getGiaTasksForUser precedent.
//
// Adding a new Elaya read: add a function here that takes ElayaPrincipal + filter values,
// reuses an existing principal-first service (or a *ForElaya admin twin), and returns a
// shaped result. The tool calls it. Never let a tool reach past this module.

import type { ElayaPrincipal } from '@/lib/elaya/principal';
import type { ElayaChannel } from '@/lib/types/elaya';
import type { LeadStatus, AppDomain, CampaignMetrics } from '@/lib/types/database';

import {
  searchLeadsForElaya,
  getLeadByRefForElaya,
  getLeadNotesFullForElaya,
  findDomainLeadOwners,
  type LeadsResult,
  type LeadWithAssignee,
  type LeadNoteWithAuthor,
} from '@/lib/services/leads-service';
import {
  getGoingColdLeads,
  getEscalatedLeads,
  getOverdueGiaTasks,
  type EscalatedLeadRow,
  type OverdueTaskEscalationRow,
} from '@/lib/services/sla-service';
import { getDealsByRoleForElaya, type DealsResult } from '@/lib/services/deals-service';
import { getCampaignMetrics } from '@/lib/services/leads-service';
import { getBudgetSummary, type BudgetCampaignRow } from '@/lib/services/ad-spend-service';
import { GIA_DOMAINS } from '@/lib/constants/domains';
import {
  getGiaTasksForUser,
  getPersonalTasks,
  getGroupTasksForUser,
  type GiaTask,
  type PersonalTasksResult,
  type TaskGroupRow,
} from '@/lib/services/tasks-service';
import {
  getAgentTodayPulseForUser,
  getAgentRosterPerformanceForElaya,
  getDomainHealthMetrics,
  getPeriodDateRange,
  type AgentTodayPulse,
} from '@/lib/services/performance-service';
import type { AgentRosterRow, DomainHealthCard } from '@/lib/types/index';
import {
  getCasesForLead,
  getHooksForCategories,
  getHelpdeskLibrary,
  type ServiceCase,
  type ConversationHook,
} from '@/lib/services/intelligence-service';
import { createAdminClient } from '@/lib/supabase/admin';
import type { DealFilters } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────

/** Scoped lead search — agent: own; manager: domain; admin/founder: all. Already
 *  admin-client + principal-scoped (searchLeadsForElaya), so both channels work. */
export function searchLeads(
  principal: ElayaPrincipal,
  opts: { search: string | null; statuses: LeadStatus[] | null; page: number; pageSize: number },
): Promise<LeadsResult> {
  return searchLeadsForElaya(principal.role, principal.userId, principal.domain, opts);
}

/** Domain-scoped owner hint for an agent whose own-scoped search came back empty —
 *  name + owner only (no slug/id/phone). Read-only; never widens access. */
export function findOwnersInDomain(
  principal: ElayaPrincipal,
  search: string,
): Promise<{ name: string; owner: string }[]> {
  return findDomainLeadOwners(principal.domain, search);
}

/** One lead by UUID-or-slug ref (admin client). Caller runs canAccessLead after. */
export function getLeadByRef(ref: string): Promise<LeadWithAssignee | null> {
  return getLeadByRefForElaya(ref);
}

/** Recent notes for an already-access-checked lead. */
export function getLeadNotes(leadId: string): Promise<LeadNoteWithAuthor[]> {
  return getLeadNotesFullForElaya(leadId);
}

/** Going-cold leads — agent: own; manager: domain; admin/founder: all domains.
 *  getGoingColdLeads is admin-client + explicit scope, so both channels work. */
export function getColdLeads(principal: ElayaPrincipal) {
  const scope =
    principal.role === 'agent'
      ? { assignedTo: principal.userId }
      : principal.role === 'manager'
        ? { domain: principal.domain }
        : {}; // admin / founder — all domains
  return getGoingColdLeads(scope);
}

// ─────────────────────────────────────────────
// Deals
// ─────────────────────────────────────────────

/** Closed deals — agent: own; manager: domain; admin/founder: all. Admin-client
 *  twin (getDealsByRoleForElaya), so both channels work. */
export function searchDeals(
  principal: ElayaPrincipal,
  filters: DealFilters,
): Promise<DealsResult> {
  return getDealsByRoleForElaya(principal.role, principal.userId, principal.domain, filters);
}

// ─────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────

/** Gia lead-follow-up tasks — admin client + explicit params, both channels. */
export function getGiaTasks(principal: ElayaPrincipal): Promise<GiaTask[]> {
  return getGiaTasksForUser(principal.userId, principal.role, principal.domain);
}

/** Personal to-dos — get_personal_tasks scopes purely on p_user_id; inject the admin
 *  client so it works in the sessionless context too. Both channels. */
export function getPersonalTasksFor(
  principal: ElayaPrincipal,
  limit = 20,
): Promise<PersonalTasksResult> {
  return getPersonalTasks(principal.userId, { limit }, createAdminClient());
}

/** Group/team workspaces — get_group_task_summaries_for_user(p_user_id) is the explicit-
 *  param admin twin of the auth.uid()-scoped get_group_task_summaries, so this works on
 *  WhatsApp now (previously WhatsApp got an empty list / "open the app"). Both channels. */
export function getGroupTasksFor(principal: ElayaPrincipal): Promise<TaskGroupRow[]> {
  return getGroupTasksForUser(principal.userId);
}

// ─────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────

/** Agent's own pulse — explicit-param admin twin (get_agent_today_pulse_for_user).
 *  Both channels. */
export function getAgentPulse(
  principal: ElayaPrincipal,
  period: 'today' | 'this_week' | 'this_month' | 'last_month',
): Promise<AgentTodayPulse> {
  return getAgentTodayPulseForUser(principal.userId, period);
}

/** Per-agent roster for a manager+ scope — explicit-param admin twin
 *  (get_agent_roster_performance honours p_domain; manager pinned to own domain in code
 *  here, admin/founder → null = all). Both channels. */
export function getRoster(
  principal: ElayaPrincipal,
  period: 'today' | 'this_week' | 'this_month' | 'last_month',
): Promise<AgentRosterRow[]> {
  const range = getPeriodDateRange(period);
  const domainArg = principal.role === 'manager' ? principal.domain : null;
  return getAgentRosterPerformanceForElaya(domainArg, range.from, range.to);
}

// ─────────────────────────────────────────────
// Helpdesk / Call Intelligence (read RLS is USING(true); domain is an explicit param)
// ─────────────────────────────────────────────

export function getHelpdeskCases(
  interests: string[],
  city: string | null,
  domain: Parameters<typeof getCasesForLead>[2],
): Promise<ServiceCase[]> {
  return getCasesForLead(interests, city, domain);
}

export function getHelpdeskHooks(
  categories: string[],
  domain: Parameters<typeof getHooksForCategories>[1],
): Promise<ConversationHook[]> {
  return getHooksForCategories(categories, domain);
}

export function getHelpdeskFullLibrary(domain: Parameters<typeof getHelpdeskLibrary>[0]) {
  return getHelpdeskLibrary(domain);
}

// ─────────────────────────────────────────────
// Manager oversight (Phase 4) — manager+ tools. The TOOL gates the role (manager+);
// here we apply the DOMAIN scope the principal implies: manager → own domain;
// admin/founder → all domains (null). All three backing services are admin-client +
// explicit params, so both channels work.
// ─────────────────────────────────────────────

/** The domain scope an oversight read uses: manager pinned to own domain, admin/founder
 *  see all (null). Agents never reach these (the tool is manager+). */
function oversightDomain(principal: ElayaPrincipal): AppDomain | null {
  return principal.role === 'manager' ? principal.domain : null;
}

export function getEscalations(
  principal: ElayaPrincipal,
): Promise<EscalatedLeadRow[]> {
  return getEscalatedLeads(oversightDomain(principal));
}

export function getOverdueTasks(
  principal: ElayaPrincipal,
): Promise<OverdueTaskEscalationRow[]> {
  return getOverdueGiaTasks(oversightDomain(principal));
}

/** The period vocabulary the Phase-4 oversight/business tools accept. */
export type OversightPeriod = 'this_week' | 'this_month' | 'last_month';

/** Resolve a period → {from,to} ISO range, reusing the performance-service resolver
 *  (R-01 — same IST-anchored boundaries the dashboards use). */
function oversightRange(period: OversightPeriod): { from: string; to: string } {
  return getPeriodDateRange(period);
}

/** Domain-health cards. Manager → only their own domain; admin/founder → all GIA
 *  domains. */
export function getDomainHealth(
  principal: ElayaPrincipal,
  period: OversightPeriod,
): Promise<DomainHealthCard[]> {
  const domains: AppDomain[] =
    principal.role === 'manager' ? [principal.domain] : [...GIA_DOMAINS];
  const { from, to } = oversightRange(period);
  return getDomainHealthMetrics(domains, from, to);
}

/** Campaign performance mix. getCampaignMetrics pins a manager to their own domain
 *  in code (the role+callerDomain it takes); admin/founder see all. */
export function getCampaigns(
  principal: ElayaPrincipal,
  period: OversightPeriod,
): Promise<CampaignMetrics[]> {
  const { from, to } = oversightRange(period);
  return getCampaignMetrics(principal.role, principal.domain, {
    date_from: from,
    date_to: to,
    domain: null,
    search: null,
  });
}

// ─────────────────────────────────────────────
// Founder business reads (Phase 4) — admin/founder tools (the TOOL gates the role).
// Org-wide; getBudgetSummary carries no domain scope (recharges/spend are org-level).
// ─────────────────────────────────────────────

export function getBudget(period: OversightPeriod): Promise<BudgetCampaignRow[]> {
  const { from, to } = oversightRange(period);
  return getBudgetSummary(from, to);
}

// Re-export the channel type for tools that still want to branch copy by channel
// (e.g. "see more in the app" phrasing) — data parity no longer depends on it.
export type { ElayaChannel };

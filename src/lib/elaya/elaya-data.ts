// Elaya data-access layer — THE single chokepoint every Elaya tool fetches through.
// SERVER ONLY.
//
// THE PARITY RULE (Phase 1 — docs/modules/elaya.md):
//   Every read an Elaya tool performs goes through a function HERE. Each one:
//     1. takes the verified StaffPrincipal (identity is NEVER channel- or model-derived),
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
// Adding a new Elaya read: add a function here that takes StaffPrincipal + filter values,
// reuses an existing principal-first service (or a *ForElaya admin twin), and returns a
// shaped result. The tool calls it. Never let a tool reach past this module.

import type { StaffPrincipal } from '@/lib/elaya/principal';
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
import {
  searchTeammatesForElaya,
  type TeammateSearchResult,
} from '@/lib/services/profiles-service';
import { getCampaignMetrics } from '@/lib/services/leads-service';
import { getBudgetSummary, type BudgetCampaignRow } from '@/lib/services/ad-spend-service';
import { rankVendorsForRequest, getVendorDetail } from '@/lib/services/vendors-service';
import { listTicketsForElaya, getTicketByRefForElaya } from '@/lib/services/tickets-service';
import { getSiaGroupForClient, getSiaMessages, searchSiaMessages, getSiaSenderRoles } from '@/lib/services/sia-service';
import { canAccessClient } from '@/lib/elaya/access';
import type { TicketStatus } from '@/lib/constants/tickets';
import type { RankVendorsRequest } from '@/lib/services/vendors-service';
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
  principal: StaffPrincipal,
  opts: { search: string | null; statuses: LeadStatus[] | null; page: number; pageSize: number },
): Promise<LeadsResult> {
  return searchLeadsForElaya(principal.role, principal.userId, principal.domain, opts);
}

/** Domain-scoped owner hint for an agent whose own-scoped search came back empty —
 *  name + owner only (no slug/id/phone). Read-only; never widens access. */
export function findOwnersInDomain(
  principal: StaffPrincipal,
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
export function getColdLeads(principal: StaffPrincipal) {
  const scope =
    principal.role === 'agent'
      ? { assignedTo: principal.userId }
      : principal.role === 'manager'
        ? { domain: principal.domain }
        : {}; // admin / founder — all domains
  return getGoingColdLeads(scope);
}

// ─────────────────────────────────────────────
// Teammates (staff identity — the assignee lookup)
// ─────────────────────────────────────────────

/** Resolve TEAMMATES (staff) by name fragment — the name→userId lookup the task write
 *  tools need for "create a task for <person>". Wraps searchTeammatesForElaya (the
 *  ADMIN-client, code-scoped read — NOT getAssignableUsers, which uses the session
 *  client and returns ZERO rows on the sessionless WhatsApp webhook: the parity-rule
 *  trap that made find_teammate fail for every name on WhatsApp). This is staff
 *  identity, NOT a lead — why "create a task for Arfam" must never reach search_leads.
 *
 *  Scope: ALL domains for everyone (scopeDomain = null). Staff names aren't sensitive,
 *  and assignment crosses domains (a founder/manager assigns to anyone — the task rule),
 *  so narrowing the LOOKUP by domain only hid real teammates (the Arfam-in-finance miss).
 *  The per-action assignment GATE (manager+ to assign to another) stays in the write
 *  tool — this read just turns a name into a userId. */
export async function findTeammates(
  _principal: StaffPrincipal,
  search: string,
): Promise<TeammateSearchResult> {
  return searchTeammatesForElaya(search, null);
}

// ─────────────────────────────────────────────
// Deals
// ─────────────────────────────────────────────

/** Closed deals — agent: own; manager: domain; admin/founder: all. Admin-client
 *  twin (getDealsByRoleForElaya), so both channels work. */
export function searchDeals(
  principal: StaffPrincipal,
  filters: DealFilters,
): Promise<DealsResult> {
  return getDealsByRoleForElaya(principal.role, principal.userId, principal.domain, filters);
}

// ─────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────

/** Gia lead-follow-up tasks — admin client + explicit params, both channels. */
export function getGiaTasks(principal: StaffPrincipal): Promise<GiaTask[]> {
  return getGiaTasksForUser(principal.userId, principal.role, principal.domain);
}

/** Personal to-dos — get_personal_tasks scopes purely on p_user_id; inject the admin
 *  client so it works in the sessionless context too. Both channels. */
export function getPersonalTasksFor(
  principal: StaffPrincipal,
  limit = 20,
): Promise<PersonalTasksResult> {
  return getPersonalTasks(principal.userId, { limit }, createAdminClient());
}

/** Group/team workspaces — get_group_task_summaries_for_user(p_user_id) is the explicit-
 *  param admin twin of the auth.uid()-scoped get_group_task_summaries, so this works on
 *  WhatsApp now (previously WhatsApp got an empty list / "open the app"). Both channels. */
export function getGroupTasksFor(principal: StaffPrincipal): Promise<TaskGroupRow[]> {
  return getGroupTasksForUser(principal.userId);
}

/** Resolve a group the principal can SEE, by id — the access gate for adding a subtask
 *  via Elaya. Reuses getGroupTasksFor (the admin twin, channel-safe), whose set already
 *  encodes "groups you created or are a subtask-assignee in" (migration 0058). Returning
 *  the row IFF it's in that set IS the per-resource check — admin/founder see all groups,
 *  so they pass; a manager/agent only passes for a group they're part of. Never a session
 *  client (would blank on WhatsApp). null = not visible to this principal. */
export async function getVisibleGroupById(
  principal: StaffPrincipal,
  groupId: string,
): Promise<TaskGroupRow | null> {
  const groups = await getGroupTasksFor(principal);
  return groups.find((g) => g.id === groupId) ?? null;
}

// ─────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────

/** Agent's own pulse — explicit-param admin twin (get_agent_today_pulse_for_user).
 *  Both channels. */
export function getAgentPulse(
  principal: StaffPrincipal,
  period: 'today' | 'this_week' | 'this_month' | 'last_month',
): Promise<AgentTodayPulse> {
  return getAgentTodayPulseForUser(principal.userId, period);
}

/** Per-agent roster for a manager+ scope — explicit-param admin twin
 *  (get_agent_roster_performance honours p_domain; manager pinned to own domain in code
 *  here, admin/founder → null = all). Both channels. */
export function getRoster(
  principal: StaffPrincipal,
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
function oversightDomain(principal: StaffPrincipal): AppDomain | null {
  return principal.role === 'manager' ? principal.domain : null;
}

export function getEscalations(
  principal: StaffPrincipal,
): Promise<EscalatedLeadRow[]> {
  return getEscalatedLeads(oversightDomain(principal));
}

export function getOverdueTasks(
  principal: StaffPrincipal,
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
  principal: StaffPrincipal,
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
  principal: StaffPrincipal,
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

// ─────────────────────────────────────────────
// Vendors (0183–0190)
//
// Both wrap the SAME functions the /vendors UI calls — the spec is explicit
// that Elaya's tool, the future Sia ticket screen and the Chrome extension all
// call one ranking, and none of them re-rank. A second ordering here would
// drift from the page within a week.
// ─────────────────────────────────────────────

export function rankVendors(req: RankVendorsRequest) {
  return rankVendorsForRequest(req);
}

export function getVendor(id: string) {
  return getVendorDetail(id);
}

// ─────────────────────────────────────────────
// Tickets (0195, 0199, 0200)
//
// The sentinel's ledger and the genie's queue, read through the same admin-client
// seam as everything else so WhatsApp turns see what the app sees. Scope is the
// PRINCIPAL's queendom (read from the profile, never model-supplied); admin and
// founder see every queendom. The write tools go through the ticket cores.
// ─────────────────────────────────────────────

/** The queendom the principal belongs to, from the profile (the sia_role / queendom_id columns of 0194). */
export async function principalQueendom(principal: StaffPrincipal): Promise<{ queendom_id: string | null; sia_role: string | null }> {
  const { data } = await createAdminClient().from('profiles').select('queendom_id, sia_role').eq('id', principal.userId).maybeSingle();
  const row = data as { queendom_id: string | null; sia_role: string | null } | null;
  return { queendom_id: row?.queendom_id ?? null, sia_role: row?.sia_role ?? null };
}

export async function listTicketsFor(principal: StaffPrincipal, opts: { mine?: boolean; status?: TicketStatus[]; search?: string | null; limit?: number }) {
  const { queendom_id } = await principalQueendom(principal);
  const privileged = principal.role === 'admin' || principal.role === 'founder';
  if (!privileged && !queendom_id) return [];
  return listTicketsForElaya({
    queendomId: privileged ? null : queendom_id,
    assigneeId: opts.mine ? principal.userId : null,
    statuses: opts.status ?? [],
    search: opts.search ?? null,
    limit: opts.limit ?? 25,
  });
}

export async function getTicketFor(principal: StaffPrincipal, ref: string) {
  const t = await getTicketByRefForElaya(ref);
  if (!t) return null;
  const { queendom_id } = await principalQueendom(principal);
  return canAccessClient({ role: principal.role, queendom_id }, t.ticket.queendom_id) ? t : null;
}

// ─────────────────────────────────────────────
// Clients — a member's WhatsApp history, read for Elaya (2026-09-16)
//
// The RAW-DATA posture: no profile layer sits in between. These return real
// message rows (date, who said it, the text) and the model answers only from
// them. Scope is the principal's queendom via canAccessClient (admin/founder:
// every client); the group is the one the mapping tool tied to the client
// (wag_groups.client_id). Admin client throughout (the parity rule) — the
// clients-service reads use the session client and blank on WhatsApp turns.
// ─────────────────────────────────────────────

export type ClientBrief = {
  id: string;
  full_name: string;
  primary_phone: string | null;
  queendom_id: string | null;
  tier: string | null;
  membership_type: string | null;
  membership_status: string | null;
  membership_end: string | null;
};
const CLIENT_BRIEF_SELECT =
  'id, full_name, primary_phone, queendom_id, tier, membership_type, membership_status, membership_end';

/** One message as the model sees it: who, when, what. Text capped so a page stays bounded. */
export type ClientMessage = {
  at: string;
  from: 'client' | 'staff' | 'other';
  name: string | null;
  type: string;
  text: string | null;
  deleted: boolean;
};
const MESSAGE_TEXT_CAP = 500;

const STAFF_ROLES = new Set(['genie', 'bishop', 'queen', 'founder', 'watcher']);

async function shapeMessages(
  rows: { sender_jid: string; sender_name: string | null; type: string; text: string | null; wa_timestamp: string; is_revoked: boolean }[],
): Promise<ClientMessage[]> {
  const roles = await getSiaSenderRoles(rows.map((r) => r.sender_jid));
  return rows.map((r) => {
    const who = roles.get(r.sender_jid);
    const from: ClientMessage['from'] =
      who?.role === 'client' ? 'client' : who && (who.is_staff || STAFF_ROLES.has(who.role)) ? 'staff' : 'other';
    const text = r.text && r.text.length > MESSAGE_TEXT_CAP ? r.text.slice(0, MESSAGE_TEXT_CAP) + '…' : r.text;
    return { at: r.wa_timestamp, from, name: r.sender_name, type: r.type, text, deleted: r.is_revoked };
  });
}

/** Clients whose name (or phone digits) match, filtered to what the principal may see. */
export async function findClientsFor(principal: StaffPrincipal, query: string, limit = 8): Promise<ClientBrief[]> {
  const token = query.trim().replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (token.length < 2) return [];
  const digits = token.replace(/\D/g, '');
  const ors = [`full_name.ilike.%${token}%`];
  if (digits.length >= 6) ors.push(`primary_phone.ilike.%${digits}%`);
  const { data } = await createAdminClient()
    .from('clients')
    .select(CLIENT_BRIEF_SELECT)
    .or(ors.join(','))
    .order('full_name')
    .limit(limit);
  const rows = (data ?? []) as ClientBrief[];
  const { queendom_id } = await principalQueendom(principal);
  return rows.filter((c) => canAccessClient({ role: principal.role, queendom_id }, c.queendom_id));
}

/** One client + their mapped group, or null when the principal may not see them (or no such client). */
export async function getClientBriefFor(
  principal: StaffPrincipal,
  clientId: string,
): Promise<{ client: ClientBrief; group: Awaited<ReturnType<typeof getSiaGroupForClient>> } | null> {
  const { data } = await createAdminClient().from('clients').select(CLIENT_BRIEF_SELECT).eq('id', clientId).maybeSingle();
  const client = data as ClientBrief | null;
  if (!client) return null;
  const { queendom_id } = await principalQueendom(principal);
  if (!canAccessClient({ role: principal.role, queendom_id }, client.queendom_id)) return null;
  return { client, group: await getSiaGroupForClient(clientId) };
}

/** The latest page of the client's group chat (oldest → newest); `before` pages further back. */
export async function getClientMessagesFor(
  principal: StaffPrincipal,
  clientId: string,
  opts: { before?: string } = {},
): Promise<{ client: ClientBrief; group_subject: string | null; messages: ClientMessage[]; has_more: boolean; oldest_at: string | null } | null> {
  const brief = await getClientBriefFor(principal, clientId);
  if (!brief) return null;
  if (!brief.group) return { client: brief.client, group_subject: null, messages: [], has_more: false, oldest_at: null };
  const page = await getSiaMessages(brief.group.group_jid, { before: opts.before });
  const messages = await shapeMessages(page.messages);
  return {
    client: brief.client,
    group_subject: brief.group.subject,
    messages,
    has_more: page.hasMore,
    oldest_at: messages[0]?.at ?? null,
  };
}

/** Full-text hits in the client's group for a word or phrase (newest first). */
export async function searchClientHistoryFor(
  principal: StaffPrincipal,
  clientId: string,
  query: string,
  limit = 30,
): Promise<{ client: ClientBrief; group_subject: string | null; hits: ClientMessage[] } | null> {
  const brief = await getClientBriefFor(principal, clientId);
  if (!brief) return null;
  if (!brief.group) return { client: brief.client, group_subject: null, hits: [] };
  const rows = await searchSiaMessages(query, brief.group.group_jid);
  const hits = await shapeMessages(rows.slice(0, limit));
  return { client: brief.client, group_subject: brief.group.subject, hits };
}

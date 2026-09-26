// Elaya data-access layer — THE single chokepoint every Elaya tool fetches through.
// SERVER ONLY.
//
// THE PARITY RULE (Phase 1 — docs/modules/elaya.md):
//   Every read an Elaya tool performs goes through a function HERE. Each one:
//     1. takes the verified StaffPrincipal (identity is NEVER channel- or model-derived),
//     2. uses the ADMIN member (works in the sessionless WhatsApp webhook AND in-app),
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
import { memberDb } from '@/lib/supabase/schemas';
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
import { rankVendorsForRequest, getVendorDetail, resolveMergedVendorId } from '@/lib/services/vendors-service';
import { hasVendorActionAccess } from '@/lib/utils/route-access';
import { listTicketsForElaya, getTicketByRefForElaya } from '@/lib/services/tickets-service';
import { getSiaGroupForMember, getSiaGroups, getSiaMessages, searchSiaMessages, getSiaSenderRoles, type SiaGroupKind } from '@/lib/services/sia-service';
import { getSiaViewerScope, getQueendomGroupJids, pinnedFreshdeskGroup, type SiaViewerScope } from '@/lib/services/sia-access';
import {
  getFreshdeskOverview,
  getFreshdeskFilterVocab,
  listFreshdeskTickets,
  getFreshdeskTicketDetail,
} from '@/lib/services/freshdesk-service';
import { FD_TERMINAL_STATUSES, fdPriorityLabel, fdStatusLabel } from '@/lib/constants/freshdesk';
import type { FdTicketListFilters } from '@/lib/types/freshdesk';
import { canAccessMember, canSeeMemberFinance } from '@/lib/elaya/access';
import { getMemberDetailAsAdmin } from '@/lib/services/members-service';
import { getMemberFinance, getBooksOverview } from '@/lib/services/zoho-service';
import { runElayaQuery, logElayaQuery, getElayaCatalog, ELAYA_EXPORT_MAX_ROWS } from '@/lib/services/elaya-query-service';
import { listLabelSets } from '@/lib/services/elaya-jobs-service';
import { getLivePulse } from '@/lib/services/pulse-service';
import { isOnlyAcknowledgement } from '@/lib/services/ticket-intake';
import { getLeadWhatsAppThreadForElaya } from '@/lib/services/whatsapp-service';
import { getSubscriptionsForElaya } from '@/lib/services/subscriptions-service';
import { getActivityFeed, type ActivityFeedResult } from '@/lib/services/activity-service';
import { canAccessLead } from '@/lib/elaya/access';
import type { GiaDomain } from '@/lib/constants/domains';
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
import { mapRows } from '@/lib/utils/rows';
import type { DealFilters } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────

/** Scoped lead search — agent: own; manager: domain; admin/founder: all. Already
 *  admin-member + principal-scoped (searchLeadsForElaya), so both channels work. */
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
 *  getGoingColdLeads is admin-member + explicit scope, so both channels work. */
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
 *  ADMIN-member, code-scoped read — NOT getAssignableUsers, which uses the session
 *  member and returns ZERO rows on the sessionless WhatsApp webhook: the parity-rule
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

/** Closed deals — agent: own; manager: domain; admin/founder: all. Admin-member
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
 *  member so it works in the sessionless context too. Both channels. */
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
 *  member (would blank on WhatsApp). null = not visible to this principal. */
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
  // Admin client: the parity rule (a bridge / WhatsApp / MCP call has no session; anon sees nothing).
  return getCasesForLead(interests, city, domain, createAdminClient());
}

export function getHelpdeskHooks(
  categories: string[],
  domain: Parameters<typeof getHooksForCategories>[1],
): Promise<ConversationHook[]> {
  return getHooksForCategories(categories, domain, 5, createAdminClient());
}

export function getHelpdeskFullLibrary(domain: Parameters<typeof getHelpdeskLibrary>[0]) {
  return getHelpdeskLibrary(domain, createAdminClient());
}

// ─────────────────────────────────────────────
// Manager oversight (Phase 4) — manager+ tools. The TOOL gates the role (manager+);
// here we apply the DOMAIN scope the principal implies: manager → own domain;
// admin/founder → all domains (null). All three backing services are admin-member +
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

/**
 * Who may ask Elaya about vendors: the vendor module's own audience (hasVendorActionAccess in
 * route-access.ts, SQL mirror public.can_access_vendors(), 0221): admin, founder and the whole
 * concierge domain. Every staff role CARRIES the two vendor tools; this decides, per person, in
 * Node, on both channels. The model never supplies identity: `principal` is the verified profile.
 */
export function canAskAboutVendors(principal: StaffPrincipal): boolean {
  return hasVendorActionAccess({ role: principal.role, domain: principal.domain });
}

export function rankVendors(req: RankVendorsRequest) {
  return rankVendorsForRequest(req);
}

export function getVendor(id: string) {
  return getVendorDetail(id);
}

/** Where a merged-away vendor id went (0227) — so an old id in a chat still answers. */
export function resolveMergedVendor(id: string) {
  return resolveMergedVendorId(id);
}

// ─────────────────────────────────────────────
// Tickets (0195, 0199, 0200)
//
// The sentinel's ledger and the genie's queue, read through the same admin-member
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
  return canAccessMember({ role: principal.role, queendom_id }, t.ticket.queendom_id) ? t : null;
}

// ─────────────────────────────────────────────
// Members — a member's WhatsApp history, read for Elaya (2026-09-16)
//
// The RAW-DATA posture: no profile layer sits in between. These return real
// message rows (date, who said it, the text) and the model answers only from
// them. Scope is the principal's queendom via canAccessMember (admin/founder:
// every member); the group is the one the mapping tool tied to the member
// (wag_groups.member_id). Admin member throughout (the parity rule) — the
// members-service reads use the session client and blank on WhatsApp turns.
// ─────────────────────────────────────────────

export type MemberBrief = {
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
export type MemberMessage = {
  at: string;
  from: 'member' | 'staff' | 'other';
  name: string | null;
  type: string;
  text: string | null;
  deleted: boolean;
};
const MESSAGE_TEXT_CAP = 500;

const STAFF_ROLES = new Set(['genie', 'bishop', 'queen', 'founder', 'watcher']);

async function shapeMessages(
  rows: { sender_jid: string; sender_name: string | null; type: string; text: string | null; wa_timestamp: string; is_revoked: boolean }[],
): Promise<MemberMessage[]> {
  const roles = await getSiaSenderRoles(rows.map((r) => r.sender_jid));
  return rows.map((r) => {
    const who = roles.get(r.sender_jid);
    // The founder's guard (plan-sia-intelligence rule 4): a name carrying "Indulge" is staff even untagged.
    const from: MemberMessage['from'] =
      who?.role === 'member' ? 'member'
        : (who && (who.is_staff || STAFF_ROLES.has(who.role))) || /\bindulge\b/i.test(r.sender_name ?? '') ? 'staff' : 'other';
    const text = r.text && r.text.length > MESSAGE_TEXT_CAP ? r.text.slice(0, MESSAGE_TEXT_CAP) + '…' : r.text;
    return { at: r.wa_timestamp, from, name: r.sender_name, type: r.type, text, deleted: r.is_revoked };
  });
}

/**
 * Members whose name (or phone digits) match, split into what the principal may see and how
 * many matches sit outside their seat. The second number is the difference between "no such
 * member" and "not yours to see" (2026-09-24: a concierge manager without a queendom seat asked
 * for three real members, was told "no match" three times, and gave up on Elaya).
 */
export async function findMembersScopedFor(
  principal: StaffPrincipal,
  query: string,
  limit = 8,
): Promise<{ hits: MemberBrief[]; outsideSeat: number }> {
  const token = query.trim().replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (token.length < 2) return { hits: [], outsideSeat: 0 };
  const digits = token.replace(/\D/g, '');
  const ors = [`full_name.ilike.%${token}%`];
  if (digits.length >= 6) ors.push(`primary_phone.ilike.%${digits}%`);
  const { data } = await memberDb(createAdminClient())
    .from('members')
    .select(CLIENT_BRIEF_SELECT)
    .or(ors.join(','))
    .order('full_name')
    .limit(limit);
  const rows = (data ?? []) as MemberBrief[];
  const { queendom_id } = await principalQueendom(principal);
  const hits = rows.filter((c) => canAccessMember({ role: principal.role, queendom_id }, c.queendom_id));
  return { hits, outsideSeat: rows.length - hits.length };
}

/** Members whose name (or phone digits) match, filtered to what the principal may see. */
export async function findMembersFor(principal: StaffPrincipal, query: string, limit = 8): Promise<MemberBrief[]> {
  return (await findMembersScopedFor(principal, query, limit)).hits;
}

// ── The members roster with filters (2026-09-24) ─────────────────────────────
// "All clients from Mumbai with their profession" needs a LIST, and the member tools were one
// member at a time. City and company are FACTS the profiler and the seeders filed (member_facts,
// facet identity: primary_city, company, company_and_designation), not columns on the member, so
// the roster is read in two steps: the scoped member rows, then the facts for those rows. Scope is
// the seat: admin/founder every queendom, a seated teammate their queendom, anyone else nothing.

export type MemberListFilters = {
  city?: string;
  company?: string;
  tier?: string;
  status?: string;
  queendom?: string;
  text?: string;
  limit?: number;
};
const MEMBER_LIST_SCAN = 600;
const MEMBER_LIST_MAX = 100;
const MEMBER_LIST_CITY_KEYS = ['primary_city', 'identity_primary_city'];
const MEMBER_LIST_COMPANY_KEYS = ['company', 'company_and_designation', 'identity_company', 'identity_company_and_designation'];

export async function listMembersFor(principal: StaffPrincipal, f: MemberListFilters) {
  const admin = createAdminClient();
  const scopeAll = principal.role === 'admin' || principal.role === 'founder';
  const { queendom_id } = await principalQueendom(principal);
  if (!scopeAll && !queendom_id) return { denied: true as const, reason: 'no_seat' as const };

  const { data: qs } = await admin.schema('sia').from('queendoms').select('id, name');
  const queendomName = new Map<string, string>();
  mapRows<{ id: string; name: string }, void>(qs, (q) => { queendomName.set(q.id, q.name); });

  let wantQueendom: string | null = null;
  if (f.queendom) {
    const needle = f.queendom.toLowerCase().replace(/'s queendom|queendom/g, '').trim();
    wantQueendom = [...queendomName.entries()].find(([, n]) => n.toLowerCase().includes(needle))?.[0] ?? null;
    if (!wantQueendom) return { members: [], total_matching: 0, note: `No queendom named "${f.queendom}". Known: ${[...queendomName.values()].join(', ')}.` };
  }
  const status = f.status?.trim() || 'Active';

  let q = memberDb(admin).from('members').select(CLIENT_BRIEF_SELECT).order('full_name').limit(MEMBER_LIST_SCAN);
  if (!scopeAll) q = q.eq('queendom_id', queendom_id as string);
  else if (wantQueendom) q = q.eq('queendom_id', wantQueendom);
  if (status.toLowerCase() !== 'any') q = q.ilike('membership_status', status);
  if (f.tier) q = q.ilike('tier', `%${f.tier.trim()}%`);
  if (f.text) q = q.ilike('full_name', `%${f.text.trim().replace(/[%,()]/g, ' ')}%`);
  const { data } = await q;
  const rows = (data ?? []) as MemberBrief[];
  if (rows.length === 0) return { members: [], total_matching: 0, scope: scopeAll ? 'all queendoms' : (queendomName.get(queendom_id as string) ?? 'your queendom'), status };

  // The facts for these members, in chunks (PostgREST's in-list has a length limit).
  const facts = new Map<string, { city: string | null; company: string | null }>();
  const keys = [...MEMBER_LIST_CITY_KEYS, ...MEMBER_LIST_COMPANY_KEYS];
  for (let i = 0; i < rows.length; i += 150) {
    const ids = rows.slice(i, i + 150).map((r) => r.id);
    const { data: fr } = await memberDb(admin)
      .from('member_facts')
      .select('member_id, key, value, confidence')
      .in('member_id', ids)
      .in('key', keys)
      .is('superseded_by', null)
      .order('confidence', { ascending: false });
    mapRows<{ member_id: string; key: string; value: string | null; confidence: number | null }, void>(fr, (x) => {
      const cur = facts.get(x.member_id) ?? { city: null, company: null };
      if (MEMBER_LIST_CITY_KEYS.includes(x.key) && !cur.city) cur.city = x.value;
      if (MEMBER_LIST_COMPANY_KEYS.includes(x.key) && !cur.company) cur.company = x.value;
      facts.set(x.member_id, cur);
    });
  }

  const city = f.city?.trim().toLowerCase();
  const company = f.company?.trim().toLowerCase();
  const shaped = rows
    .map((r) => {
      const ff = facts.get(r.id) ?? { city: null, company: null };
      return {
        member_id: r.id,
        name: r.full_name,
        tier: r.tier,
        status: r.membership_status,
        membership_ends: r.membership_end,
        queendom: r.queendom_id ? (queendomName.get(r.queendom_id) ?? null) : null,
        city: ff.city,
        company: ff.company,
      };
    })
    .filter((m) => !city || (m.city ?? '').toLowerCase().includes(city) || (city === 'mumbai' && /bombay/i.test(m.city ?? '')))
    .filter((m) => !company || (m.company ?? '').toLowerCase().includes(company));
  const limit = Math.min(Math.max(f.limit ?? 50, 1), MEMBER_LIST_MAX);
  return {
    members: shaped.slice(0, limit),
    total_matching: shaped.length,
    scope: scopeAll ? (wantQueendom ? queendomName.get(wantQueendom) : 'all queendoms') : (queendomName.get(queendom_id as string) ?? 'your queendom'),
    status,
    note:
      (city ? 'City comes from saved facts; a member with no city on record is not listed. ' : '') +
      (shaped.length > limit ? `Showing ${limit} of ${shaped.length}.` : ''),
  };
}

/** One member + their mapped group, or null when the principal may not see them (or no such member). */
export async function getMemberBriefFor(
  principal: StaffPrincipal,
  clientId: string,
): Promise<{ member: MemberBrief; group: Awaited<ReturnType<typeof getSiaGroupForMember>> } | null> {
  const { data } = await memberDb(createAdminClient()).from('members').select(CLIENT_BRIEF_SELECT).eq('id', clientId).maybeSingle();
  const member = data as MemberBrief | null;
  if (!member) return null;
  const { queendom_id } = await principalQueendom(principal);
  if (!canAccessMember({ role: principal.role, queendom_id }, member.queendom_id)) return null;
  return { member, group: await getSiaGroupForMember(clientId) };
}

/** The latest page of the member's group chat (oldest → newest); `before` pages further back. */
export async function getMemberMessagesFor(
  principal: StaffPrincipal,
  clientId: string,
  opts: { before?: string } = {},
): Promise<{ member: MemberBrief; group_subject: string | null; messages: MemberMessage[]; has_more: boolean; oldest_at: string | null } | null> {
  const brief = await getMemberBriefFor(principal, clientId);
  if (!brief) return null;
  if (!brief.group) return { member: brief.member, group_subject: null, messages: [], has_more: false, oldest_at: null };
  const page = await getSiaMessages(brief.group.group_jid, { before: opts.before });
  const messages = await shapeMessages(page.messages);
  return {
    member: brief.member,
    group_subject: brief.group.subject,
    messages,
    has_more: page.hasMore,
    oldest_at: messages[0]?.at ?? null,
  };
}

/** Full-text hits in the member's group for a word or phrase (newest first). */
/** Words that carry no topic. Kept tiny: it only guards the words split out of the caller's query. */
const SEARCH_FILLER: ReadonlySet<string> = new Set(['with', 'from', 'that', 'this', 'have', 'about', 'plans', 'plan', 'want', 'wants', 'does', 'what', 'when', 'ever', 'their', 'them', 'they', 'some', 'like', 'likes', 'into', 'over', 'were', 'been', 'will', 'would', 'should', 'could', 'there', 'here', 'your', 'ours', 'mine', 'also', 'just', 'very', 'much', 'more', 'most', 'many', 'than', 'then', 'time', 'times', 'thing', 'things', 'stuff', 'eating', 'going', 'doing', 'getting', 'family', 'member', 'something', 'anything', 'everything', 'nothing', 'never', 'happened', 'happen', 'mention', 'mentioned', 'asked', 'said', 'talked', 'told']);

/** Letters, digits and spaces only: these words go into a PostgREST `or=` filter and a tsquery. */
const tidySearchText = (t: string) => t.replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * THE search vocabulary for a topic (member history AND the group search, R-01): the whole query
 * as a phrase, its own words at 4+ letters and not filler (or "eating out" matches every "about"
 * and "checkout", and "Nadal meet and greet" matches every "and"), and the caller's `related`
 * words trusted at 3 letters ("goa", "spa"). At most 14.
 */
function buildSearchWords(query: string, related: string[]): string[] {
  return [...new Set([
    tidySearchText(query),
    ...tidySearchText(query).split(' ').filter((w) => w.length >= 4 && !SEARCH_FILLER.has(w)),
    ...related.map(tidySearchText).filter((w) => w.length >= 3 && !SEARCH_FILLER.has(w)),
  ].filter((w) => w.length >= 3))].slice(0, 14);
}

/**
 * Best match first: how many of the words a row really holds, as WHOLE words (the database's
 * ILIKE / OR-tsquery is a wide net; this is the sieve). A row holding none as a whole word is dropped.
 */
function rankByWords<T>(list: T[], text: (r: T) => string, words: string[], keep: number): T[] {
  const res = words.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu'));
  const score = (t: string) => res.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  return list.map((r, i) => ({ r, i, n: score(text(r)) })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n || x.i - y.i).slice(0, keep).map((x) => x.r);
}

export type MemberHistorySearch = {
  member: MemberBrief;
  group_subject: string | null;
  /** Serene's one-line summary of each finished conversation (the profiler, 0215) that touches the topic. */
  conversations: { date: string; summary: string; tone: string | null }[];
  /** Saved facts that touch the topic. */
  facts: { facet: string; key: string; value: string; polarity: string | null; date: string }[];
  /** The raw messages holding any of the words, newest first. */
  hits: MemberMessage[];
  searched_for: string[];
};

/**
 * Search a member's history BY TOPIC, not by exact phrase. Word search cannot know that
 * "anniversary" and "wedding day" are one thing, so the CALLER (Elaya, who does know) passes
 * `related`: the other words it could have been written as. One pass over three places:
 * the conversation summaries, the saved facts, and the messages themselves (any of the words).
 * Same gate as every member read: getMemberBriefFor decides whether this principal sees the member.
 */
export async function searchMemberHistoryFor(
  principal: StaffPrincipal,
  clientId: string,
  query: string,
  related: string[] = [],
  limit = 30,
): Promise<MemberHistorySearch | null> {
  const brief = await getMemberBriefFor(principal, clientId);
  if (!brief) return null;
  const words = buildSearchWords(query, related);
  if (words.length === 0) return { member: brief.member, group_subject: brief.group?.subject ?? null, conversations: [], facts: [], hits: [], searched_for: [] };
  const admin = createAdminClient();
  const like = (col: string) => words.map((w) => `${col}.ilike.*${w}*`).join(',');
  const [events, facts, rows] = await Promise.all([
    memberDb(admin).from('member_events').select('occurred_at, summary, tone').eq('member_id', clientId).eq('source', 'whatsapp_group').or(like('summary')).order('occurred_at', { ascending: false }).limit(80),
    memberDb(admin).from('member_facts').select('facet, key, value, polarity, created_at').eq('member_id', clientId).is('superseded_by', null).or(`${like('value')},${like('key')}`).order('confidence', { ascending: false }).limit(60),
    brief.group ? searchSiaMessages(query, brief.group.group_jid, words) : Promise.resolve([]),
  ]);
  const ranked = <T,>(list: T[], text: (r: T) => string, keep: number): T[] => rankByWords(list, text, words, keep);
  type Ev = { occurred_at: string; summary: string | null; tone: string | null };
  type Fa = { facet: string; key: string; value: string; polarity: string | null; created_at: string };
  const topEvents = ranked(mapRows<Ev, Ev>(events.data, (e) => e), (e) => e.summary ?? '', 12);
  const topFacts = ranked(mapRows<Fa, Fa>(facts.data, (f) => f), (f) => `${f.key.replace(/_/g, ' ')} ${f.value}`, 12);
  const topRows = ranked(rows, (m) => m.text ?? '', limit);
  return {
    member: brief.member,
    group_subject: brief.group?.subject ?? null,
    conversations: topEvents.map((e) => ({ date: e.occurred_at.slice(0, 10), summary: clip(e.summary, 300) ?? '', tone: e.tone })),
    facts: topFacts.map((f) => ({ facet: f.facet, key: f.key, value: clip(f.value) ?? '', polarity: f.polarity, date: f.created_at.slice(0, 10) })),
    hits: await shapeMessages(topRows),
    searched_for: words,
  };
}

// ─── The member's profile: what Serene KNOWS, as opposed to what was said ──────
// get_member_recent_messages reads the chat; this reads the twin (0194): the facts by facet,
// the people around the member, the health score, their Freshdesk requests, what is coming
// up. One dossier read (getMemberDetailAsAdmin — the SAME read the member page renders), then
// trimmed to a bounded shape: a model gets the newest and the most confident, never a dump.

const PROFILE_FACTS_MAX = 80;
/** Notes shown on a plain profile read (newest first by the note's own date). 15 since 2026-09-25: the
 *  Freshdesk notes import gave nine members more than the old 8, and the oldest imported notes fell off. */
const PROFILE_NOTES_MAX = 15;
const PROFILE_TEXT_CAP = 240;
const clip = (v: string | null | undefined, n = PROFILE_TEXT_CAP) => (v && v.length > n ? v.slice(0, n) + '…' : (v ?? null));

export type MemberProfileForElaya = NonNullable<Awaited<ReturnType<typeof getMemberProfileFor>>>;

export async function getMemberProfileFor(principal: StaffPrincipal, memberId: string) {
  const brief = await getMemberBriefFor(principal, memberId); // the queendom gate, once
  if (!brief) return null;
  const d = await getMemberDetailAsAdmin(memberId);
  if (!d) return null;

  // Most confident first, then newest; grouped by facet so the model reads a profile, not a list.
  const ranked = [...d.facts].sort((a, b) => b.confidence - a.confidence || b.observed_at.localeCompare(a.observed_at));
  const shown = ranked.slice(0, PROFILE_FACTS_MAX);
  const facts: Record<string, { key: string; value: string | null; polarity: string; sources: string[]; confidence: number; observed_at: string }[]> = {};
  for (const f of shown) {
    (facts[f.facet] ??= []).push({ key: f.key, value: clip(f.value), polarity: f.polarity, sources: f.sources, confidence: f.confidence, observed_at: f.observed_at });
  }
  const ticket = (t: (typeof d.tickets.recent)[number]) => ({
    id: t.id, subject: clip(t.subject, 140), status: t.status_label ?? String(t.status), category: t.category,
    agent: t.agent_name, created: t.fd_created_at, resolved: t.resolved_at, escalated: t.is_escalated,
  });
  const m = d.member;
  return {
    member: {
      id: m.id, name: m.full_name, tier: m.tier, membership_type: m.membership_type, membership_status: m.membership_status,
      membership_start: m.membership_start, membership_end: m.membership_end, queendom: d.queendom?.name ?? null,
      identity_status: m.identity_status, whatsapp_group: brief.group?.subject ?? null,
    },
    team: { queen: d.team.queen?.full_name ?? null, bishop: d.team.bishop?.full_name ?? null, joker: d.team.joker?.full_name ?? null, genies: d.team.genies.map((g) => g.full_name) },
    facts,
    facts_shown: shown.length,
    facts_total: d.facts.length,
    observations: d.notes.slice(0, PROFILE_NOTES_MAX).map((n) => ({ at: n.observed_at, by: n.created_by_name, text: clip(n.value, 400) })),
    people: d.people.slice(0, 20).map((x) => ({ name: x.name, relation: x.relation, can_request: x.can_request, note: clip(x.note) })),
    health: { score: d.health.score, trend_30d: d.health.trend30d, reasons: d.health.reasons.slice(0, 5) },
    requests: { total: d.tickets.total, open: d.tickets.open.slice(0, 8).map(ticket), recent: d.tickets.recent.slice(0, 8).map(ticket) },
    coming_up: d.anticipations.slice(0, 10).map((a) => ({ kind: a.kind, title: a.title, due_at: a.due_at, status: a.status, suggested_action: clip(a.suggested_action) })),
    relations: d.relations.slice(0, 12).map((r) => ({ kind: r.entity_kind, label: r.entity_label, relation: r.relation, strength: Number(r.strength), last_seen_at: r.last_seen_at })),
    timeline: d.events.slice(0, 12).map((e) => ({ at: e.occurred_at, kind: e.kind, tone: e.tone, summary: clip(e.summary) })),
  };
}

/** The member's money, live from Zoho Books (1-minute Redis copy). Same gate as the finance page. */
export async function getMemberFinanceFor(principal: StaffPrincipal, memberId: string) {
  if (!canSeeMemberFinance({ role: principal.role })) return { denied: true as const };
  const brief = await getMemberBriefFor(principal, memberId);
  if (!brief) return null;
  const { data } = await memberDb(createAdminClient()).from('members').select('zoho_customer_id, membership_amount_inr').eq('id', memberId).maybeSingle();
  const row = data as { zoho_customer_id: string | null; membership_amount_inr: number | null } | null;
  if (!row?.zoho_customer_id) return { member: brief.member.full_name, linked: false as const, membership_amount_inr: row?.membership_amount_inr ?? null };
  const f = await getMemberFinance(row.zoho_customer_id);
  if (!f) return { member: brief.member.full_name, linked: true as const, unavailable: true as const };
  return {
    member: brief.member.full_name,
    linked: true as const,
    currency: 'INR',
    totals: f.totals,
    unpaid_invoices: f.invoices.filter((i) => Number(i.balance) > 0).slice(0, 10).map((i) => ({ number: i.invoice_number, date: i.date, due_date: i.due_date, status: i.status, total: i.total, balance: i.balance })),
    latest_invoices: f.invoices.slice(0, 6).map((i) => ({ number: i.invoice_number, date: i.date, status: i.status, total: i.total, balance: i.balance })),
    latest_payments: f.payments.slice(0, 6).map((x) => ({ date: x.date, amount: x.amount, mode: x.payment_mode, invoices: x.invoice_numbers })),
    fetched_at: f.fetchedAt,
  };
}

// ─────────────────────────────────────────────
// Sia and Freshdesk as a whole, and the books (2026-09-19)
//
// ONE scope answer for all of it: sia-access.ts (the same rule /sia and /freshdesk apply).
//   all       admin, founder, the tech workbench: every group, every Freshdesk ticket
//   queendom  a seated concierge teammate: only groups linked to their queendom's members,
//             only their queendom's Freshdesk group
//   null      nobody else sees either
// The books are the /books page's gate: admin and founder only.
// ─────────────────────────────────────────────

async function siaScopeFor(principal: StaffPrincipal): Promise<SiaViewerScope | null> {
  const { queendom_id, sia_role } = await principalQueendom(principal);
  return getSiaViewerScope({ role: principal.role, domain: principal.domain, sia_role, queendom_id });
}

// ── Freshdesk ──

export type FreshdeskAsk = {
  search?: string | null;
  only_open?: boolean;
  status?: string | null;
  group?: string | null;
  agent?: string | null;
  category?: string | null;
  created_from?: string | null;
  created_to?: string | null;
};

type FreshdeskFilterResult =
  | { ok: true; filters: FdTicketListFilters; applied: Record<string, string> }
  | { ok: false; reason: 'no_access' | 'no_group' }
  | { ok: false; reason: 'unknown'; field: 'status' | 'group' | 'agent' | 'category'; asked: string; choices: string[] };

/** One name out of a small vocabulary: exact first, then contains; several or none = the caller says so. */
function pickByName<T>(items: T[], label: (t: T) => string, asked: string): T | null {
  const want = asked.trim().toLowerCase();
  const exact = items.filter((i) => label(i).toLowerCase() === want);
  if (exact.length === 1) return exact[0];
  const near = items.filter((i) => label(i).toLowerCase().includes(want));
  return near.length === 1 ? near[0] : null;
}

/** The ask, in the words a person uses, turned into the page's own filters. The scope pin always wins. */
async function freshdeskFiltersFor(principal: StaffPrincipal, ask: FreshdeskAsk): Promise<FreshdeskFilterResult> {
  const scope = await siaScopeFor(principal);
  if (!scope) return { ok: false, reason: 'no_access' };
  const pin = pinnedFreshdeskGroup(scope);
  if (pin.pinned && pin.groupId == null) return { ok: false, reason: 'no_group' };

  const vocab = await getFreshdeskFilterVocab();
  const applied: Record<string, string> = {};
  const filters: FdTicketListFilters = {
    search: ask.search?.trim() || null, status: [], group: null, agent: null, category: null,
    priority: null, dateFrom: ask.created_from ?? null, dateTo: ask.created_to ?? null, member: null, page: 1,
  };

  if (ask.status) {
    const s = pickByName(vocab.statuses, (x) => x.label, ask.status);
    if (!s) return { ok: false, reason: 'unknown', field: 'status', asked: ask.status, choices: vocab.statuses.map((x) => x.label) };
    filters.status = [s.id]; applied.status = s.label;
  } else if (ask.only_open) {
    filters.status = vocab.statuses.map((x) => x.id).filter((id) => !FD_TERMINAL_STATUSES.includes(id));
    applied.status = 'every status except Resolved and Closed';
  }
  if (pin.pinned) {
    filters.group = pin.groupId;
    applied.group = vocab.groups.find((g) => g.id === pin.groupId)?.name ?? 'your queendom';
  } else if (ask.group) {
    const g = pickByName(vocab.groups, (x) => x.name, ask.group);
    if (!g) return { ok: false, reason: 'unknown', field: 'group', asked: ask.group, choices: vocab.groups.map((x) => x.name) };
    filters.group = g.id; applied.group = g.name;
  }
  if (ask.agent) {
    const a = pickByName(vocab.agents, (x) => x.name, ask.agent);
    if (!a) return { ok: false, reason: 'unknown', field: 'agent', asked: ask.agent, choices: vocab.agents.map((x) => x.name).slice(0, 60) };
    filters.agent = a.id; applied.agent = a.name;
  }
  if (ask.category) {
    const c = pickByName(vocab.categories, (x) => x, ask.category);
    if (!c) return { ok: false, reason: 'unknown', field: 'category', asked: ask.category, choices: vocab.categories };
    filters.category = c; applied.category = c;
  }
  if (filters.search) applied.search = filters.search;
  if (filters.dateFrom) applied.created_from = filters.dateFrom;
  if (filters.dateTo) applied.created_to = filters.dateTo;
  return { ok: true, filters, applied };
}

/** The /freshdesk overview strip for the ask: the SAME numbers the page shows for the same filters. */
export async function getFreshdeskOverviewFor(principal: StaffPrincipal, ask: FreshdeskAsk) {
  const f = await freshdeskFiltersFor(principal, ask);
  if (!f.ok) return f;
  const o = await getFreshdeskOverview(f.filters);
  return {
    ok: true as const,
    applied: f.applied,
    total: o.totalTickets,
    open: o.openTotal,
    created_today: o.createdToday,
    resolved_today: o.resolvedToday,
    escalated_open: o.escalatedOpen,
    by_status: o.byStatus.map((s) => ({ status: s.label, count: s.count })),
    mirror: { last_sync_at: o.sync.lastPollAt, last_sync_ok: o.sync.lastPollOk, last_webhook_at: o.sync.lastWebhookAt },
  };
}

const FD_TOOL_ROWS = 20;

/** The first rows of the /freshdesk list for the ask (most recently updated first) + the true total. */
export async function listFreshdeskTicketsFor(principal: StaffPrincipal, ask: FreshdeskAsk) {
  const f = await freshdeskFiltersFor(principal, ask);
  if (!f.ok) return f;
  const { tickets, totalCount } = await listFreshdeskTickets(f.filters);
  const now = Date.now();
  return {
    ok: true as const,
    applied: f.applied,
    total: totalCount,
    shown: Math.min(tickets.length, FD_TOOL_ROWS),
    tickets: tickets.slice(0, FD_TOOL_ROWS).map((t) => ({
      id: t.id,
      subject: clip(t.subject, 160),
      status: t.status_label ?? fdStatusLabel(t.status),
      priority: fdPriorityLabel(t.priority),
      category: t.category,
      sub_category: t.sub_category,
      group: t.group_name,
      agent: t.agent_name,
      requester: t.requester_name,
      member_id: t.member_id,
      created_at: t.fd_created_at,
      updated_at: t.fd_updated_at,
      due_by: t.due_by,
      overdue: Boolean(t.due_by && !FD_TERMINAL_STATUSES.includes(t.status) && new Date(t.due_by).getTime() < now),
      escalated: t.is_escalated,
      replies: t.conversation_count,
    })),
  };
}

const FD_THREAD_NOTES = 10;
const FD_THREAD_TEXT_CAP = 600;

/** One Freshdesk ticket: the fields, the last notes of the thread, the last movements. */
export async function getFreshdeskTicketFor(principal: StaffPrincipal, id: number) {
  const scope = await siaScopeFor(principal);
  if (!scope) return { ok: false as const, reason: 'no_access' as const };
  const d = await getFreshdeskTicketDetail(id);
  if (!d) return { ok: false as const, reason: 'not_found' as const };
  const pin = pinnedFreshdeskGroup(scope);
  // A pinned viewer learns nothing about another queendom's ticket, not even that it exists.
  if (pin.pinned && d.ticket.group_id !== pin.groupId) return { ok: false as const, reason: 'not_found' as const };
  const t = d.ticket;
  const notes = d.conversations.slice(-FD_THREAD_NOTES);
  return {
    ok: true as const,
    ticket: {
      id: t.id,
      subject: t.subject,
      description: clip(t.description_text, 1200),
      status: t.status_label ?? fdStatusLabel(t.status),
      priority: fdPriorityLabel(t.priority),
      type: t.ticket_type,
      category: t.category,
      sub_category: t.sub_category,
      tags: t.tags,
      group: d.group?.name ?? null,
      agent: d.agent?.name ?? null,
      requester: t.requester_name,
      member: d.member,
      created_at: t.fd_created_at,
      updated_at: t.fd_updated_at,
      due_by: t.due_by,
      first_responded_at: t.first_responded_at,
      resolved_at: t.resolved_at,
      closed_at: t.closed_at,
      escalated: t.is_escalated,
    },
    thread_total: d.conversations.length,
    thread: notes.map((c) => ({
      at: c.fd_created_at,
      from: c.incoming ? 'requester' : c.user_id != null ? (d.agentNames[c.user_id] ?? 'agent') : 'agent',
      private_note: c.private,
      text: clip(c.body_text, FD_THREAD_TEXT_CAP),
      files: c.attachments.length,
    })),
    movements: d.changes.slice(-12).map((m) => ({ at: m.fd_updated_at ?? m.observed_at, field: m.field, from: m.old_value, to: m.new_value })),
  };
}

// ── The books (Zoho, organisation-wide) ──

/** The /books overview, live from Zoho (5-minute Redis copy). Admin and founder only, like the page. */
export async function getBooksFor(principal: StaffPrincipal) {
  if (principal.role !== 'admin' && principal.role !== 'founder') return { denied: true as const };
  const b = await getBooksOverview();
  if (!b) return { unavailable: true as const };
  const inv = (i: (typeof b.overdueInvoices)[number]) => ({ number: i.invoice_number, customer: i.customer_name, date: i.date, due_date: i.due_date, status: i.status, total: i.total, balance: i.balance });
  return {
    org: b.org.name,
    currency: b.org.currency,
    receivables: b.receivables,
    payables: b.payables,
    cash: { banks: b.cash.banks, cards: b.cash.cards, clearing: b.cash.clearing, accounts: b.cash.accounts.slice(0, 12).map((a) => ({ name: a.account_name, type: a.account_type, balance: a.balance })) },
    this_month: b.thisMonth,
    financial_year_to_date: b.fyToDate,
    // Zoho's Banking queue: feed lines nobody has categorised (null = could not be read this time).
    uncategorised_bank_feed: b.uncategorised,
    overdue_invoices: b.overdueInvoices.slice(0, 10).map(inv),
    recent_invoices: b.recentInvoices.slice(0, 8).map(inv),
    recent_payments: b.recentPayments.slice(0, 8).map((p) => ({ date: p.date, customer: p.customer_name, amount: p.amount, mode: p.payment_mode, invoices: p.invoice_numbers })),
    fetched_at: b.fetchedAt,
  };
}

// ── Sia groups by the GROUP, not by a member ──

const SIA_GROUP_ROWS = 25;

// The model never sees a group_jid. A jid is a long digit run plus "@g.us", so the PII gateway
// (rightly) masks it as a phone/email, and the model then hands back "1•••@g.us": on 2026-09-19
// that made a 336-message group read as empty. The HANDLE is the same jid written in letters
// only (0-9 → a-j, "-" → x), which no masker touches and which decodes without a lookup.
const HANDLE_PREFIX = 'grp_';
const HANDLE_RE = /^grp_[a-jx]{5,48}$/;
const GROUP_JID_RE = /^[0-9-]{5,48}@g\.us$/;

export function siaGroupHandle(groupJid: string): string {
  const local = groupJid.replace(/@g\.us$/, '');
  return HANDLE_PREFIX + [...local].map((ch) => (ch === '-' ? 'x' : String.fromCharCode(97 + Number(ch)))).join('');
}

function jidFromHandle(handle: string): string | null {
  if (!HANDLE_RE.test(handle)) return null;
  const local = [...handle.slice(HANDLE_PREFIX.length)].map((ch) => (ch === 'x' ? '-' : String(ch.charCodeAt(0) - 97))).join('');
  const jid = `${local}@g.us`;
  return GROUP_JID_RE.test(jid) ? jid : null;
}

/** Words people add around a group's name that are never part of it. */
const GROUP_NAME_FILLER: ReadonlySet<string> = new Set(['group', 'groups', 'grp', 'whatsapp', 'wa', 'chat', 'chats', 'the', 'of', 'our', 'wala', 'wali', 'ka', 'ki', 'and']);
const nameWords = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter((w) => w.length >= 2 && !GROUP_NAME_FILLER.has(w));

type VisibleGroup = Awaited<ReturnType<typeof getSiaGroups>>[number];

async function visibleSiaGroups(scope: SiaViewerScope): Promise<VisibleGroup[]> {
  const groups = await getSiaGroups();
  if (scope.kind === 'all') return groups;
  const mine = await getQueendomGroupJids(scope.queendomId);
  return groups.filter((g) => mine.has(g.group_jid));
}

/** getSiaGroups falls back to "0 messages everywhere" when its activity query fails; never report that as fact. */
const activityKnown = (groups: VisibleGroup[]) => groups.some((g) => g.message_count > 0);

const groupCard = (g: VisibleGroup, known: boolean) => ({
  group: siaGroupHandle(g.group_jid),
  name: g.subject,
  kind: g.group_kind,
  linked_member_id: g.member_id,
  people: g.member_count,
  messages: known ? g.message_count : null,
  last_message_at: known ? g.last_message_at : null,
});

export type SiaGroupRef =
  | { ok: true; group: VisibleGroup; known: boolean }
  | { ok: false; reason: 'no_access' | 'not_found' }
  | { ok: false; reason: 'several'; candidates: ReturnType<typeof groupCard>[] };

/**
 * A group from what the model holds: the handle list_sia_groups gave it, or simply the NAME the
 * user said. Only groups the viewer may open are ever matched, so this is the access gate too.
 * Every name word must be in the group's name; one match opens it, several come back as choices.
 */
async function resolveSiaGroupFor(principal: StaffPrincipal, ref: string): Promise<SiaGroupRef> {
  const scope = await siaScopeFor(principal);
  if (!scope) return { ok: false, reason: 'no_access' };
  const groups = await visibleSiaGroups(scope);
  const known = activityKnown(groups);
  const jid = jidFromHandle(ref.trim());
  if (jid) {
    const g = groups.find((x) => x.group_jid === jid);
    return g ? { ok: true, group: g, known } : { ok: false, reason: 'not_found' };
  }
  const words = nameWords(ref);
  if (words.length === 0) return { ok: false, reason: 'not_found' };
  const subjectWords = (g: VisibleGroup) => new Set(nameWords(g.subject ?? ''));
  let hits = groups.filter((g) => { const sw = subjectWords(g); return words.every((w) => sw.has(w)); });
  if (hits.length === 0) hits = groups.filter((g) => { const s = (g.subject ?? '').toLowerCase(); return words.every((w) => s.includes(w)); });
  if (hits.length === 0) return { ok: false, reason: 'not_found' };
  if (hits.length === 1) return { ok: true, group: hits[0], known };
  return { ok: false, reason: 'several', candidates: hits.slice(0, 8).map((g) => groupCard(g, known)) };
}

/** The groups this viewer may open (their names matched loosely), newest activity first. */
export async function listSiaGroupsFor(
  principal: StaffPrincipal,
  opts: { search?: string | null; kind?: SiaGroupKind | null; unlinked_only?: boolean },
) {
  const scope = await siaScopeFor(principal);
  if (!scope) return { ok: false as const, reason: 'no_access' as const };
  const groups = await visibleSiaGroups(scope);
  const known = activityKnown(groups);
  const counts = { member: 0, vendor: 0, internal: 0, unmapped: 0, member_type_with_no_member: 0 };
  for (const g of groups) {
    counts[g.group_kind] += 1;
    if (g.group_kind === 'member' && !g.member_id) counts.member_type_with_no_member += 1;
  }
  const words = nameWords(opts.search ?? '');
  const hits = groups
    .filter((g) => !opts.kind || g.group_kind === opts.kind)
    .filter((g) => !opts.unlinked_only || !g.member_id)
    .filter((g) => words.every((w) => (g.subject ?? '').toLowerCase().includes(w)))
    .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
  return {
    ok: true as const,
    visible_groups: groups.length,
    counts,
    matched: hits.length,
    activity_known: known,
    groups: hits.slice(0, SIA_GROUP_ROWS).map((g) => groupCard(g, known)),
  };
}

/** The latest page of ONE group's chat (oldest → newest); `before` pages further back. */
export async function getSiaGroupMessagesFor(principal: StaffPrincipal, ref: string, opts: { before?: string } = {}) {
  const r = await resolveSiaGroupFor(principal, ref);
  if (!r.ok) return r;
  const page = await getSiaMessages(r.group.group_jid, { before: opts.before });
  const messages = await shapeMessages(page.messages);
  return { ok: true as const, group: groupCard(r.group, r.known), messages, has_more: page.hasMore, oldest_at: messages[0]?.at ?? null };
}

/** A topic across every group the viewer may open, or inside one of them (newest first). */
export async function searchSiaMessagesFor(principal: StaffPrincipal, query: string, related: string[], ref?: string) {
  const scope = await siaScopeFor(principal);
  if (!scope) return { ok: false as const, reason: 'no_access' as const };
  let groupJid: string | undefined;
  if (ref) {
    const r = await resolveSiaGroupFor(principal, ref);
    if (!r.ok) return r;
    groupJid = r.group.group_jid;
  }
  const words = buildSearchWords(query, related);
  if (words.length === 0) return { ok: true as const, hits: [], searched_for: [] };
  let hits = await searchSiaMessages(query, groupJid, words);
  if (scope.kind === 'queendom' && !groupJid) {
    const mine = await getQueendomGroupJids(scope.queendomId);
    hits = hits.filter((h) => mine.has(h.group_jid));
  }
  // The same sieve as the member search: a hit must hold at least one of the words as a whole word,
  // best matches first, capped so the result stays well under the tool cap (2026-09-21: 30 raw
  // hits of unrelated chatter overflowed it and the model read "nothing Nadal-related").
  hits = rankByWords(hits, (h) => h.text ?? '', words, 20);
  const shaped = await shapeMessages(hits);
  return { ok: true as const, searched_for: words, hits: hits.map((h, i) => ({ group: siaGroupHandle(h.group_jid), group_name: h.group_subject, ...shaped[i], text: clip(shaped[i].text, 220) })) };
}

// ─────────────────────────────────────────────
// Ask the database (0223) — founder and admin ONLY
//
// The model writes a SELECT over the cleaned `elaya_read` views. The database enforces what can
// be read (a role with no rights on any real table, a read-only transaction, a row cap); this
// gate decides WHO may ask. Every query is logged with who ran it and why.
// ─────────────────────────────────────────────

const mayQueryDatabase = (principal: StaffPrincipal) => principal.role === 'founder' || principal.role === 'admin';

export async function describeDatabaseFor(principal: StaffPrincipal) {
  if (!mayQueryDatabase(principal)) return { denied: true as const };
  const [views, sets] = await Promise.all([getElayaCatalog(), listLabelSets().catch(() => [])]);
  if (!views) return { unavailable: true as const };
  // The judgements deep reads have saved (0235): what each set means, how many rows carry it and
  // since when, so the model can count them with a query instead of reading again, and can tell a
  // window the labels cover from one they do not.
  const label_sets = sets.slice(0, 25).map((s) => ({
    label_set: s.label_set,
    subject_kind: s.subject_kind,
    rows_labelled: s.rows,
    first_labelled: s.first_at.slice(0, 10),
    last_labelled: s.last_at.slice(0, 10),
    counts: s.summary ?? s.question ?? null,
    labels: s.labels.map((l) => l.name),
    rows_covered: s.fetch_sql ? s.fetch_sql.slice(0, 240) : null,
  }));
  return { views, label_sets };
}

export async function queryDatabaseFor(principal: StaffPrincipal, sql: string, purpose: string | null, channel: ElayaChannel, maxRows?: number) {
  if (!mayQueryDatabase(principal)) return { denied: true as const };
  const result = await runElayaQuery(sql, maxRows);
  await logElayaQuery({ userId: principal.userId, channel, purpose, sql, result });
  return result;
}

/** The MCP connector's export: the same gate and log, up to ELAYA_EXPORT_MAX_ROWS rows (0231). */
export async function exportRowsFor(principal: StaffPrincipal, sql: string, purpose: string | null, channel: ElayaChannel, maxRows?: number) {
  if (!mayQueryDatabase(principal)) return { denied: true as const };
  const result = await runElayaQuery(sql, maxRows ?? ELAYA_EXPORT_MAX_ROWS, ELAYA_EXPORT_MAX_ROWS);
  await logElayaQuery({ userId: principal.userId, channel, purpose: `export: ${purpose ?? ''}`.trim(), sql, result });
  return result;
}

// ─────────────────────────────────────────────
// The live pulse — founder and admin only (it is company-wide: every domain, every queendom)
// ─────────────────────────────────────────────

export async function getLivePulseFor(principal: StaffPrincipal) {
  if (!mayQueryDatabase(principal)) return { denied: true as const };
  return { pulse: await getLivePulse() };
}

// ─────────────────────────────────────────────
// Member 360 — EVERYTHING Serene holds on one member, live, in one call (2026-09-19)
//
// The founder's ask: "when I ask about a client she should load all the data around the client,
// the latest, and then answer any twisted question from it". Before this the model picked one or
// two of five member tools from the wording of the question and answered from part of the
// picture. This composes the reads that already exist (no new business logic): the dossier, the
// latest chat, the money, and a few live rows from the cleaned views. Same queendom gate as every
// member read. The result is fitted under the tool result cap by trimming the long lists, never
// by dropping a section; the detailed tools remain for depth (older chat, topic search, full facts).
// ─────────────────────────────────────────────

const M360_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const M360_BUDGET_CHARS = 22_000; // get_member_360 carries maxResultChars 24,000; leave room for the note

export type Member360 =
  | { found: false; reason: 'not_found' }
  | { found: false; reason: 'outside_seat'; outside_seat: number }
  | { found: false; reason: 'several'; candidates: { member_id: string; name: string; tier: string | null; status: string | null }[] }
  | { found: true; data: Record<string, unknown>; trimmed: string[] };

export async function getMember360For(principal: StaffPrincipal, ref: string): Promise<Member360> {
  let memberId: string | null = null;
  if (M360_UUID_RE.test(ref.trim())) memberId = ref.trim();
  else {
    const { hits, outsideSeat } = await findMembersScopedFor(principal, ref);
    if (hits.length === 0) return outsideSeat > 0 ? { found: false, reason: 'outside_seat', outside_seat: outsideSeat } : { found: false, reason: 'not_found' };
    if (hits.length > 1) return { found: false, reason: 'several', candidates: hits.map((c) => ({ member_id: c.id, name: c.full_name, tier: c.tier, status: c.membership_status })) };
    memberId = hits[0].id;
  }

  // The profile read carries the queendom gate: null = no such member, or not theirs to see.
  const profile = await getMemberProfileFor(principal, memberId);
  if (!profile) return { found: false, reason: 'not_found' };

  const [chat, money, extras] = await Promise.all([
    getMemberMessagesFor(principal, memberId),
    getMemberFinanceFor(principal, memberId).catch(() => null),
    // memberId is a validated uuid (or came from our own members table): never model text.
    runElayaQuery(
      `select
         (select coalesce(jsonb_agg(j), '[]'::jsonb) from (select v.name as vendor, vj.title, vj.category, vj.city, vj.started_at, vj.outcome, vj.amount_inr
            from vendor_jobs vj join vendors v using (vendor_id) where vj.member_id = '${memberId}' order by vj.started_at desc nulls last limit 6) j) as vendor_jobs,
         (select count(*) from vendor_jobs where member_id = '${memberId}') as vendor_jobs_total,
         (select coalesce(jsonb_agg(t), '[]'::jsonb) from (select ticket_no, title, status, priority, category, resolve_due_at, created_at
            from sia_tickets where member_id = '${memberId}' and closed_at is null order by created_at desc limit 6) t) as sia_tickets_open,
         (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select kind, summary, tone, last_message_at from ticket_suggestions
            where member_id = '${memberId}' and status = 'open' order by last_message_at desc limit 4) x) as ticket_suggestions_open,
         (select coalesce(jsonb_agg(d), '[]'::jsonb) from (select deal_type, deal_category, deal_duration, deal_amount, won_at from deals
            where member_id = '${memberId}' and not archived order by won_at desc limit 4) d) as deals`,
      1,
    ),
  ]);

  // The live state of the conversation, from the same messages the model is shown.
  const msgs = chat?.messages ?? [];
  const real = msgs.filter((x) => !x.deleted && x.type !== 'system' && x.type !== 'reaction');
  const lastMember = [...real].reverse().find((x) => x.from === 'member' || x.from === 'other');
  const lastStaff = [...real].reverse().find((x) => x.from === 'staff');
  const last = real[real.length - 1];
  // "Ok" / "Noted" / "Thanks" closes a chat, it does not wait on us (intake's own rule, R-01).
  const lastIsAck = Boolean(last && isOnlyAcknowledgement([last.text ?? '']));
  const waitingOnUs = Boolean(last && last.from !== 'staff' && !lastIsAck && lastMember && (!lastStaff || lastStaff.at < lastMember.at));
  const x = extras.ok ? (extras.rows[0] ?? {}) : {};

  const data: Record<string, unknown> = {
    as_of: new Date().toISOString(),
    member: profile.member,
    team: profile.team,
    health: profile.health,
    conversation_now: {
      group: chat?.group_subject ?? null,
      last_member_message_at: lastMember?.at ?? null,
      last_staff_message_at: lastStaff?.at ?? null,
      last_word_is: last ? (last.from === 'staff' ? 'ours' : "the member's side") : null,
      waiting_on_us: waitingOnUs,
    },
    recent_messages: msgs.slice(-25).map((m) => ({ at: m.at, from: m.from, name: m.name, text: clip(m.text, 220), type: m.type === 'text' ? undefined : m.type })),
    older_messages_available: chat?.has_more ?? false,
    freshdesk_requests: profile.requests,
    sia_tickets_open: x.sia_tickets_open ?? [],
    ticket_suggestions_open: x.ticket_suggestions_open ?? [],
    coming_up: profile.coming_up,
    facts: profile.facts,
    facts_shown: profile.facts_shown,
    facts_total: profile.facts_total,
    people: profile.people,
    relations: profile.relations,
    timeline: profile.timeline,
    observations: profile.observations,
    vendor_jobs: { total: Number(x.vendor_jobs_total ?? 0), latest: x.vendor_jobs ?? [] },
    deals: x.deals ?? [],
    money: !money ? null : 'denied' in money ? 'not visible to your role'
      : 'totals' in money ? { linked: true, currency: 'INR', totals: money.totals, unpaid_invoices: (money.unpaid_invoices ?? []).slice(0, 6), latest_payments: (money.latest_payments ?? []).slice(0, 4), fetched_at: money.fetched_at }
      : money,
  };

  // Fit under the cap by shortening the long lists, newest and most confident kept. Never a section dropped.
  const trimmed: string[] = [];
  const size = () => JSON.stringify(data).length;
  const cut = (key: string, to: number, fromEnd = false) => {
    const v = data[key];
    if (Array.isArray(v) && v.length > to) { data[key] = fromEnd ? v.slice(-to) : v.slice(0, to); if (!trimmed.includes(key)) trimmed.push(key); }
  };
  const cutFacts = (perFacet: number) => {
    const f = data.facts as Record<string, unknown[]>;
    for (const k of Object.keys(f)) if (f[k].length > perFacet) { f[k] = f[k].slice(0, perFacet); if (!trimmed.includes('facts')) trimmed.push('facts'); }
  };
  const steps: (() => void)[] = [
    () => cutFacts(6), () => cut('timeline', 8), () => cut('relations', 8), () => cut('recent_messages', 18, true),
    () => cutFacts(4), () => cut('observations', 4), () => cut('people', 10), () => cut('recent_messages', 12, true),
    () => cut('timeline', 5), () => cutFacts(3), () => cut('relations', 4), () => cut('coming_up', 5), () => cut('recent_messages', 8, true),
    () => { const r = data.freshdesk_requests as { open: unknown[]; recent: unknown[] }; r.open = r.open.slice(0, 5); r.recent = r.recent.slice(0, 3); trimmed.push('freshdesk_requests'); },
    () => cutFacts(2),
  ];
  for (const step of steps) { if (size() <= M360_BUDGET_CHARS) break; step(); }
  return { found: true, data, trimmed };
}

// ─────────────────────────────────────────────
// Three areas Elaya could not read before 2026-09-19: the lead WhatsApp line, subscriptions,
// the live activity feed. Each mirrors the page's own access rule, in code.
// ─────────────────────────────────────────────

const LEAD_CHAT_TEXT_CAP = 300;

/** The official WhatsApp thread with a LEAD (not a member group). Gate = canAccessLead, the leads rule. */
export async function getLeadWhatsAppChatFor(principal: StaffPrincipal, leadRef: string, limit = 40) {
  const lead = await getLeadByRefForElaya(leadRef);
  if (!lead || !canAccessLead(principal, lead)) return { ok: false as const, reason: 'not_found' as const };
  const thread = await getLeadWhatsAppThreadForElaya(lead.id, limit);
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'this lead';
  if (!thread) return { ok: true as const, lead: { id: lead.id, name, slug: lead.slug, status: lead.status, domain: lead.domain }, conversation: null, messages: [], total: 0 };
  const c = thread.conversation;
  return {
    ok: true as const,
    lead: { id: lead.id, name, slug: lead.slug, status: lead.status, domain: lead.domain },
    conversation: { status: c.status, bot_active: c.bot_active, last_message_at: c.last_message_at },
    total: thread.total,
    messages: thread.messages.map((m) => ({
      at: m.created_at,
      from: m.direction === 'inbound' ? 'lead' : m.is_bot ? 'elaya' : 'staff',
      name: m.direction === 'inbound' ? name : m.is_bot ? 'Elaya' : (m.sender_name ?? 'staff'),
      type: m.message_type === 'text' ? undefined : m.message_type,
      text: clip(m.content, LEAD_CHAT_TEXT_CAP),
      status: m.status,
    })),
  };
}

const SUBSCRIPTION_DOMAINS: readonly AppDomain[] = ['finance', 'tech'];
const maySeeSubscriptions = (p: StaffPrincipal) => p.role === 'admin' || p.role === 'founder' || SUBSCRIPTION_DOMAINS.includes(p.domain);

/** The Subscriptions & Bills tracker, the RLS rule in code: admin/founder, or the finance/tech domains. Never a login or password. */
export async function getSubscriptionsFor(principal: StaffPrincipal, opts: { search?: string | null; include_archived?: boolean }) {
  if (!maySeeSubscriptions(principal)) return { denied: true as const };
  const rows = await getSubscriptionsForElaya({ search: opts.search ?? undefined, archived: opts.include_archived ? true : false });
  return {
    count: rows.length,
    subscriptions: rows.map((r) => ({
      id: r.id, name: r.name, tool: r.toolName, type: r.type, departments: r.departments, currency: r.currency, amount: r.amount,
      status: r.status, days_overdue: r.daysOverdue, current_due_date: r.currentDueDate, due_day: r.due_day,
      latest_paid_inr: r.latestPaidInr, latest_paid_at: r.latestPaidAt, archived: r.is_archived, notes: clip(r.notes, 200),
    })),
  };
}

const FEED_SHOWN = 40;

/** The live activity feed. admin/founder: any or every Gia domain; manager: pinned to their own; agents: nothing. */
export async function getActivityFeedFor(principal: StaffPrincipal, opts: { domain?: string | null; hours?: number | null }) {
  const privileged = principal.role === 'admin' || principal.role === 'founder';
  if (!privileged && principal.role !== 'manager') return { denied: true as const };
  const asked = (opts.domain ?? '').toLowerCase();
  const domains: GiaDomain[] = privileged
    ? (GIA_DOMAINS as readonly string[]).includes(asked) ? [asked as GiaDomain] : [...GIA_DOMAINS]
    : (GIA_DOMAINS as readonly string[]).includes(principal.domain) ? [principal.domain as GiaDomain] : [];
  if (domains.length === 0) return { domains: [], events: [] };
  const pages: ActivityFeedResult[] = await Promise.all(domains.map((d) => getActivityFeed(d)));
  const since = opts.hours ? Date.now() - opts.hours * 3_600_000 : null;
  const events = pages.flatMap((p) => p.items)
    .filter((e) => !since || new Date(e.created_at).getTime() >= since)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, FEED_SHOWN);
  const actorIds = [...new Set(events.map((e) => e.actor_id).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data } = await createAdminClient().from('profiles').select('id, full_name').in('id', actorIds);
    mapRows<{ id: string; full_name: string }, void>(data, (r) => { names.set(r.id, r.full_name); });
  }
  return {
    domains,
    events: events.map((e) => ({ at: e.created_at, domain: e.domain, who: e.actor_id ? (names.get(e.actor_id) ?? null) : null, event: e.event_type, about: e.subject_type, title: e.title })),
  };
}

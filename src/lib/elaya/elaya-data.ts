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
import { rankVendorsForRequest, getVendorDetail } from '@/lib/services/vendors-service';
import { listTicketsForElaya, getTicketByRefForElaya } from '@/lib/services/tickets-service';
import { getSiaGroupForMember, getSiaGroups, getSiaMessages, searchSiaMessages, getSiaSenderRoles, type SiaGroupKind } from '@/lib/services/sia-service';
import { getSiaViewerScope, getQueendomGroupJids, canViewSiaGroup, pinnedFreshdeskGroup, type SiaViewerScope } from '@/lib/services/sia-access';
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

export function rankVendors(req: RankVendorsRequest) {
  return rankVendorsForRequest(req);
}

export function getVendor(id: string) {
  return getVendorDetail(id);
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
    const from: MemberMessage['from'] =
      who?.role === 'member' ? 'member' : who && (who.is_staff || STAFF_ROLES.has(who.role)) ? 'staff' : 'other';
    const text = r.text && r.text.length > MESSAGE_TEXT_CAP ? r.text.slice(0, MESSAGE_TEXT_CAP) + '…' : r.text;
    return { at: r.wa_timestamp, from, name: r.sender_name, type: r.type, text, deleted: r.is_revoked };
  });
}

/** Members whose name (or phone digits) match, filtered to what the principal may see. */
export async function findMembersFor(principal: StaffPrincipal, query: string, limit = 8): Promise<MemberBrief[]> {
  const token = query.trim().replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (token.length < 2) return [];
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
  return rows.filter((c) => canAccessMember({ role: principal.role, queendom_id }, c.queendom_id));
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
  // Letters, digits and spaces only: these words go into a PostgREST `or=` filter and a tsquery.
  const tidy = (t: string) => t.replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  // The caller's own `related` words are trusted at 3 letters ("goa", "spa"); words split out of the
  // query must be 4+ and not filler, or "eating out" would match every "about" and "checkout".
  const words = [...new Set([
    tidy(query),
    ...tidy(query).split(' ').filter((w) => w.length >= 4 && !SEARCH_FILLER.has(w)),
    ...related.map(tidy).filter((w) => w.length >= 3 && !SEARCH_FILLER.has(w)),
  ].filter((w) => w.length >= 3))].slice(0, 14);
  if (words.length === 0) return { member: brief.member, group_subject: brief.group?.subject ?? null, conversations: [], facts: [], hits: [], searched_for: [] };
  const admin = createAdminClient();
  const like = (col: string) => words.map((w) => `${col}.ilike.*${w}*`).join(',');
  const [events, facts, rows] = await Promise.all([
    memberDb(admin).from('member_events').select('occurred_at, summary, tone').eq('member_id', clientId).eq('source', 'whatsapp_group').or(like('summary')).order('occurred_at', { ascending: false }).limit(80),
    memberDb(admin).from('member_facts').select('facet, key, value, polarity, created_at').eq('member_id', clientId).is('superseded_by', null).or(`${like('value')},${like('key')}`).order('confidence', { ascending: false }).limit(60),
    brief.group ? searchSiaMessages(query, brief.group.group_jid, words) : Promise.resolve([]),
  ]);
  // Best match first: how many of the words a row really holds, as WHOLE words (the database's
  // ILIKE is a substring net; this is the sieve). A row holding none as a whole word is dropped.
  const res = words.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu'));
  const score = (text: string) => res.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  const ranked = <T,>(list: T[], text: (r: T) => string, keep: number): T[] =>
    list.map((r, i) => ({ r, i, n: score(text(r)) })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n || x.i - y.i).slice(0, keep).map((x) => x.r);
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
    observations: d.notes.slice(0, 8).map((n) => ({ at: n.observed_at, by: n.created_by_name, text: clip(n.value, 400) })),
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
    overdue_invoices: b.overdueInvoices.slice(0, 10).map(inv),
    recent_invoices: b.recentInvoices.slice(0, 8).map(inv),
    recent_payments: b.recentPayments.slice(0, 8).map((p) => ({ date: p.date, customer: p.customer_name, amount: p.amount, mode: p.payment_mode, invoices: p.invoice_numbers })),
    fetched_at: b.fetchedAt,
  };
}

// ── Sia groups by the GROUP, not by a member ──

const SIA_GROUP_ROWS = 25;

/** The groups this viewer may open (their names matched loosely), newest activity first. */
export async function listSiaGroupsFor(
  principal: StaffPrincipal,
  opts: { search?: string | null; kind?: SiaGroupKind | null; unlinked_only?: boolean },
) {
  const scope = await siaScopeFor(principal);
  if (!scope) return { ok: false as const, reason: 'no_access' as const };
  let groups = await getSiaGroups();
  if (scope.kind === 'queendom') {
    const mine = await getQueendomGroupJids(scope.queendomId);
    groups = groups.filter((g) => mine.has(g.group_jid));
  }
  const counts = { member: 0, vendor: 0, internal: 0, unmapped: 0, member_type_with_no_member: 0 };
  for (const g of groups) {
    counts[g.group_kind] += 1;
    if (g.group_kind === 'member' && !g.member_id) counts.member_type_with_no_member += 1;
  }
  const words = (opts.search ?? '').toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
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
    groups: hits.slice(0, SIA_GROUP_ROWS).map((g) => ({
      group_jid: g.group_jid,
      name: g.subject,
      kind: g.group_kind,
      linked_member_id: g.member_id,
      people: g.member_count,
      messages: g.message_count,
      last_message_at: g.last_message_at,
    })),
  };
}

/** The latest page of ONE group's chat (oldest → newest); `before` pages further back. */
export async function getSiaGroupMessagesFor(principal: StaffPrincipal, groupJid: string, opts: { before?: string } = {}) {
  const scope = await siaScopeFor(principal);
  if (!scope || !(await canViewSiaGroup(scope, groupJid))) return null;
  const page = await getSiaMessages(groupJid, { before: opts.before });
  const messages = await shapeMessages(page.messages);
  return { messages, has_more: page.hasMore, oldest_at: messages[0]?.at ?? null };
}

/** A topic across every group the viewer may open, or inside one of them (newest first). */
export async function searchSiaMessagesFor(principal: StaffPrincipal, query: string, related: string[], groupJid?: string) {
  const scope = await siaScopeFor(principal);
  if (!scope) return null;
  if (groupJid && !(await canViewSiaGroup(scope, groupJid))) return null;
  let hits = await searchSiaMessages(query, groupJid, related);
  if (scope.kind === 'queendom' && !groupJid) {
    const mine = await getQueendomGroupJids(scope.queendomId);
    hits = hits.filter((h) => mine.has(h.group_jid));
  }
  const shaped = await shapeMessages(hits);
  return hits.slice(0, 30).map((h, i) => ({ group_jid: h.group_jid, group: h.group_subject, ...shaped[i] }));
}

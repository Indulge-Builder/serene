// Elaya read-only tool registry — the ONLY tools the foundation exposes.
//
// Contracts (sign-off requirements — never weaken):
//   1. Tools execute AS THE CALLER. Identity args (userId/role/domain) passed to
//      services are always principal-derived; the model supplies filter values
//      only. Authorization is the tool layer + service scoping + RLS — never
//      prompt-only.
//   2. No direct table queries here. Every tool wraps an existing lib/services
//      function (A-03 / R-01) — wrap, never re-query.
//   3. Every tool result passes the PII gateway (maskPii) before serialization.
//   4. A tool name outside the principal's toolset is refused at dispatch.
//
// Adding a READ tool: define schema + run() below, add to TOOL_REGISTRY, add the name
// to the role toolsets it belongs to. WRITE tools live in a separate module
// (write-registry.ts) — never add a mutating tool here. This file owns the SINGLE
// dispatch path (executeTool): it consults both the read registry below and the write
// registry, so the brain has one entry point and one masking/truncation/try-catch path.

import { z } from 'zod';
import type { ElayaPrincipal } from '@/lib/elaya/principal';
import { maskPii } from '@/lib/elaya/pii';
import type { PiiMaskingDepth } from '@/lib/services/llm-providers-service';
import type { LlmToolDefinition } from '@/lib/elaya/provider';
import {
  WRITE_TOOL_REGISTRY,
  writeToolsForRole,
  type ElayaWriteToolName,
  type WriteToolContext,
} from '@/lib/elaya/tools/write-registry';
// THE single data seam for every Elaya read (Phase 1 parity rule, see
// src/lib/elaya/CLAUDE.md). Tools call elayaData.* ONLY — never a *-service.ts function
// directly — so every read is principal-scoped + admin-client + channel-agnostic by
// construction. A tool that reaches past this module can re-introduce a login-session
// dependency that blanks on WhatsApp; do not do it.
import * as elayaData from '@/lib/elaya/elaya-data';
import { LEAD_STATUSES } from '@/lib/constants/lead-statuses';
import { COLD_LEAD_THRESHOLD_DAYS } from '@/lib/constants/leads';
import { DEAL_TYPE_ENUM, DEAL_CATEGORY_ENUM } from '@/lib/constants/deal-types';
import { DEFAULT_GIA_DOMAIN, isGiaDomain } from '@/lib/constants/domains';
import type { UserRole } from '@/lib/types';
import type { LeadStatus } from '@/lib/types/database';
import type { LeadWithAssignee } from '@/lib/services/leads-service';
import type { ElayaChannel } from '@/lib/types/elaya';

const TOOL_RESULT_MAX_CHARS = 12_000;

const PERIODS = ['today', 'this_week', 'this_month', 'last_month'] as const;

// ─────────────────────────────────────────────
// Tool shape
// ─────────────────────────────────────────────

export type ElayaReadToolName =
  | 'search_leads'
  | 'get_cold_leads'
  | 'get_lead_details'
  | 'get_my_tasks'
  | 'search_deals'
  | 'get_performance_snapshot'
  | 'get_helpdesk_content'
  // Phase 4 — manager oversight (manager+) + founder business (admin/founder)
  | 'get_escalations'
  | 'get_domain_health'
  | 'get_campaigns'
  | 'get_budget';

/** Every tool name the principal may carry — read tools (this file) + write tools. */
export type ElayaToolName = ElayaReadToolName | ElayaWriteToolName;

type ElayaTool = {
  name: ElayaReadToolName;
  /** Roles permitted to SEE the tool (toolset membership is the hard gate — the model
   *  never receives a tool outside the principal's role set). Defaults to all staff. */
  roles?: readonly UserRole[];
  description: string;
  schema: z.ZodTypeAny;
  /** JSON Schema mirror of `schema` — handed to the provider adapter. */
  jsonSchema: Record<string, unknown>;
  // `channel` is threaded so a tool can react to the sessionless WhatsApp context
  // (e.g. tools whose backing query needs auth.uid() must use a principal-scoped
  // admin path or refer the user to the app — H1). Defaults to in_app at the seam.
  run: (
    principal: ElayaPrincipal,
    input: Record<string, unknown>,
    channel: ElayaChannel,
  ) => Promise<unknown>;
};

// ─────────────────────────────────────────────
// Per-resource access check (mirrors the leads.ts action-layer hasAccess
// pattern). getLeadBySlug serves from a shared Redis row cache, so the tool
// layer re-verifies access explicitly — RLS alone is not the only gate here.
// ─────────────────────────────────────────────

function canAccessLead(principal: ElayaPrincipal, lead: LeadWithAssignee): boolean {
  if (principal.role === 'admin' || principal.role === 'founder') return true;
  if (principal.role === 'manager') return lead.domain === principal.domain;
  if (principal.role === 'agent') return lead.assigned_to === principal.userId;
  return false;
}

// Role sets for the Phase-4 read tools (the toolset assembly is the hard gate).
const MANAGER_UP: readonly UserRole[] = ['manager', 'admin', 'founder'];
const FOUNDER_UP: readonly UserRole[] = ['admin', 'founder'];

// Date-range periods these tools accept (reuse the performance vocabulary).
const OVERSIGHT_PERIODS = ['this_week', 'this_month', 'last_month'] as const;

// ─────────────────────────────────────────────
// Tools
// ─────────────────────────────────────────────

const searchLeads: ElayaTool = {
  name: 'search_leads',
  description:
    'Search the leads the current user is allowed to see (agents: own assigned leads; managers: their domain). ' +
    'Call this when the user asks about their leads, pipeline, or a lead by name/phone fragment. ' +
    'Returns a compact page of leads plus status counts for the full filtered set.',
  schema: z.object({
    search: z.string().trim().max(120).optional(),
    statuses: z.array(z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]])).max(10).optional(),
    page: z.number().int().min(1).max(50).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Name, phone, email or city fragment' },
      statuses: {
        type: 'array',
        items: { type: 'string', enum: [...LEAD_STATUSES] },
        description: 'Filter by lead statuses',
      },
      page: { type: 'integer', minimum: 1, description: 'Page number (30 per page)' },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { search, statuses, page } = input as {
      search?: string; statuses?: LeadStatus[]; page?: number;
    };
    // A 1-2 char search degrades the pg_trgm path (the GIN index needs ≥3 chars to
    // be selective) and matches half the table — treat it as no search rather than
    // run the degraded scan. The model should send a fuller name fragment.
    const term = search && search.trim().length >= 3 ? search.trim() : null;
    // Signal a too-short term explicitly so the model asks for more instead of
    // silently presenting an unfiltered listing as "your search results".
    const searchTooShort = !!search && search.trim().length > 0 && search.trim().length < 3;
    // Identity args are principal-derived — searchLeadsForElaya enforces the role
    // constraint UNCONDITIONALLY in code (agents see only own assigned leads;
    // managers only their domain), so it works in the sessionless WhatsApp context
    // where the cookie-based session client would return zero rows. The model
    // supplies filter values only, never identity.
    const PAGE_SIZE = 30;
    const currentPage = page ?? 1;
    const result = await elayaData.searchLeads(principal, {
      search: term,
      statuses: statuses ?? null,
      page: currentPage,
      pageSize: PAGE_SIZE,
    });
    // totalCount/statusCounts are now the TRUE full-set figures (H2). This page
    // holds at most PAGE_SIZE rows — tell the model so it never presents the page
    // as the whole answer ("you have 30 leads" when there are 120).
    const hasMore = currentPage * PAGE_SIZE < result.totalCount;

    // Owner hint (agents only): a scoped search returns nothing because an agent
    // only sees their OWN assigned leads — but the lead may well exist in their
    // domain, owned by a teammate. When that's the case, name the owner so Elaya
    // can say "that lead is X's — ask a manager to reassign" instead of implying
    // it doesn't exist. This is a READ-ONLY domain lookup that surfaces a name only
    // (no slug/id/phone) — it never widens what the agent can ACT on (the write
    // tools' canAccessLead gate is unchanged).
    let ownedByTeammate: { name: string; owner: string }[] | undefined;
    if (
      principal.role === 'agent' &&
      result.leads.length === 0 &&
      term
    ) {
      ownedByTeammate = await elayaData.findOwnersInDomain(principal, term);
      if (ownedByTeammate.length === 0) ownedByTeammate = undefined;
    }

    return {
      totalCount: result.totalCount,
      statusCounts: result.statusCounts,
      page: currentPage,
      pageSize: PAGE_SIZE,
      shownThisPage: result.leads.length,
      hasMore,
      // The term was too short to filter on — these are the user's recent leads, NOT
      // search matches. Ask for a fuller name/phone rather than presenting them as hits.
      ...(searchTooShort
        ? { searchTooShort: true, note: 'The search term was too short to match on — showing recent leads instead. Ask the user for the full name or phone number.' }
        : {}),
      leads: result.leads.map((l) => ({
        // leadId is the STABLE opaque handle the write tools target (UUID-or-slug
        // accepted). Surfaced like get_my_tasks' taskId; the PII gateway's UUID
        // guard keeps it intact through masking. Prefer it over slug for writes.
        leadId: l.id,
        name: [l.first_name, l.last_name].filter(Boolean).join(' '),
        slug: l.slug,
        status: l.status,
        phone: l.phone,
        source: l.source,
        campaign: l.utm_campaign,
        callCount: l.call_count,
        lastCallOutcome: l.last_call_outcome,
        createdAt: l.created_at,
        assignee: l.assignee?.full_name ?? null,
        latestNote: l.latest_note?.content ?? null,
      })),
      ...(ownedByTeammate
        ? {
            note:
              'No leads matching that are assigned to this agent. The following matching ' +
              'leads exist in their domain but belong to a teammate — the agent cannot act ' +
              'on these; tell them who owns it and suggest asking a manager to reassign.',
            ownedByTeammate,
          }
        : {}),
    };
  },
};

const getColdLeads: ElayaTool = {
  name: 'get_cold_leads',
  description:
    'List the user’s leads that are going cold — non-terminal leads (not won/lost/junk) with no ' +
    `activity for over ${COLD_LEAD_THRESHOLD_DAYS} days, coldest first. ` +
    'Call this when the user asks which of their leads are going cold, stale, dormant, or need ' +
    'attention. This is the SAME definition as the /leads going-cold view — do NOT improvise it ' +
    'from search_leads (which has no recency filter).',
  schema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: async (principal) => {
    // Identity-derived scope (the per-caller contract — mirrors searchLeadsForElaya
    // and canAccessLead): agent → own assigned leads only; manager → own domain;
    // admin/founder → all domains. The model supplies NO scope (empty schema) — the
    // principal drives it inside elayaData.getColdLeads.
    const cold = await elayaData.getColdLeads(principal);
    return {
      thresholdDays: COLD_LEAD_THRESHOLD_DAYS,
      totalCount: cold.length,
      leads: cold.map((l) => ({
        name: l.name,
        slug: l.slug,
        status: l.status,
        phone: l.phone,
        domain: l.domain,
        assignee: l.assigneeName,
        lastActivityAt: l.lastActivityAt,
      })),
    };
  },
};

const getLeadDetails: ElayaTool = {
  name: 'get_lead_details',
  description:
    'Fetch one lead by its leadId (from search_leads results) with its 5 most recent notes. ' +
    'Refuses leads the current user is not permitted to see.',
  schema: z.object({ leadId: z.string().trim().min(1).max(160) }),
  jsonSchema: {
    type: 'object',
    properties: { leadId: { type: 'string', description: 'The lead id or slug (from search_leads results)' } },
    required: ['leadId'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { leadId } = input as { leadId: string };
    // Admin-client read (works in the sessionless WhatsApp context); the
    // canAccessLead gate below is the per-resource trust boundary — it re-checks
    // role/domain/assignment on the principal, so the broad read is safe. The ref
    // is a UUID or a slug (getLeadByRefForElaya resolves both).
    const lead = await elayaData.getLeadByRef(leadId);
    if (!lead || !canAccessLead(principal, lead)) {
      // One message for both not-found and not-permitted (S-09 principle).
      return { error: 'Lead not found or you are not permitted to view it.' };
    }
    const notes = await elayaData.getLeadNotes(lead.id);
    return {
      lead: {
        name: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
        slug: lead.slug,
        status: lead.status,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        domain: lead.domain,
        source: lead.source,
        campaign: lead.utm_campaign,
        serviceInterests: lead.service_interests,
        callCount: lead.call_count,
        lastCallOutcome: lead.last_call_outcome,
        assignee: lead.assignee?.full_name ?? null,
        createdAt: lead.created_at,
        statusChangedAt: lead.status_changed_at,
        lastActivityAt: lead.last_activity_at,
      },
      recentNotes: notes.slice(0, 5).map((n) => ({
        content: n.content,
        author: n.author?.full_name ?? null,
        createdAt: n.created_at,
      })),
    };
  },
};

const getMyTasks: ElayaTool = {
  name: 'get_my_tasks',
  description:
    'The current user’s open work across all three kinds: Gia lead follow-up tasks (managers see ' +
    'their domain’s), personal tasks, and group/team task workspaces. ' +
    'Call when the user asks what to do next, what is due, about follow-ups, or about team/group work.',
  schema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: async (principal) => {
    // All three reads go through the Elaya data layer → admin-client + principal-scoped,
    // so they return real data on BOTH in-app and WhatsApp (parity rule). The old
    // WhatsApp "group tasks not available, open the app" fallback is gone — group tasks
    // now work everywhere via the explicit-param twin (migration 0149).
    const [giaTasks, personal, groups] = await Promise.all([
      elayaData.getGiaTasks(principal),
      elayaData.getPersonalTasksFor(principal, 20),
      elayaData.getGroupTasksFor(principal),
    ]);
    // taskId / groupId are surfaced DELIBERATELY (Brief 3): they are the handle the
    // write tools (update_task_status / update_task / delete_task) target. Without an
    // id the model cannot name a task to act on. The id is an opaque caller-scoped
    // UUID; the row is already one this principal is permitted to see.
    const GIA_CAP = 25;
    const GROUP_CAP = 25;
    // If a list hit its cap, say so (instead of silently presenting the slice as the
    // whole list) so the model can offer to narrow / point to the Tasks page.
    const truncatedKinds: string[] = [];
    if (giaTasks.length > GIA_CAP) truncatedKinds.push('lead follow-ups');
    if (groups.length > GROUP_CAP) truncatedKinds.push('group workspaces');
    return {
      followUps: giaTasks.slice(0, GIA_CAP).map((t) => ({
        taskId: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueAt: t.due_at,
        taskType: t.task_type,
        leadName: [t.lead_first_name, t.lead_last_name].filter(Boolean).join(' ') || null,
        leadSlug: t.lead_slug,
        leadPhone: t.lead_phone,
      })),
      personalTasks: personal.tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueAt: t.due_at,
        tags: t.tags,
      })),
      // Cap group tasks like followUps (25) and personalTasks (20) already are —
      // an unbounded list would be the one collection that could blow the 12k
      // result ceiling and get blunt-truncated mid-JSON as group workspaces grow.
      groupTasks: groups.slice(0, GROUP_CAP).map((g) => ({
        groupId: g.id,
        title: g.title,
        status: g.status,
        priority: g.priority,
        dueAt: g.due_at,
        subtaskCount: g.subtask_count,
        completedCount: g.completed_count,
      })),
      ...(truncatedKinds.length > 0
        ? { note: `Showing the first ${GIA_CAP} of more ${truncatedKinds.join(' and ')} — tell the user there are more in the Tasks page if they need the full list.` }
        : {}),
    };
  },
};

const searchDeals: ElayaTool = {
  name: 'search_deals',
  description:
    'Search closed deals the current user is allowed to see (agents: own; managers: their domain). ' +
    'Call for questions about revenue, wins, memberships or retail sales.',
  schema: z.object({
    search: z.string().trim().max(120).optional(),
    deal_type: z.enum(DEAL_TYPE_ENUM).optional(),
    deal_category: z.enum(DEAL_CATEGORY_ENUM).optional(),
    page: z.number().int().min(1).max(50).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Contact name or phone fragment' },
      deal_type: { type: 'string', enum: [...DEAL_TYPE_ENUM] },
      deal_category: { type: 'string', enum: [...DEAL_CATEGORY_ENUM], description: 'Retail product category (shop deals only)' },
      page: { type: 'integer', minimum: 1, description: 'Page number (20 per page)' },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { search, deal_type, deal_category, page } = input as {
      search?: string; deal_type?: string; deal_category?: string; page?: number;
    };
    // Through the Elaya data layer (admin client + principal scope) → works on both
    // channels. Role scoping is the same explicit .eq() filters; identity is principal-derived.
    const result = await elayaData.searchDeals(principal, {
      search: search ?? null,
      domain: null,
      deal_type: deal_type ?? null,
      deal_category: deal_category ?? null,
      agent_id: null,
      date_from: null,
      date_to: null,
      page: page ?? 1,
      pageSize: 20,
    });
    return {
      totalCount: result.totalCount,
      deals: result.deals.map((d) => ({
        contactName: d.contact_name,
        amount: d.deal_amount,
        dealType: d.deal_type,
        duration: d.deal_duration,
        category: d.deal_category,
        domain: d.domain,
        source: d.source,
        wonAt: d.won_at,
        assignee: d.assignee?.full_name ?? null,
        leadSlug: d.lead?.slug ?? null,
      })),
    };
  },
};

const getPerformanceSnapshot: ElayaTool = {
  name: 'get_performance_snapshot',
  description:
    'Performance numbers for a period. Agents get their own pulse (calls today, 14-day call trend, deals). ' +
    'Managers and above get the per-agent roster for their scope.',
  schema: z.object({ period: z.enum(PERIODS).optional() }),
  jsonSchema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: [...PERIODS], description: 'Defaults to this_week' },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const period = ((input as { period?: (typeof PERIODS)[number] }).period) ?? 'this_week';

    // Through the Elaya data layer (admin-client explicit-param twins, migration 0149)
    // → real numbers on BOTH in-app and WhatsApp. The old WhatsApp "open the app"
    // fallback is gone — the pulse + roster work everywhere now (parity rule).
    if (principal.role === 'agent') {
      const pulse = await elayaData.getAgentPulse(principal, period);
      return { view: 'agent_pulse', period, ...pulse };
    }
    // Manager → own domain; admin/founder → all (the data layer clamps it).
    const roster = await elayaData.getRoster(principal, period);
    // Graceful top-N cap, NOT blunt 12k-char string truncation. The roster is
    // sorted top-performer-first, so a raw truncation would drop the LAGGARDS —
    // exactly the rows a "who is behind" question needs. Cap with intent and
    // tell the model how many were omitted so coverage questions stay answerable.
    const ROSTER_CAP = 40;
    const shown = roster.slice(0, ROSTER_CAP);
    return {
      view: 'roster',
      period,
      agents: shown,
      ...(roster.length > ROSTER_CAP
        ? { note: `Showing ${ROSTER_CAP} of ${roster.length} agents. Ask to narrow by domain or period for the rest.` }
        : {}),
    };
  },
};

const getHelpdeskContent: ElayaTool = {
  name: 'get_helpdesk_content',
  description:
    'Call Intelligence library: proof-point service cases and conversation hooks for the user’s domain. ' +
    'Call when the user wants talking points, case studies, or help pitching a service interest or city.',
  schema: z.object({
    interests: z.array(z.string().trim().toLowerCase().max(60)).max(6).optional(),
    city: z.string().trim().max(60).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      interests: {
        type: 'array',
        items: { type: 'string' },
        description: 'Service-interest slugs (e.g. from a lead’s serviceInterests)',
      },
      city: { type: 'string', description: 'City to match case tags against' },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { interests, city } = input as { interests?: string[]; city?: string };
    // Non-Gia callers have no library of their own, so they read the onboarding one —
    // surface sourceDomain so the model can label cross-domain material (the "always
    // label the source domain" rule) instead of implying it's the user's own.
    const remapped = !isGiaDomain(principal.domain);
    const domain = remapped ? DEFAULT_GIA_DOMAIN : principal.domain;
    const sourceMeta = remapped
      ? { sourceDomain: domain, note: `These cases are from the ${domain} library (this user's own domain has none) — label them as ${domain} material when you cite them.` }
      : { sourceDomain: domain };
    if ((interests && interests.length > 0) || city) {
      const [cases, hooks] = await Promise.all([
        elayaData.getHelpdeskCases(interests ?? [], city ?? null, domain),
        elayaData.getHelpdeskHooks(interests ?? [], domain),
      ]);
      return { ...sourceMeta, cases, hooks };
    }
    // No filters → a featured slice of the library, never the full 150-case dump.
    const library = await elayaData.getHelpdeskFullLibrary(domain);
    return { ...sourceMeta, cases: library.cases.slice(0, 10), hooks: library.hooks.slice(0, 5) };
  },
};

// ═════════════════════════════════════════════
// Phase 4 — manager oversight + founder business reads.
// Role-gated via the tool's `roles` (toolset membership = the hard gate). All route
// through elayaData (admin client + principal scope) → both channels by construction.
// ═════════════════════════════════════════════

const getEscalations: ElayaTool = {
  name: 'get_escalations',
  roles: MANAGER_UP,
  description:
    'Managers and above: the live escalations in your scope — leads whose SLA has breached ' +
    '(going unworked past the deadline) AND lead follow-up tasks that are overdue. ' +
    'Call when the user asks what needs attention, what’s slipping, what’s breached or overdue, ' +
    'or how the team is keeping up. Manager → own domain; admin/founder → all domains.',
  schema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: async (principal) => {
    const [breachedLeads, overdueTasks] = await Promise.all([
      elayaData.getEscalations(principal),
      elayaData.getOverdueTasks(principal),
    ]);
    return {
      breachedLeads: breachedLeads.slice(0, 25).map((l) => ({
        name: l.name,
        slug: l.slug,
        status: l.status,
        phone: l.phone,
        domain: l.domain,
        assignee: l.assigneeName,
        breachedAt: l.lastFiredAt,
        escalatesTo: l.recipients,
      })),
      overdueTasks: overdueTasks.slice(0, 25).map((t) => ({
        title: t.title,
        priority: t.priority,
        dueAt: t.dueAt,
        overdueSince: t.overdueAt,
        assignee: t.assigneeName,
        leadName: t.leadName,
        leadSlug: t.leadSlug,
        domain: t.leadDomain,
      })),
      totalBreachedLeads: breachedLeads.length,
      totalOverdueTasks: overdueTasks.length,
    };
  },
};

const getDomainHealth: ElayaTool = {
  name: 'get_domain_health',
  roles: MANAGER_UP,
  description:
    'Managers and above: a health scorecard per domain for a period — leads in, won, lost, ' +
    'calls made, conversion rate, deals closed and revenue. Call for "how is my domain doing", ' +
    '"compare the domains", team-level health questions. Manager → own domain only; ' +
    'admin/founder → all domains. Money is in Indian Rupees.',
  schema: z.object({ period: z.enum(OVERSIGHT_PERIODS).optional() }),
  jsonSchema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: [...OVERSIGHT_PERIODS], description: 'Defaults to this_month' },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const period = ((input as { period?: (typeof OVERSIGHT_PERIODS)[number] }).period) ?? 'this_month';
    const cards = await elayaData.getDomainHealth(principal, period);
    return { period, domains: cards };
  },
};

const getCampaigns: ElayaTool = {
  name: 'get_campaigns',
  roles: MANAGER_UP,
  description:
    'Managers and above: lead performance broken down by marketing campaign for a period — ' +
    'leads per campaign and their pipeline mix (new/touched/in discussion/won/lost). Call for ' +
    'questions about which campaigns are working, campaign lead volume, or campaign conversion. ' +
    'Manager → own domain; admin/founder → all domains.',
  schema: z.object({ period: z.enum(OVERSIGHT_PERIODS).optional() }),
  jsonSchema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: [...OVERSIGHT_PERIODS], description: 'Defaults to this_month' },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const period = ((input as { period?: (typeof OVERSIGHT_PERIODS)[number] }).period) ?? 'this_month';
    const rows = await elayaData.getCampaigns(principal, period);
    // Top-25 cap (sorted by volume) so a long-tail of tiny campaigns can't blow the
    // 12k result ceiling; tell the model how many were omitted.
    const sorted = [...rows].sort((a, b) => b.total_leads - a.total_leads);
    const CAP = 25;
    const shown = sorted.slice(0, CAP).map((c) => ({
      campaign: c.campaign_name,
      domain: c.domain,
      totalLeads: c.total_leads,
      won: c.won,
      lost: c.lost,
      inDiscussion: c.in_discussion,
      nurturing: c.nurturing,
      converted: c.converted,
    }));
    return {
      period,
      campaigns: shown,
      ...(sorted.length > CAP
        ? { note: `Showing the top ${CAP} of ${sorted.length} campaigns by lead volume.` }
        : {}),
    };
  },
};

const getBudget: ElayaTool = {
  name: 'get_budget',
  roles: FOUNDER_UP,
  description:
    'Founders and admins only: ad spend per campaign for a period, joined to the leads and ' +
    'deals it produced — spend, leads, deals, revenue, cost-per-lead and cost-per-deal. Call for ' +
    'budget, ad spend, CPL/CPD, marketing ROI or "what are we spending" questions. Org-wide ' +
    '(spend is not domain-scoped). All money is Indian Rupees; a "—" cost means zero in that ' +
    'denominator (never report it as ₹0).',
  schema: z.object({ period: z.enum(OVERSIGHT_PERIODS).optional() }),
  jsonSchema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: [...OVERSIGHT_PERIODS], description: 'Defaults to this_month' },
    },
    additionalProperties: false,
  },
  run: async (_principal, input) => {
    const period = ((input as { period?: (typeof OVERSIGHT_PERIODS)[number] }).period) ?? 'this_month';
    const rows = await elayaData.getBudget(period);
    const sorted = [...rows].sort((a, b) => b.totalSpend - a.totalSpend);
    const CAP = 25;
    const totalSpend = rows.reduce((s, r) => s + r.totalSpend, 0);
    const totalLeads = rows.reduce((s, r) => s + r.leadCount, 0);
    const totalDeals = rows.reduce((s, r) => s + r.dealCount, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.dealRevenue, 0);
    return {
      period,
      totals: { spend: totalSpend, leads: totalLeads, deals: totalDeals, revenue: totalRevenue },
      campaigns: sorted.slice(0, CAP).map((r) => ({
        campaign: r.campaignKey,
        spend: r.totalSpend,
        leads: r.leadCount,
        deals: r.dealCount,
        revenue: r.dealRevenue,
        costPerLead: r.costPerLead,
        costPerDeal: r.costPerDeal,
      })),
      ...(sorted.length > CAP
        ? { note: `Showing the top ${CAP} of ${sorted.length} campaigns by spend.` }
        : {}),
    };
  },
};

// ─────────────────────────────────────────────
// Registry + per-role toolsets
// ─────────────────────────────────────────────

const ALL_TOOLS = [
  searchLeads,
  getColdLeads,
  getLeadDetails,
  getMyTasks,
  searchDeals,
  getPerformanceSnapshot,
  getHelpdeskContent,
  getEscalations,
  getDomainHealth,
  getCampaigns,
  getBudget,
] as const;

const TOOL_REGISTRY = new Map<string, ElayaTool>(ALL_TOOLS.map((t) => [t.name, t]));

// READ tools permitted for a role. Most are all-staff (no `roles` field); the Phase-4
// oversight/business tools carry a `roles` set, so a manager never sees get_budget and
// an agent never sees the oversight tools — toolset membership is the hard gate (the
// model is only handed tools the principal carries). Mirrors writeToolsForRole.
function readToolsForRole(role: UserRole): ElayaReadToolName[] {
  return ALL_TOOLS.filter((t) => !t.roles || t.roles.includes(role)).map((t) => t.name);
}

// Per-role toolset = the role's read tools + the write tools that role is permitted.
// Both halves are role-gated (Phase 4 made reads role-aware too). Guests get nothing.
function staffToolset(role: UserRole): readonly ElayaToolName[] {
  return [...readToolsForRole(role), ...writeToolsForRole(role)];
}

export const TOOLSET_BY_ROLE: Record<UserRole, readonly ElayaToolName[]> = {
  founder: staffToolset('founder'),
  admin:   staffToolset('admin'),
  manager: staffToolset('manager'),
  agent:   staffToolset('agent'),
  guest:   [], // guests converse but get zero data access
};

/** Provider-neutral definitions for the principal's permitted tools (read + write). */
export function getToolDefinitionsForPrincipal(principal: ElayaPrincipal): LlmToolDefinition[] {
  return principal.toolset
    .map((name): LlmToolDefinition | null => {
      const read = TOOL_REGISTRY.get(name);
      if (read) return { name: read.name, description: read.description, inputSchema: read.jsonSchema };
      const write = WRITE_TOOL_REGISTRY.get(name);
      if (write) return { name: write.name, description: write.description, inputSchema: write.jsonSchema };
      return null;
    })
    .filter((d): d is LlmToolDefinition => d !== null);
}

export type ElayaToolExecution = {
  content: string;
  isError: boolean;
};

/**
 * Execute one tool call as the principal — THE single dispatch path for read AND write
 * tools. Refusals/validation failures return a model-facing message (isError) — they
 * never throw out of this function. `ctx` (conversation/channel) is threaded to write
 * tools so they can record audit/proposal rows; read tools ignore it.
 */
export async function executeTool(
  principal: ElayaPrincipal,
  name: string,
  rawInput: Record<string, unknown>,
  maskingDepth: PiiMaskingDepth,
  ctx: WriteToolContext,
): Promise<ElayaToolExecution> {
  // Toolset membership is the hard gate — a name outside the principal's toolset is
  // refused at dispatch (this is what excludes reassign_lead for agents).
  const permitted = principal.toolset.includes(name as ElayaToolName);

  const readTool = TOOL_REGISTRY.get(name);
  const writeTool = WRITE_TOOL_REGISTRY.get(name);
  if ((!readTool && !writeTool) || !permitted) {
    return { content: `Tool '${name}' is not available to this user.`, isError: true };
  }

  const schema = readTool?.schema ?? writeTool!.schema;
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      content: `Invalid input for '${name}': ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
        .join('; ')}`,
      isError: true,
    };
  }

  try {
    const result = readTool
      ? await readTool.run(principal, parsed.data as Record<string, unknown>, ctx.channel)
      : await writeTool!.run(principal, parsed.data as Record<string, unknown>, ctx);
    const masked = maskPii(result, maskingDepth);
    let serialized = JSON.stringify(masked);
    if (serialized.length > TOOL_RESULT_MAX_CHARS) {
      serialized = `${serialized.slice(0, TOOL_RESULT_MAX_CHARS)}…(truncated)`;
    }
    return { content: serialized, isError: false };
  } catch (e) {
    // D-05: never log prompt/tool payloads — tool name only.
    console.error(`[elaya-tools] '${name}' failed:`, e instanceof Error ? e.message : e);
    return { content: `Tool '${name}' failed. Tell the user it could not be completed right now.`, isError: true };
  }
}

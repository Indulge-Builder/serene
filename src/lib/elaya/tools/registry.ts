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
import type { StaffPrincipal } from '@/lib/elaya/principal';
import { maskPii } from '@/lib/elaya/pii';
import { canAccessLead } from '@/lib/elaya/access';
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
// directly — so every read is principal-scoped + admin-member + channel-agnostic by
// construction. A tool that reaches past this module can re-introduce a login-session
// dependency that blanks on WhatsApp; do not do it.
import * as elayaData from '@/lib/elaya/elaya-data';
import { LEAD_STATUSES } from '@/lib/constants/lead-statuses';
import { COLD_LEAD_THRESHOLD_DAYS } from '@/lib/constants/leads';
import { DEAL_TYPE_ENUM, DEAL_CATEGORY_ENUM } from '@/lib/constants/deal-types';
import { DEFAULT_GIA_DOMAIN, isGiaDomain } from '@/lib/constants/domains';
import { TICKET_STATUSES, TICKET_TRANSITIONS, type TicketStatus } from '@/lib/constants/tickets';
import type { UserRole } from '@/lib/types';
import type { LeadStatus } from '@/lib/types/database';
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
  | 'find_teammate'
  | 'search_deals'
  | 'get_performance_snapshot'
  | 'get_helpdesk_content'
  // Phase 4 — manager oversight (manager+) + founder business (admin/founder)
  | 'get_escalations'
  | 'get_domain_health'
  | 'get_campaigns'
  | 'get_budget'
  // Vendors (0183–0190) — admin/founder, mirroring the tables' RLS
  | 'list_tickets'
  | 'get_ticket'
  | 'find_vendors'
  | 'get_vendor_details'
  // Members (0181/0194) — a member's WhatsApp history, raw, queendom-scoped in code
  | 'get_member_overview'
  | 'get_member_recent_messages'
  | 'search_member_history'
  // The twin itself (0194): what Serene knows, and the money (Zoho, live)
  | 'get_member_profile'
  | 'get_member_finance';

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
    principal: StaffPrincipal,
    input: Record<string, unknown>,
    channel: ElayaChannel,
  ) => Promise<unknown>;
};

// Per-resource access check: THE shared canAccessLead from lib/elaya/access.ts
// (dry-audit D6 — one security predicate for both the read and write registries).

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
    // Admin-member read (works in the sessionless WhatsApp context); the
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
    // All three reads go through the Elaya data layer → admin-member + principal-scoped,
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

const findTeammate: ElayaTool = {
  name: 'find_teammate',
  description:
    'Find a COLLEAGUE (a staff member / teammate) by name — NOT a customer or lead. Use this ' +
    'whenever you need a person to ASSIGN work to: "create a task for Arfam", "remind Pawani to call ' +
    'the member", "assign this to the onboarding manager". It returns each match with their userId — ' +
    'the handle the task tools (create_personal_task, update_task) need for `assigneeId`. Resolve the ' +
    'teammate with THIS tool first, then create/assign the task with their userId. NEVER use ' +
    'search_leads to find a person to assign work to — that searches customers/prospects, not staff. ' +
    'If the name matches no teammate, or more than one, ask the user which person — never guess.',
  schema: z.object({
    search: z.string().trim().min(1).max(80),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: "The teammate's name or a fragment of it" },
    },
    required: ['search'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { search } = input as { search: string };
    // Staff identity via the data seam — admin-member + principal-scoped, so it works
    // on BOTH channels. This is the name→userId lookup that keeps "create a task for
    // <person>" off search_leads. When the exact/substring lookup finds nothing, the
    // service falls back to SOUND-ALIKE matching (voice-transcription artifacts:
    // "Arapham" → "Arfam") and flags the result fuzzy — those matches must be
    // CONFIRMED with the user before any assignment.
    const result = await elayaData.findTeammates(principal, search);
    const matches = result.users;
    const CAP = 15;
    return {
      ...(result.fuzzy ? { fuzzyMatch: true } : {}),
      // STRUCTURAL fuzzy gate: a sound-alike match deliberately carries NO userId,
      // so the model CANNOT assign to it this turn (the id is the only handle the
      // task tools accept). It must ask "You mean <name>?" and, after the user
      // confirms, call find_teammate again with the exact confirmed name — the
      // exact match returns the id. A prompt note alone proved insufficient
      // (Sonnet 5 overrode a HARD STOP note in favor of decisiveness, eval
      // task-voice-artifact-name 2026-08-27) — capability withheld in code is
      // the only reliable gate, the Golden Rule posture.
      teammates: matches.slice(0, CAP).map((u) => ({
        ...(result.fuzzy ? {} : { userId: u.id }),
        name: u.full_name,
        role: u.role,
        domain: u.domain,
      })),
      ...(result.fuzzy
        ? { note: 'No exact match — these are only closest-SOUNDING guesses (the name may be a voice-transcription artifact), so no userId is provided and assignment is impossible this turn. Ask the user "You mean <name>?" and wait. After they confirm, call find_teammate again with the confirmed exact name to get the userId, then assign.' }
        : matches.length === 0
          ? { note: 'No teammate matched that name, even by sound. Ask the user for the full name or who they mean — never guess a person to assign work to.' }
          : matches.length > CAP
            ? { note: `Showing the first ${CAP} matches — ask the user to narrow the name if the one they mean isn't here.` }
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

    // Through the Elaya data layer (admin-member explicit-param twins, migration 0149)
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

// ─────────────────────────────────────────────
// Vendors
//
// FOUNDER_UP, not the spec's "concierge + shop staff": the 0183/0185 tables are
// admin/founder SELECT only, so a manager holding the tool would call it and be
// refused by the database. The toolset widens the day the RLS does, in one line.
//
// Both wrap the SAME functions /vendors calls (elayaData.rankVendors /
// .getVendor). The spec is explicit that Elaya's tool, the Sia ticket screen and
// the Chrome extension all call one ranking and none of them re-rank.
// ─────────────────────────────────────────────

const findVendors: ElayaTool = {
  name: 'find_vendors',
  roles: FOUNDER_UP,
  description:
    'Find the best suppliers for a request, ranked. Call this whenever the user asks who to use ' +
    'for something — "who do we use for cakes", "need a florist in Goa", "someone to arrange an ' +
    'airport pickup". Pass the request in the user\'s OWN words as `request`: it is matched ' +
    'against the titles of 46,000 past jobs, so it finds suppliers even when the exact words were ' +
    'never used before. Each result carries the matching past jobs as evidence — quote one when ' +
    'you answer, so the user can judge the suggestion rather than trust it. A score of null means ' +
    'nobody has rated that vendor yet; say so rather than implying a low score.',
  schema: z.object({
    request: z.string().trim().min(2).max(300),
    city: z.string().trim().max(80).optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      request: { type: 'string', description: "The request in the user's own words, e.g. 'black forest cake for a birthday'" },
      city: { type: 'string', description: 'Optional city to narrow to, e.g. goa' },
      limit: { type: 'number', description: 'How many vendors to return (default 5)' },
    },
    required: ['request'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { request, city, limit } = input as { request: string; city?: string; limit?: number };
    const ranked = await elayaData.rankVendors({
      phrase: request,
      city: city?.trim().toLowerCase() || null,
      limit: limit ?? 5,
      // The genie's own sticky notes shape the suggestion exactly as the page
      // does (0191): their avoid is left out, their preferred is lifted.
      agentId: principal.kind === 'staff' ? principal.userId : null,
    });
    if (ranked.length === 0) {
      return {
        request,
        vendors: [],
        note:
          'No vendor has a matching job on record. This does not mean none exists — only that we ' +
          'have never used one for this. Suggest adding the vendor rather than guessing a name.',
      };
    }
    return {
      request,
      vendors: ranked.map((r) => ({
        id: r.vendor.id,
        name: r.vendor.name,
        category: r.vendor.category,
        city: r.vendor.home_city,
        phone: r.vendor.primary_phone,
        // null = nobody has rated them; the model is told above not to read it as low.
        score: r.score,
        why: r.reasons,
        cautions: r.flags,
      })),
    };
  },
};

const getVendorDetails: ElayaTool = {
  name: 'get_vendor_details',
  roles: FOUNDER_UP,
  description:
    'Everything known about one vendor: how to reach them, what they have been used for, their ' +
    'recent jobs, and their score with the reasons behind it. Call after find_vendors when the ' +
    'user asks about a specific supplier by name. Needs the vendor id from find_vendors.',
  schema: z.object({ vendor_id: z.string().uuid() }),
  jsonSchema: {
    type: 'object',
    properties: { vendor_id: { type: 'string', description: 'The id returned by find_vendors' } },
    required: ['vendor_id'],
    additionalProperties: false,
  },
  run: async (_principal, input) => {
    const { vendor_id } = input as { vendor_id: string };
    const d = await elayaData.getVendor(vendor_id);
    if (!d) return { error: 'No vendor with that id.' };
    const RECENT = 10;
    return {
      vendor: {
        id: d.vendor.id,
        name: d.vendor.name,
        aliases: d.vendor.aliases,
        category: d.vendor.category,
        subcategory: d.vendor.subcategory,
        status: d.vendor.status,
        city: d.vendor.home_city,
        phone: d.vendor.primary_phone,
        contacts: d.vendor.contacts,
      },
      timesUsed: d.timesUsed,
      score: d.score.score,
      why: d.score.reasons,
      offers: d.capabilities
        .filter((c) => c.stance === 'offers')
        .map((c) => (c.service ? `${c.category} > ${c.service}` : c.category)),
      declines: d.capabilities
        .filter((c) => c.stance === 'declines')
        .map((c) => (c.service ? `${c.category} > ${c.service}` : c.category)),
      recentJobs: d.engagements.slice(0, RECENT).map((e) => ({
        title: e.title,
        category: e.category,
        when: e.started_at,
        outcome: e.outcome,
      })),
      ratings: d.ratings,
      reviewerCount: d.reviewerCount,
      // Who on the team prefers or avoids them, with their note — the sticky
      // notes (0191). Staff names, never a customer's.
      teamTakes: d.preferences.map((p) => ({ who: p.agent_name, stance: p.stance, note: p.note })),
    };
  },
};

// ── Members (2026-09-16) — a member's WhatsApp group, read raw for Elaya ──
// No profile layer in between: the tools hand the model REAL message rows (date,
// who, text) and the descriptions bind it to answer only from them. All staff may
// carry the tools; the CODE gate is the queendom (canAccessMember inside
// elaya-data) — admin/founder see every member, everyone else their queendom's.
// Both brains run these here (bridged), so WhatsApp and in-app answer alike.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getMemberOverview: ElayaTool = {
  name: 'get_member_overview',
  description:
    'Find a member member and their WhatsApp concierge group. Pass `member` as the name the user ' +
    'said (or a member id). Returns tier, membership status, queendom and the group with its message ' +
    'count and last activity, plus the member_id the other member tools need (get_member_profile for what we know, get_member_recent_messages for what was said, get_member_finance for money) — call this FIRST. If ' +
    'several members match you get a `candidates` list: ask the user which one, never pick. If none ' +
    'match, say you could not find that member; never describe a member you did not get back.',
  schema: z.object({ member: z.string().trim().min(2).max(120) }),
  jsonSchema: {
    type: 'object',
    properties: { member: { type: 'string', description: "The member's name as the user said it, or a member id" } },
    required: ['member'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { member } = input as { member: string };
    let match: Awaited<ReturnType<typeof elayaData.getMemberBriefFor>> = null;
    if (UUID_RE.test(member)) {
      match = await elayaData.getMemberBriefFor(principal, member);
      if (!match) return { found: false, note: 'No member with that id that you can see.' };
    } else {
      const hits = await elayaData.findMembersFor(principal, member);
      if (hits.length === 0) {
        return { found: false, note: `No member matching "${member}". Say so; do not describe anyone.` };
      }
      if (hits.length > 1) {
        return {
          found: false,
          candidates: hits.map((c) => ({ member_id: c.id, name: c.full_name, tier: c.tier, status: c.membership_status })),
          note: 'Several members match. Ask the user which one they mean.',
        };
      }
      match = await elayaData.getMemberBriefFor(principal, hits[0].id);
      if (!match) return { found: false, note: 'That member is outside what you can see.' };
    }
    const { member: c, group } = match;
    return {
      found: true,
      member_id: c.id,
      name: c.full_name,
      tier: c.tier,
      membership: { type: c.membership_type, status: c.membership_status, ends: c.membership_end },
      whatsapp_group: group
        ? { subject: group.subject, members: group.member_count, messages: group.message_count, last_message_at: group.last_message_at }
        : null,
      note: group ? undefined : 'No WhatsApp group is mapped to this member yet, so there is no chat history to read.',
    };
  },
};

const getMemberProfile: ElayaTool = {
  name: 'get_member_profile',
  description:
    'Everything Serene KNOWS about one member, as opposed to what was said in the chat: their saved ' +
    'facts grouped by facet (preferences, dislikes, dietary, travel, family, essentials…) each with its ' +
    'source, confidence and date; the people around them (spouse, assistant, driver) and who may ' +
    'request on their behalf; the concierge team serving them; their health score with the reasons; ' +
    'their open and recent Freshdesk requests; what is coming up (renewal, occasions); and the latest ' +
    'observations the team wrote. Use for "what do we know about X", "what does X like / avoid", ' +
    '"is X vegetarian", "who is X\'s genie", "how is X doing", "brief me on X before I call". State a ' +
    'fact only if it is in the result, and say where it came from when confidence is below 0.8. An ' +
    'empty facet means nothing is on record, never a guess. For what the member SAID lately use ' +
    'get_member_recent_messages. Needs member_id from get_member_overview.',
  schema: z.object({ member_id: z.string().uuid() }),
  jsonSchema: {
    type: 'object',
    properties: { member_id: { type: 'string', description: 'The member_id from get_member_overview' } },
    required: ['member_id'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { member_id } = input as { member_id: string };
    const profile = await elayaData.getMemberProfileFor(principal, member_id);
    if (!profile) return { error: 'No such member, or outside what you can see.' };
    return {
      ...profile,
      note:
        profile.facts_total === 0
          ? 'No saved facts for this member yet. Say exactly that; the chat may still hold answers (get_member_recent_messages).'
          : profile.facts_shown < profile.facts_total
            ? `Showing the ${profile.facts_shown} most confident of ${profile.facts_total} facts.`
            : 'Every current fact is shown. Anything not here is not on record.',
    };
  },
};

const getMemberFinance: ElayaTool = {
  name: 'get_member_finance',
  description:
    "One member's money, read live from Zoho Books: totals invoiced / paid / outstanding / credits, the " +
    'unpaid invoices with due dates, the latest invoices and payments. Use for "does X owe anything", ' +
    '"has X paid", "when is X\'s invoice due", "what did X pay last". Amounts are INR. If the member has ' +
    'no Zoho link say so; never estimate a figure. Needs member_id from get_member_overview.',
  schema: z.object({ member_id: z.string().uuid() }),
  jsonSchema: {
    type: 'object',
    properties: { member_id: { type: 'string', description: 'The member_id from get_member_overview' } },
    required: ['member_id'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { member_id } = input as { member_id: string };
    const money = await elayaData.getMemberFinanceFor(principal, member_id);
    if (!money) return { error: 'No such member, or outside what you can see.' };
    if ('denied' in money) return { error: 'Your role cannot see member finance.' };
    if (!money.linked) return { ...money, note: 'This member is not linked to a Zoho customer, so there is no ledger to read.' };
    if ('unavailable' in money) return { ...money, note: 'Zoho Books did not answer just now. Say so; do not guess.' };
    return { ...money, note: 'Live from Zoho Books. Quote figures exactly as given.' };
  },
};

const getMemberRecentMessages: ElayaTool = {
  name: 'get_member_recent_messages',
  description:
    "The latest messages from the member's WhatsApp concierge group, oldest to newest, each with " +
    'its date, who sent it (member / staff) and the text. Use for "what has X asked for lately", ' +
    '"what is going on with X", "summarise X\'s chat". Answer ONLY from these messages and mention ' +
    'the dates you rely on; if the list is empty say there are no messages, never fill the gap. ' +
    'Pass `before` (the `oldest_at` you were given) to read the page before it. Needs member_id ' +
    'from get_member_overview.',
  schema: z.object({ member_id: z.string().uuid(), before: z.string().datetime({ offset: true }).optional() }),
  jsonSchema: {
    type: 'object',
    properties: {
      member_id: { type: 'string', description: 'The member_id from get_member_overview' },
      before: { type: 'string', description: 'Optional ISO timestamp: return the page of messages before this moment' },
    },
    required: ['member_id'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { member_id, before } = input as { member_id: string; before?: string };
    const page = await elayaData.getMemberMessagesFor(principal, member_id, { before });
    if (!page) return { error: 'No such member, or outside what you can see.' };
    return {
      member: page.member.full_name,
      group: page.group_subject,
      messages: page.messages,
      has_more: page.has_more,
      oldest_at: page.oldest_at,
      note:
        page.messages.length === 0
          ? 'No messages on record for this member. Say exactly that.'
          : 'Ground every statement in these messages and cite the date. Nothing here means nothing is known.',
    };
  },
};

const searchMemberHistory: ElayaTool = {
  name: 'search_member_history',
  description:
    "Search everything on record about a member for a TOPIC: Serene's one-line summaries of each past " +
    'conversation, the saved facts, and the real WhatsApp messages. The search matches words, it does not ' +
    'understand meaning, so YOU supply the meaning: along with `query`, always pass `related`, 5 to 10 other ' +
    'words the same thing could have been written as. Include synonyms, the concrete things it implies, and ' +
    'Hindi or Hinglish spellings. Example: query "anniversary dinner" -> related ["wedding", "anniversary", ' +
    '"shaadi", "saalgirah", "marriage", "celebration", "surprise", "table", "restaurant", "cake"]. ' +
    'Use for "did X ever mention…", "when did X ask about…", "what does X like for…". ' +
    '`conversations` tells you WHEN the topic came up and what happened; `hits` are the exact words to quote; ' +
    '`facts` is what was saved. If all three are empty, try once more with different related words, and if ' +
    'still empty say nothing was found; never guess or infer. Needs member_id from get_member_overview.',
  schema: z.object({
    member_id: z.string().uuid(),
    query: z.string().trim().min(2).max(120),
    related: z.array(z.string().trim().min(2).max(40)).max(12).optional().default([]),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      member_id: { type: 'string', description: 'The member_id from get_member_overview' },
      query: { type: 'string', description: 'The topic in a few words, e.g. anniversary dinner, goa villa, refund' },
      related: { type: 'array', items: { type: 'string' }, description: 'Other words the same topic could have been written as: synonyms, concrete things it implies, Hindi/Hinglish spellings. 5 to 10 entries.' },
    },
    required: ['member_id', 'query'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { member_id, query, related } = input as { member_id: string; query: string; related?: string[] };
    const res = await elayaData.searchMemberHistoryFor(principal, member_id, query, related ?? []);
    if (!res) return { error: 'No such member, or outside what you can see.' };
    const empty = res.conversations.length === 0 && res.facts.length === 0 && res.hits.length === 0;
    return {
      member: res.member.full_name,
      group: res.group_subject,
      searched_for: res.searched_for,
      conversations: res.conversations,
      facts: res.facts,
      hits: res.hits,
      note: empty
        ? `Nothing on record matches those words. Try once with different related words; if still nothing, say so plainly.`
        : 'Answer from these rows only. Give the date, quote the message when there is one, and do not extend beyond what they say.',
    };
  },
};

/**
 * Read tools the Python brain runs THROUGH the bridge instead of porting.
 * The vendor ranker is the one ranking in the codebase (R-01; the vendors spec:
 * Elaya's tool, the Sia ticket screen and the extension all call it and none
 * re-rank), and it already spends a model call reading the request. A Python
 * twin would be a second ranker that drifts. The bridge runs these through this
 * same registry, so both brains answer a vendor question identically.
 */
export const BRIDGED_READ_TOOL_NAMES: ReadonlySet<string> = new Set([
  'find_vendors',
  'get_vendor_details',
  // Tickets: the sentinel's ledger lives in Node with its cores; the Python brain reads it here.
  'list_tickets',
  'get_ticket',
  // Members: the member's WhatsApp history lives in the sia schema Node already reads.
  'get_member_overview',
  'get_member_profile',
  'get_member_finance',
  'get_member_recent_messages',
  'search_member_history',
]);

// ── Tickets (Sia, 0195/0199/0200) — the genie's queue and one ticket's whole story ──
// Scope is the principal's queendom (admin/founder: every queendom), read through
// elaya-data so WhatsApp turns see what the app sees. Ticket numbers (T-000042) are the
// handle the write tools take; ids are surfaced too for the resolver.

const listTickets: ElayaTool = {
  name: 'list_tickets',
  description:
    'Sia tickets: the live member requests in the user’s queendom (admin/founder: every queendom). ' +
    'Call when the user asks what is open, what is on their plate, what is late, what a member is waiting on, ' +
    'or to find a ticket by words in its title. Returns ticket numbers (T-000042) to use with get_ticket, ' +
    'add_ticket_note and move_ticket_status.',
  schema: z.object({
    mine: z.boolean().optional(),
    status: z.array(z.enum(TICKET_STATUSES.zodEnum)).max(10).optional(),
    search: z.string().trim().max(80).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      mine: { type: 'boolean', description: 'Only tickets assigned to the user' },
      status: { type: 'array', items: { type: 'string', enum: [...TICKET_STATUSES.values] }, description: 'Only these statuses (default: everything live)' },
      search: { type: 'string', description: 'Words from the title or a ticket number' },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { mine, status, search } = input as { mine?: boolean; status?: TicketStatus[]; search?: string };
    const rows = await elayaData.listTicketsFor(principal, { mine, status, search: search ?? null, limit: 25 });
    const now = Date.now();
    return {
      count: rows.length,
      tickets: rows.map((t) => ({
        ticketNo: t.ticket_no,
        ticketId: t.id,
        title: t.title,
        member: t.member_name,
        status: t.status,
        priority: t.priority,
        category: t.sub_category ? `${t.category} / ${t.sub_category}` : t.category,
        assignee: t.assignee_name ?? 'unassigned',
        queendom: t.queendom_name,
        late: Boolean((t.first_response_due_at && !t.first_responded_at && new Date(t.first_response_due_at).getTime() < now) || (t.resolve_due_at && new Date(t.resolve_due_at).getTime() < now)),
        resolveBy: t.resolve_due_at,
        requestedFor: t.requested_for,
        tags: t.tags,
        updatedAt: t.updated_at,
      })),
      note: rows.length === 25 ? 'Showing the 25 most recently updated; narrow with status, mine or search.' : undefined,
    };
  },
};

const getTicket: ElayaTool = {
  name: 'get_ticket',
  description:
    'One Sia ticket in full: the brief, the checklist, the money, the sentinel’s summary, the SLA clocks and ' +
    'the last twelve diary events. Takes the ticket number (T-000042) or id from list_tickets. Call before ' +
    'summarising a ticket, answering "where does this stand", or proposing a move.',
  schema: z.object({ ticket: z.string().trim().min(1).max(60) }),
  jsonSchema: {
    type: 'object',
    properties: { ticket: { type: 'string', description: 'The ticket number (T-000042) or id' } },
    required: ['ticket'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { ticket } = input as { ticket: string };
    const d = await elayaData.getTicketFor(principal, ticket);
    if (!d) return { error: "I couldn't find that ticket among the ones you can see." };
    const t = d.ticket;
    return {
      ticketNo: t.ticket_no,
      ticketId: t.id,
      title: t.title,
      member: d.member_name,
      status: t.status,
      allowedMoves: TICKET_TRANSITIONS[t.status],
      priority: t.priority,
      priorityApproved: Boolean(t.priority_approved_at),
      category: t.sub_category ? `${t.category} / ${t.sub_category}` : t.category,
      assignee: d.assignee_name ?? 'unassigned',
      brief: t.brief,
      checklist: t.checklist.map((c, i) => ({ index: i, label: c.label, done: Boolean(c.done_at) })),
      money: t.money,
      tags: t.tags,
      summary: t.summary,
      requestedFor: t.requested_for,
      clocks: { firstResponseDue: t.first_response_due_at, firstRespondedAt: t.first_responded_at, nextUpdateDue: t.next_update_due_at, resolveBy: t.resolve_due_at },
      policy: d.policy ? { firstResponseMin: d.policy.first_response_min, resolveTargetMin: d.policy.resolve_target_min, businessHours: d.policy.business_hours } : null,
      recentEvents: d.events.map((e) => ({ at: e.created_at, by: e.actor_kind, type: e.event_type, body: e.body })),
      createdAt: t.created_at,
    };
  },
};

const ALL_TOOLS = [
  searchLeads,
  getColdLeads,
  getLeadDetails,
  getMyTasks,
  findTeammate,
  searchDeals,
  getPerformanceSnapshot,
  getHelpdeskContent,
  getEscalations,
  getDomainHealth,
  getCampaigns,
  getBudget,
  findVendors,
  getVendorDetails,
  listTickets,
  getTicket,
  getMemberOverview,
  getMemberProfile,
  getMemberFinance,
  getMemberRecentMessages,
  searchMemberHistory,
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
export function getToolDefinitionsForPrincipal(principal: StaffPrincipal): LlmToolDefinition[] {
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
  principal: StaffPrincipal,
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

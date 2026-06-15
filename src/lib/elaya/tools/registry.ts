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
import { getLeadsByRole, getLeadBySlug, getLeadNotesFull } from '@/lib/services/leads-service';
import { getDealsByRole } from '@/lib/services/deals-service';
import { getGiaTasksForUser, getPersonalTasks, getGroupTasks } from '@/lib/services/tasks-service';
import {
  getAgentTodayPulse,
  getAgentRosterPerformance,
  getPeriodDateRange,
} from '@/lib/services/performance-service';
import { getCasesForLead, getHooksForCategories, getHelpdeskLibrary } from '@/lib/services/intelligence-service';
import { LEAD_STATUSES } from '@/lib/constants/lead-statuses';
import { DEAL_TYPE_ENUM, DEAL_CATEGORY_ENUM } from '@/lib/constants/deal-types';
import { DEFAULT_GIA_DOMAIN, isGiaDomain } from '@/lib/constants/domains';
import type { UserRole } from '@/lib/types';
import type { LeadStatus } from '@/lib/types/database';
import type { LeadWithAssignee } from '@/lib/services/leads-service';

const TOOL_RESULT_MAX_CHARS = 12_000;

const PERIODS = ['today', 'this_week', 'this_month', 'last_month'] as const;

// ─────────────────────────────────────────────
// Tool shape
// ─────────────────────────────────────────────

export type ElayaReadToolName =
  | 'search_leads'
  | 'get_lead_details'
  | 'get_my_tasks'
  | 'search_deals'
  | 'get_performance_snapshot'
  | 'get_helpdesk_content';

/** Every tool name the principal may carry — read tools (this file) + write tools. */
export type ElayaToolName = ElayaReadToolName | ElayaWriteToolName;

type ElayaTool = {
  name: ElayaReadToolName;
  description: string;
  schema: z.ZodTypeAny;
  /** JSON Schema mirror of `schema` — handed to the provider adapter. */
  jsonSchema: Record<string, unknown>;
  run: (principal: ElayaPrincipal, input: Record<string, unknown>) => Promise<unknown>;
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
      page: { type: 'integer', minimum: 1, description: 'Page number (15 per page)' },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { search, statuses, page } = input as {
      search?: string; statuses?: LeadStatus[]; page?: number;
    };
    // Identity args are principal-derived — getLeadsByRole enforces the role
    // constraint unconditionally (agents cannot widen scope via filters).
    const result = await getLeadsByRole(principal.role, principal.userId, principal.domain, {
      status: statuses ?? null,
      last_call_outcome: null,
      domain: null,
      agent_id: null,
      source: null,
      campaign: null,
      date_from: null,
      date_to: null,
      search: search ?? null,
      page: page ?? 1,
      pageSize: 15,
    });
    return {
      totalCount: result.totalCount,
      statusCounts: result.statusCounts,
      leads: result.leads.map((l) => ({
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
    };
  },
};

const getLeadDetails: ElayaTool = {
  name: 'get_lead_details',
  description:
    'Fetch one lead by its slug (from search_leads results) with its 5 most recent notes. ' +
    'Refuses leads the current user is not permitted to see.',
  schema: z.object({ slug: z.string().trim().min(1).max(160) }),
  jsonSchema: {
    type: 'object',
    properties: { slug: { type: 'string', description: 'The lead slug' } },
    required: ['slug'],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { slug } = input as { slug: string };
    const lead = await getLeadBySlug(slug);
    if (!lead || !canAccessLead(principal, lead)) {
      // One message for both not-found and not-permitted (S-09 principle).
      return { error: 'Lead not found or you are not permitted to view it.' };
    }
    const notes = await getLeadNotesFull(lead.id);
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
    const [giaTasks, personal, groups] = await Promise.all([
      getGiaTasksForUser(principal.userId, principal.role, principal.domain),
      getPersonalTasks(principal.userId, { limit: 20 }),
      getGroupTasks({}, { userId: principal.userId }),
    ]);
    // taskId / groupId are surfaced DELIBERATELY (Brief 3): they are the handle the
    // write tools (update_task_status / update_task / delete_task) target. Without an
    // id the model cannot name a task to act on. The id is an opaque caller-scoped
    // UUID; the row is already one this principal is permitted to see.
    return {
      followUps: giaTasks.slice(0, 25).map((t) => ({
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
      groupTasks: groups.map((g) => ({
        groupId: g.id,
        title: g.title,
        status: g.status,
        priority: g.priority,
        dueAt: g.due_at,
        subtaskCount: g.subtask_count,
        completedCount: g.completed_count,
      })),
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
    const result = await getDealsByRole(principal.role, principal.userId, principal.domain, {
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
    if (principal.role === 'agent') {
      // Self-scoped RPC (auth.uid()) — runs as the caller's session.
      const pulse = await getAgentTodayPulse(period);
      return { view: 'agent_pulse', period, ...pulse };
    }
    const range = getPeriodDateRange(period);
    // Manager is pinned to their own domain inside the RPC; the domain arg is
    // honoured for admin/founder only (null = all domains).
    const domainArg = principal.role === 'manager' ? principal.domain : null;
    const roster = await getAgentRosterPerformance(domainArg, range.from, range.to);
    return { view: 'roster', period, agents: roster };
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
    const domain = isGiaDomain(principal.domain) ? principal.domain : DEFAULT_GIA_DOMAIN;
    if ((interests && interests.length > 0) || city) {
      const [cases, hooks] = await Promise.all([
        getCasesForLead(interests ?? [], city ?? null, domain),
        getHooksForCategories(interests ?? [], domain),
      ]);
      return { cases, hooks };
    }
    // No filters → a featured slice of the library, never the full 150-case dump.
    const library = await getHelpdeskLibrary(domain);
    return { cases: library.cases.slice(0, 10), hooks: library.hooks.slice(0, 5) };
  },
};

// ─────────────────────────────────────────────
// Registry + per-role toolsets
// ─────────────────────────────────────────────

const ALL_TOOLS = [
  searchLeads,
  getLeadDetails,
  getMyTasks,
  searchDeals,
  getPerformanceSnapshot,
  getHelpdeskContent,
] as const;

const TOOL_REGISTRY = new Map<string, ElayaTool>(ALL_TOOLS.map((t) => [t.name, t]));

const READ_TOOLSET: readonly ElayaReadToolName[] = ALL_TOOLS.map((t) => t.name);

// Per-role toolset = all read tools + the write tools that role is permitted (Phase 2).
// Read access is uniform across staff today; write access is role-gated in the write
// registry (agents do NOT get reassign_lead). Guests get nothing.
function staffToolset(role: UserRole): readonly ElayaToolName[] {
  return [...READ_TOOLSET, ...writeToolsForRole(role)];
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
      ? await readTool.run(principal, parsed.data as Record<string, unknown>)
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

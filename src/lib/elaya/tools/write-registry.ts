// Elaya WRITE tool registry (Phase 2 — agentic writes). SERVER ONLY.
//
// Deliberately separate from the read registry (registry.ts header: "Phase 2
// write-tools will live in a separate module … never add a mutating tool here").
//
// Two risk tiers — the split is STRUCTURAL, not prompt-driven:
//   • LOW-RISK (add_lead_note, create_lead_task): execute INLINE in run(), then write
//     one terminal `executed` elaya_actions audit row. Reply confirms what was done.
//   • STATE-CHANGING (update_lead_status, reassign_lead): run() does NOT mutate. It
//     records a `proposed` elaya_actions row (with before-snapshot) and returns an
//     "awaiting confirmation" message. The mutation happens ONLY later, in the brain's
//     affirmation resolver (executeProposedAction below), on an affirmative human reply.
//     There is NO branch in a state tool's run() that reaches a mutation core — that is
//     what makes "execute a state-change in its proposal turn" impossible.
//
// Every write tool:
//   • takes a `slug` (never a name/UUID) → the model must search_leads first; resolution
//     of name→slug + ambiguity handling lives in the read flow + persona, with this tool
//     layer as the hard backstop (slug not found / not accessible → refuse).
//   • re-checks access with the PRINCIPAL via canAccessLead — identity is never
//     model-supplied (prompt-injection defence: injected text cannot widen scope).
//   • wraps a shared mutation core (lead-mutations.ts) — never a raw table write, so it
//     inherits cache invalidation + activity logging + SLA + notifications identically.

import { z } from "zod";
import type { ElayaPrincipal } from "@/lib/elaya/principal";
import { getLeadBySlug } from "@/lib/services/leads-service";
import type { LeadWithAssignee } from "@/lib/services/leads-service";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addLeadNoteCore,
  createLeadTaskCore,
  updateLeadStatusCore,
  assignLeadCore,
  type MutationActor,
} from "@/lib/services/lead-mutations";
import {
  insertExecutedAction,
  insertProposedAction,
  markActionResolved,
  supersedePriorProposals,
  type ElayaActionType,
} from "@/lib/services/elaya-actions-service";
import { notifyLeadAssigned } from "@/lib/services/lead-assignment-notify";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants/lead-statuses";
import { TASK_TYPE_LABELS } from "@/lib/constants/task-types";
import { sanitizeText } from "@/lib/utils/sanitize";
import type { UserRole } from "@/lib/types";
import type { LeadStatus } from "@/lib/types/database";
import type { ElayaActionRow, ElayaChannel } from "@/lib/types/elaya";

export type ElayaWriteToolName =
  | "add_lead_note"
  | "create_lead_task"
  | "update_lead_status"
  | "reassign_lead";

const STATE_CHANGING: ReadonlySet<ElayaWriteToolName> = new Set([
  "update_lead_status",
  "reassign_lead",
]);

export function isStateChangingWriteTool(name: string): boolean {
  return STATE_CHANGING.has(name as ElayaWriteToolName);
}

/** Context the brain threads in (which conversation/channel this turn belongs to). */
export type WriteToolContext = { conversationId: string; channel: ElayaChannel };

export type ElayaWriteTool = {
  name: ElayaWriteToolName;
  /** Roles permitted to even SEE the tool (toolset membership is the hard gate). */
  roles: readonly UserRole[];
  description: string;
  schema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  run: (
    principal: ElayaPrincipal,
    input: Record<string, unknown>,
    ctx: WriteToolContext,
  ) => Promise<unknown>;
};

const STAFF_ALL: readonly UserRole[] = ["agent", "manager", "admin", "founder"];
const MANAGER_UP: readonly UserRole[] = ["manager", "admin", "founder"];

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

function actorFromPrincipal(principal: ElayaPrincipal): MutationActor {
  return {
    userId: principal.userId,
    role: principal.role,
    domain: principal.domain,
    fullName: principal.displayName,
  };
}

function canAccessLead(principal: ElayaPrincipal, lead: LeadWithAssignee): boolean {
  if (principal.role === "admin" || principal.role === "founder") return true;
  if (principal.role === "manager") return lead.domain === principal.domain;
  if (principal.role === "agent") return lead.assigned_to === principal.userId;
  return false;
}

function leadDisplayName(lead: { first_name: string | null; last_name: string | null }): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "this lead";
}

function statusLabel(status: string): string {
  return LEAD_STATUS_LABELS[status as LeadStatus] ?? status;
}

const REFUSE_LEAD = "I couldn't find that lead among the ones you can act on. Double-check the lead with me first.";

// ─────────────────────────────────────────────
// LOW-RISK TOOLS — execute inline, write an `executed` audit row
// ─────────────────────────────────────────────

const addLeadNote: ElayaWriteTool = {
  name: "add_lead_note",
  roles: STAFF_ALL,
  description:
    "Add a note to a lead's timeline. Use this to record what happened on a call or a " +
    "detail about the lead. Takes the lead's slug (from search_leads). This happens " +
    "immediately — there is no confirmation step for notes.",
  schema: z.object({
    slug: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(2000),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "The lead slug (from search_leads results)" },
      content: { type: "string", description: "The note text" },
    },
    required: ["slug", "content"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { slug, content } = input as { slug: string; content: string };
    const lead = await getLeadBySlug(slug);
    if (!lead || !canAccessLead(principal, lead)) return { error: REFUSE_LEAD };

    const clean = sanitizeText(content);
    if (clean.length === 0) return { error: "The note was empty after cleaning — nothing to save." };

    const core = await addLeadNoteCore(actorFromPrincipal(principal), {
      leadId: lead.id,
      content: clean,
    });
    if (!core.ok) return { error: "I couldn't save that note just now." };

    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "add_lead_note",
      payload: {
        target: { slug: lead.slug, leadId: lead.id },
        args: { content: clean },
        channel: ctx.channel,
        before: null,
        after: { created: { noteId: core.noteId } },
      },
    });

    return {
      done: true,
      summary: `Note added to ${leadDisplayName(lead)}.`,
      noteId: core.noteId,
    };
  },
};

const createLeadTask: ElayaWriteTool = {
  name: "create_lead_task",
  roles: STAFF_ALL,
  description:
    "Create a follow-up task on a lead (e.g. send a brochure, call back). Takes the " +
    "lead's slug. The task is assigned to the lead's current owner. Happens immediately " +
    "— no confirmation step for tasks.",
  schema: z.object({
    slug: z.string().trim().min(1).max(160),
    taskType: z.enum(["call", "whatsapp_message", "other"]).default("other"),
    description: z.string().trim().max(1000).optional(),
    priority: z.enum(["urgent", "high", "normal"]).default("normal"),
    dueAt: z.string().trim().max(40).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "The lead slug" },
      taskType: { type: "string", enum: ["call", "whatsapp_message", "other"], description: "Defaults to other" },
      description: { type: "string", description: "What the task is (e.g. 'Send the spa brochure')" },
      priority: { type: "string", enum: ["urgent", "high", "normal"], description: "Defaults to normal" },
      dueAt: { type: "string", description: "Optional ISO 8601 due date-time" },
    },
    required: ["slug"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const {
      slug, taskType, description, priority, dueAt,
    } = input as {
      slug: string;
      taskType: "call" | "whatsapp_message" | "other";
      description?: string;
      priority: "urgent" | "high" | "normal";
      dueAt?: string;
    };
    const lead = await getLeadBySlug(slug);
    if (!lead || !canAccessLead(principal, lead)) return { error: REFUSE_LEAD };

    const cleanDescription = description ? sanitizeText(description) : null;

    const core = await createLeadTaskCore(
      actorFromPrincipal(principal),
      {
        leadId: lead.id,
        taskType,
        description: cleanDescription,
        priority,
        dueAt: dueAt ?? null,
      },
      lead.assigned_to,
    );
    if (!core.ok) return { error: "I couldn't create that task just now." };

    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "create_lead_task",
      payload: {
        target: { slug: lead.slug, leadId: lead.id },
        args: { taskType, description: cleanDescription, priority, dueAt: dueAt ?? null },
        channel: ctx.channel,
        before: null,
        after: {
          created: {
            taskId: core.task.id,
            title: core.task.title,
            taskType,
            priority,
            dueAt: core.task.due_at,
            assignedTo: core.task.assigned_to,
          },
        },
      },
    });

    return {
      done: true,
      summary: `Created a "${TASK_TYPE_LABELS[taskType]}" follow-up on ${leadDisplayName(lead)}.`,
      taskId: core.task.id,
    };
  },
};

// ─────────────────────────────────────────────
// STATE-CHANGING TOOLS — propose only. NO mutation in run().
// ─────────────────────────────────────────────

const updateLeadStatus: ElayaWriteTool = {
  name: "update_lead_status",
  roles: STAFF_ALL,
  description:
    "Propose changing a lead's status (e.g. to in_discussion, won, lost). Takes the " +
    "lead's slug. This is a bigger step: calling it records a proposal and WAITS — it " +
    "does NOT change the status yet. Tell the user what you're about to do and ask them " +
    "to confirm with a yes. Never say the status changed until the system confirms it executed.",
  schema: z.object({
    slug: z.string().trim().min(1).max(160),
    status: z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]),
    reason: z.string().trim().max(500).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "The lead slug" },
      status: { type: "string", enum: [...LEAD_STATUSES], description: "The target status" },
      reason: { type: "string", description: "Optional reason (used for lost/junk)" },
    },
    required: ["slug", "status"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { slug, status, reason } = input as { slug: string; status: LeadStatus; reason?: string };
    const lead = await getLeadBySlug(slug);
    if (!lead || !canAccessLead(principal, lead)) return { error: REFUSE_LEAD };

    // No mutation. Supersede any prior live proposal, then record this one.
    await supersedePriorProposals(ctx.conversationId, principal.userId, principal.userId);
    const proposal = await insertProposedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "update_lead_status",
      payload: {
        target: { slug: lead.slug, leadId: lead.id },
        args: { status, reason: reason ? sanitizeText(reason) : null },
        channel: ctx.channel,
        before: { status: lead.status },
        after: null,
      },
    });
    if (!proposal) return { error: "I couldn't set that up just now." };

    return {
      proposalRecorded: true,
      message:
        `Proposal recorded (NOT yet done): move ${leadDisplayName(lead)} from ` +
        `${statusLabel(lead.status)} to ${statusLabel(status)}. Ask the user to confirm with a yes ` +
        `before it executes. Do not state it as done.`,
    };
  },
};

const reassignLead: ElayaWriteTool = {
  name: "reassign_lead",
  roles: MANAGER_UP, // agents cannot reassign — toolset membership is the hard gate
  description:
    "Propose reassigning a lead to a different agent (managers and above only). Takes the " +
    "lead's slug and the target agent's id. Records a proposal and WAITS — it does NOT " +
    "reassign yet. Ask the user to confirm with a yes. Never say it's reassigned until the " +
    "system confirms it executed.",
  schema: z.object({
    slug: z.string().trim().min(1).max(160),
    agentId: z.string().uuid(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "The lead slug" },
      agentId: { type: "string", description: "The target agent's user id (UUID)" },
    },
    required: ["slug", "agentId"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { slug, agentId } = input as { slug: string; agentId: string };
    const lead = await getLeadBySlug(slug);
    if (!lead || !canAccessLead(principal, lead)) return { error: REFUSE_LEAD };

    await supersedePriorProposals(ctx.conversationId, principal.userId, principal.userId);
    const proposal = await insertProposedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "reassign_lead",
      payload: {
        target: { slug: lead.slug, leadId: lead.id },
        args: { agentId },
        channel: ctx.channel,
        before: { assignedTo: lead.assigned_to, assigneeName: lead.assignee?.full_name ?? null },
        after: null,
      },
    });
    if (!proposal) return { error: "I couldn't set that up just now." };

    return {
      proposalRecorded: true,
      message:
        `Proposal recorded (NOT yet done): reassign ${leadDisplayName(lead)}. ` +
        `Ask the user to confirm with a yes before it executes. Do not state it as done.`,
    };
  },
};

// ─────────────────────────────────────────────
// Registry + per-role toolset
// ─────────────────────────────────────────────

const ALL_WRITE_TOOLS = [addLeadNote, createLeadTask, updateLeadStatus, reassignLead] as const;

export const WRITE_TOOL_REGISTRY = new Map<string, ElayaWriteTool>(
  ALL_WRITE_TOOLS.map((t) => [t.name, t]),
);

/** Write tools permitted for a role (used to extend TOOLSET_BY_ROLE). */
export function writeToolsForRole(role: UserRole): ElayaWriteToolName[] {
  return ALL_WRITE_TOOLS.filter((t) => t.roles.includes(role)).map((t) => t.name);
}

// ─────────────────────────────────────────────
// Executor for a CONFIRMED proposal — called ONLY by the brain resolver, never by a
// tool run(). Re-resolves the lead, re-checks access + that the before-snapshot still
// matches (optimistic-concurrency: never execute against a moved target), then runs
// the core. Returns a code-generated confirmation line (the model can't fabricate it).
// ─────────────────────────────────────────────

export type ProposalExecution = {
  status: "executed" | "failed";
  /** Deterministic line emitted to the user (code-generated, not model-authored). */
  line: string;
};

export async function executeProposedAction(
  principal: ElayaPrincipal,
  action: ElayaActionRow,
): Promise<ProposalExecution> {
  const payload = action.payload as {
    target?: { slug?: string | null; leadId?: string };
    args?: Record<string, unknown>;
    before?: Record<string, unknown> | null;
  };
  const slug = payload.target?.slug ?? null;

  // Re-resolve by slug (immutable across turns) + re-check access with the principal.
  const lead = slug ? await getLeadBySlug(slug) : null;
  if (!lead || !canAccessLead(principal, lead)) {
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "I couldn't complete that — I can no longer act on that lead." };
  }

  const actor = actorFromPrincipal(principal);

  try {
    if (action.action_type === "update_lead_status") {
      const target = payload.args?.status as LeadStatus | undefined;
      const reason = (payload.args?.reason as string | null | undefined) ?? null;
      const beforeStatus = (payload.before as { status?: string } | null)?.status;
      if (!target) {
        await markActionResolved(action.id, "failed", principal.userId);
        return { status: "failed", line: "I couldn't complete that — the proposal was incomplete." };
      }
      // Optimistic-concurrency: the lead's status must still be what it was when proposed.
      if (beforeStatus !== undefined && lead.status !== beforeStatus) {
        await markActionResolved(action.id, "failed", principal.userId);
        return {
          status: "failed",
          line: `${leadDisplayName(lead)}'s status changed since I asked (now ${statusLabel(lead.status)}). Tell me again what you'd like.`,
        };
      }

      const core = await updateLeadStatusCore(
        actor,
        { leadId: lead.id, status: target, reason },
        { slug: lead.slug, domain: lead.domain },
      );
      if (!core.ok) {
        await markActionResolved(action.id, "failed", principal.userId);
        return { status: "failed", line: "I couldn't change the status just now — try again in a moment." };
      }

      await markActionResolved(action.id, "executed", principal.userId, {
        ...action.payload,
        after: { status: target, reason },
      });
      return { status: "executed", line: `Done — ${leadDisplayName(lead)} is now ${statusLabel(target)}.` };
    }

    if (action.action_type === "reassign_lead") {
      const agentId = payload.args?.agentId as string | undefined;
      const beforeAssignee = (payload.before as { assignedTo?: string | null } | null)?.assignedTo;
      if (!agentId) {
        await markActionResolved(action.id, "failed", principal.userId);
        return { status: "failed", line: "I couldn't complete that — the proposal was incomplete." };
      }
      // Optimistic-concurrency: the lead must still be assigned to whom it was at propose time.
      if (beforeAssignee !== undefined && lead.assigned_to !== beforeAssignee) {
        await markActionResolved(action.id, "failed", principal.userId);
        return {
          status: "failed",
          line: `${leadDisplayName(lead)}'s owner changed since I asked. Tell me again what you'd like.`,
        };
      }

      // Fetch the target agent (mirrors assignLead's parallel fetch input).
      const admin = createAdminClient();
      const { data: assignedAgent } = await admin
        .from("profiles")
        .select("full_name, domain, is_active")
        .eq("id", agentId)
        .single();

      const core = await assignLeadCore(
        actor,
        { leadId: lead.id, agentId },
        {
          existingLead: {
            status: lead.status,
            domain: lead.domain,
            slug: lead.slug,
            first_name: lead.first_name,
            last_name: lead.last_name,
            phone: lead.phone,
          },
          assignedAgent: assignedAgent
            ? {
                full_name: assignedAgent.full_name as string | null,
                domain: assignedAgent.domain as string | null,
                is_active: assignedAgent.is_active as boolean,
              }
            : null,
        },
      );
      if (!core.ok) {
        await markActionResolved(action.id, "failed", principal.userId);
        return {
          status: "failed",
          line:
            core.error === "agent_unavailable"
              ? "I couldn't reassign — that agent isn't available in this domain."
              : "I couldn't reassign that lead — you don't have permission for it.",
        };
      }

      // notifyLeadAssigned is awaited directly: the resolver runs inside the SSE stream
      // (lambda alive until the stream closes) or inside the WhatsApp route's after()
      // — both already keep the lambda alive, so no nested after() is needed (A-16).
      await notifyLeadAssigned(core.notify).catch((err) =>
        console.error("[elaya-write] notifyLeadAssigned failed (non-fatal):", err),
      );

      await markActionResolved(action.id, "executed", principal.userId, {
        ...action.payload,
        after: { assignedTo: agentId, agentName: core.notify.agentName },
      });
      return { status: "executed", line: `Done — ${leadDisplayName(lead)} has been reassigned.` };
    }

    // Unknown action_type on a proposed row — should never happen (only the two state
    // tools insert proposed rows). Fail closed.
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "I couldn't complete that action." };
  } catch (e) {
    console.error("[elaya-write] proposal execution threw:", e instanceof Error ? e.message : e);
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "Something went wrong completing that — try again." };
  }
}

// Used by ElayaActionType callers needing the union without importing the service.
export type { ElayaActionType };

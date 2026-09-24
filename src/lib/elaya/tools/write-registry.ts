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
//   • takes a `leadId` (the opaque id/slug ref from search_leads, never a name) → the
//     model must search_leads first; ambiguity handling lives in the read flow + persona,
//     with this tool layer as the hard backstop (ref not found / not accessible → refuse).
//     getLeadByRefForElaya resolves a UUID or a slug, so the model never has to reproduce
//     the PII-derived slug string (the slug-corruption / round-trip hazard).
//   • re-checks access with the PRINCIPAL via canAccessLead — identity is never
//     model-supplied (prompt-injection defence: injected text cannot widen scope).
//   • wraps a shared mutation core (lead-mutations.ts) — never a raw table write, so it
//     inherits cache invalidation + activity logging + SLA + notifications identically.

import { z } from "zod";
import type { StaffPrincipal } from "@/lib/elaya/principal";
// Elaya runs in BOTH a session context (in-app SSE) AND sessionless contexts
// (WhatsApp webhook; the SSE stream after the cookie session is no longer on the
// request). The write tools must resolve the lead the same way the READ tool does
// — via the ADMIN-member getLeadByRefForElaya, NEVER the session-member
// getLeadBySlug (.single() on a cookie member returns 0 rows → 406 → null →
// REFUSE_LEAD even for a lead the user owns). Identity is re-checked immediately
// after via canAccessLead(principal, …) (the per-resource trust boundary, Q-13),
// so the broad admin read is safe — exactly the get_lead_details pattern.
import { getLeadByRefForElaya } from "@/lib/services/leads-service";
import { createElayaJob, advanceElayaJob } from "@/lib/services/elaya-jobs-service";
import { startDeepReadJob } from "@/trigger/elaya-deep-read";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addLeadNoteCore,
  addLeadCallNoteCore,
  createLeadTaskCore,
  updateLeadStatusCore,
  assignLeadCore,
  recordDealCore,
  type MutationActor,
} from "@/lib/services/lead-mutations";
import {
  canMutateTask,
  isAssigneeActive,
  createPersonalTaskCore,
  createGroupTaskCore,
  createSubtaskCore,
  updateTaskStatusCore,
  updateTaskCore,
  deleteTaskCore,
  type CallerProfile,
  type TaskMutationTarget, setTaskNudgeCore } from "@/lib/services/task-mutations";
// The task → lead link lives in the gia schema: its own read, never an embed (PGRST200).
import { isLeadTask } from "@/lib/services/gia-task-links";
// The group access gate for create_subtask — admin-twin read (channel-safe), reusing
// the principal's visible-group set (the access check IS membership in that set).
import { getVisibleGroupById, getTicketFor } from "@/lib/elaya/elaya-data";
import { addTicketNoteCore, moveTicketStatusCore } from "@/lib/services/ticket-mutations";
import { wakeTicketNow } from "@/lib/services/ticket-sentinel";
import { canTransition, TICKET_STATUSES, TICKET_TRANSITIONS, type TicketStatus } from "@/lib/constants/tickets";
import {
  insertExecutedAction,
  insertProposedAction,
  markActionResolved,
  supersedePriorProposals,
  type ElayaActionType,
} from "@/lib/services/elaya-actions-service";
import { notifyLeadAssigned } from "@/lib/services/lead-assignment-notify";
import { LEAD_STATUSES } from "@/lib/constants/lead-statuses";
import { canAccessLead, leadDisplayName, statusLabel } from "@/lib/elaya/access";
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from "@/lib/constants/call-outcomes";
import {
  DEAL_CATEGORY_ENUM,
  DEAL_TYPE_LABELS,
  DEAL_DURATION_LABELS,
  DEAL_CATEGORY_LABELS,
  dealTypeForDomain,
  resolveDealShapeForDomain,
  type DealDuration,
  type DealCategory,
} from "@/lib/constants/deal-types";
import { isGiaDomain, type GiaDomain } from "@/lib/constants/domains";
import { formatCurrency } from "@/lib/utils/numbers";
import { TASK_TYPE_LABELS } from "@/lib/constants/task-types";
import { TASK_STATUS } from "@/lib/constants/task-constants";
import { APP_DOMAINS } from "@/lib/constants/domains";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeDueAtToIstInstant } from "@/lib/utils/ist";
import type { UserRole, AppDomain } from "@/lib/types";
import type { LeadStatus, TaskStatus, TaskPriority, CallOutcome } from "@/lib/types/database";
import type { ElayaActionRow, ElayaChannel } from "@/lib/types/elaya";

export type ElayaWriteToolName =
  // Lead writes (E3)
  | "add_lead_note"
  | "log_call"
  | "create_lead_task"
  | "update_lead_status"
  | "reassign_lead"
  | "log_deal"
  // Task writes (Brief 3)
  | "create_personal_task"
  | "create_group_task"
  | "create_subtask"
  | "update_task_status"
  | "update_task"
  | "delete_task"
  // Ticket writes (Sia, 0200): a note executes inline; a move is a proposal.
  | "add_ticket_note"
  | "move_ticket_status"
  | "start_deep_read";

// THE STATE-CHANGING (propose-only) TIER — update_lead_status, reassign_lead,
// log_deal, delete_task. The tier is enforced STRUCTURALLY, not by a lookup:
// each of these tools' run() calls supersedePriorProposals + insertProposedAction
// and has NO branch that reaches a mutation core — only the brain resolver
// (executeProposedAction) mutates, on an affirmative human reply.
//   • log_deal records money AND flips the lead to Won — a real, reportable record.
//   • delete_task is the ONLY state-changing task tier; the four other task tools
//     execute inline (low-risk: a created/edited task is trivially reversible).
// (The former STATE_CHANGING Set + isStateChangingWriteTool helper were removed
// 2026-07-02 — zero runtime consumers; this comment is the surviving record.
// When adding a state-changing tool, follow the run()-shape contract above.)

/** Context the brain threads in (which conversation/channel this turn belongs to). */
export type WriteToolContext = {
  conversationId: string;
  channel: ElayaChannel;
  /** A larger result allowance than the tool's own (the MCP connector's clients have far more room
   *  than the WhatsApp brain). Never lowers a tool's cap. */
  maxResultChars?: number;
};

export type ElayaWriteTool = {
  name: ElayaWriteToolName;
  /** Roles permitted to even SEE the tool (toolset membership is the hard gate). */
  roles: readonly UserRole[];
  description: string;
  schema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  run: (
    principal: StaffPrincipal,
    input: Record<string, unknown>,
    ctx: WriteToolContext,
  ) => Promise<unknown>;
};

const STAFF_ALL: readonly UserRole[] = ["agent", "manager", "admin", "founder"];
/** The deep read (0235) reads across every queendom, so it is the founders' and admins' tool, like query_database. */
const FOUNDER_UP: readonly UserRole[] = ["admin", "founder"];
const MANAGER_UP: readonly UserRole[] = ["manager", "admin", "founder"];

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

function actorFromPrincipal(principal: StaffPrincipal): MutationActor {
  return {
    userId: principal.userId,
    role: principal.role,
    domain: principal.domain,
    fullName: principal.displayName,
  };
}

/**
 * The {id,role,domain} shape canMutateTask takes — principal-derived, NEVER model-
 * supplied. canMutateTask uses the passed member ONLY for a read-only group-domain
 * SELECT; it never reads auth.uid() and never relies on RLS, so the admin client the
 * tool layer passes does not widen access (the caller object IS the identity).
 */
function callerFromPrincipal(principal: StaffPrincipal): CallerProfile {
  return {
    id: principal.userId,
    role: principal.role,
    domain: principal.domain,
  };
}

// Task vocabulary the model may supply (mirrors validations/task-schemas.ts).
const TASK_PRIORITIES = ["urgent", "high", "normal"] as const;
const TASK_STATUSES = [
  "to_do",
  "in_progress",
  "in_review",
  "completed",
  "error",
  "cancelled",
] as const;

function taskStatusLabel(status: string): string {
  return TASK_STATUS[status as TaskStatus]?.label ?? status;
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
    "detail about the lead. Takes the lead's leadId (from search_leads). This happens " +
    "immediately — there is no confirmation step for notes.",
  schema: z.object({
    leadId: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(2000),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "The lead id or slug (from search_leads results)" },
      content: { type: "string", description: "The note text" },
    },
    required: ["leadId", "content"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { leadId, content } = input as { leadId: string; content: string };
    const lead = await getLeadByRefForElaya(leadId);
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

// ── log_call — INLINE. The #1 daily agent action (H5). Unlike add_lead_note (a
// plain timeline note), this records a CALL with its OUTCOME: it sets
// last_call_outcome, bumps call_count, auto-advances new→touched, and arms the SLA
// follow-up cadence — byte-identical to logging a call in the app, because it wraps
// the SAME addLeadCallNoteCore the addLeadCallNote action uses (R-01). Use this
// whenever the user says they called/phoned/tried a lead; use add_lead_note only for
// a non-call observation.
const logCall: ElayaWriteTool = {
  name: "log_call",
  roles: STAFF_ALL,
  description:
    "Log a phone call to a lead with its outcome. Use this whenever the user says they called, " +
    "phoned, rang, or tried to reach a lead (e.g. 'I called Akhil, no answer' or 'spoke to Priya, " +
    "she's interested'). Takes the lead's leadId, the call outcome, and an optional note of what was " +
    "said. This records the outcome, advances the lead to Touched if it was New, and arms the " +
    "follow-up reminder — a plain note does NOT. Happens immediately — no confirmation step.",
  schema: z.object({
    leadId: z.string().trim().min(1).max(160),
    outcome: z.enum(CALL_OUTCOMES as [CallOutcome, ...CallOutcome[]]),
    note: z.string().trim().max(2000).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "The lead id or slug (from search_leads results)" },
      outcome: {
        type: "string",
        enum: [...CALL_OUTCOMES],
        description:
          "rnr = rang no response; switched_off = phone off; wrong_number; conversing = had a conversation; other",
      },
      note: { type: "string", description: "Optional note of what happened on the call" },
    },
    required: ["leadId", "outcome"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { leadId, outcome, note } = input as {
      leadId: string;
      outcome: CallOutcome;
      note?: string;
    };
    const lead = await getLeadByRefForElaya(leadId);
    if (!lead || !canAccessLead(principal, lead)) return { error: REFUSE_LEAD };

    // The RPC requires note content; default to a sensible line from the outcome
    // label when the user only stated the outcome (mirrors how the app's CalledModal
    // always carries a note). Sanitised before the write.
    const rawContent = note && note.trim().length > 0 ? note : CALL_OUTCOME_LABELS[outcome];
    const clean = sanitizeText(rawContent);
    if (clean.length === 0) return { error: "The call note was empty after cleaning — nothing to save." };

    const core = await addLeadCallNoteCore(
      actorFromPrincipal(principal),
      { leadId: lead.id, content: clean, callOutcome: outcome },
      { slug: lead.slug, domain: lead.domain },
    );
    if (!core.ok) return { error: "I couldn't log that call just now." };

    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "log_call",
      payload: {
        target: { slug: lead.slug, leadId: lead.id },
        args: { outcome, content: clean },
        channel: ctx.channel,
        before: null,
        after: { created: { noteId: core.noteId, outcome } },
      },
    });

    return {
      done: true,
      summary: `Logged a call to ${leadDisplayName(lead)} (${CALL_OUTCOME_LABELS[outcome]}).`,
      noteId: core.noteId,
    };
  },
};

const createLeadTask: ElayaWriteTool = {
  name: "create_lead_task",
  roles: STAFF_ALL,
  description:
    "Create a follow-up task on a lead (e.g. send a brochure, call back). Takes the " +
    "lead's leadId. The task is assigned to the lead's current owner. Happens immediately " +
    "— no confirmation step for tasks.",
  schema: z.object({
    leadId: z.string().trim().min(1).max(160),
    taskType: z.enum(["call", "whatsapp_message", "other"]).default("other"),
    description: z.string().trim().max(1000).optional(),
    priority: z.enum(["urgent", "high", "normal"]).default("normal"),
    dueAt: z.string().trim().max(40).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "The lead id or slug (from search_leads results)" },
      taskType: { type: "string", enum: ["call", "whatsapp_message", "other"], description: "Defaults to other" },
      description: { type: "string", description: "What the task is (e.g. 'Send the spa brochure')" },
      priority: { type: "string", enum: ["urgent", "high", "normal"], description: "Defaults to normal" },
      dueAt: { type: "string", description: "Optional ISO 8601 due date-time" },
    },
    required: ["leadId"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const {
      leadId, taskType, description, priority, dueAt,
    } = input as {
      leadId: string;
      taskType: "call" | "whatsapp_message" | "other";
      description?: string;
      priority: "urgent" | "high" | "normal";
      dueAt?: string;
    };
    const lead = await getLeadByRefForElaya(leadId);
    if (!lead || !canAccessLead(principal, lead)) return { error: REFUSE_LEAD };

    const cleanDescription = description ? sanitizeText(description) : null;
    // Interpret a zoneless "tomorrow 3pm"-style dueAt as IST before it becomes an instant.
    // The core (and its scheduleTaskReminder + p_due_at) then receives a true ISO instant;
    // an already-zoned string passes through unchanged. Conversion happens HERE only.
    const dueAtInstant = normalizeDueAtToIstInstant(dueAt);

    const core = await createLeadTaskCore(
      actorFromPrincipal(principal),
      {
        leadId: lead.id,
        taskType,
        description: cleanDescription,
        priority,
        dueAt: dueAtInstant,
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
        args: { taskType, description: cleanDescription, priority, dueAt: dueAtInstant },
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

    // Disclose where the task landed when it's NOT the lead's own owner — the core
    // assigns to lead.assigned_to, falling back to the actor when the lead is
    // unassigned. Surfacing that avoids a silent "it went to you" surprise.
    const assignedToCaller = core.task.assigned_to === principal.userId;
    const leadWasUnassigned = !lead.assigned_to;
    const summary =
      leadWasUnassigned && assignedToCaller
        ? `Created a "${TASK_TYPE_LABELS[taskType]}" follow-up on ${leadDisplayName(lead)} — that lead has no owner, so I assigned it to you.`
        : `Created a "${TASK_TYPE_LABELS[taskType]}" follow-up on ${leadDisplayName(lead)}.`;

    return {
      done: true,
      summary,
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
    "lead's leadId. This is a bigger step: calling it records a proposal and WAITS — it " +
    "does NOT change the status yet. Tell the user what you're about to do and ask them " +
    "to confirm with a yes. Never say the status changed until the system confirms it executed.",
  schema: z.object({
    leadId: z.string().trim().min(1).max(160),
    status: z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]),
    reason: z.string().trim().max(500).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "The lead id or slug (from search_leads results)" },
      status: { type: "string", enum: [...LEAD_STATUSES], description: "The target status" },
      reason: { type: "string", description: "Optional reason (used for lost/junk)" },
    },
    required: ["leadId", "status"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { leadId, status, reason } = input as { leadId: string; status: LeadStatus; reason?: string };
    const lead = await getLeadByRefForElaya(leadId);
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
    "lead's leadId and the target agent's id. Records a proposal and WAITS — it does NOT " +
    "reassign yet. Ask the user to confirm with a yes. Never say it's reassigned until the " +
    "system confirms it executed.",
  schema: z.object({
    leadId: z.string().trim().min(1).max(160),
    agentId: z.string().uuid(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "The lead id or slug (from search_leads results)" },
      agentId: { type: "string", description: "The target agent's user id (UUID)" },
    },
    required: ["leadId", "agentId"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { leadId, agentId } = input as { leadId: string; agentId: string };
    const lead = await getLeadByRefForElaya(leadId);
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

// ── log_deal — STATE-CHANGING (propose only). NO mutation in run(). ──
// Recording a deal is money + a real reportable record AND it flips the lead to
// Won — so it proposes and waits for an affirmative, exactly like update_lead_status.
// deal_type is DERIVED from the lead's domain (never model-supplied): onboarding →
// membership (needs a duration), shop → retail (needs a category), house/legacy →
// sale (neither). The shape is validated HERE at propose time so the model gets a
// clean "pick a duration" prompt before asking the user to confirm, and the
// confirmation line names the correct type/amount. The deal insert + Won flip land
// only in executeProposedAction's log_deal branch (via recordDealCore).
const logDeal: ElayaWriteTool = {
  name: "log_deal",
  roles: STAFF_ALL,
  description:
    "Propose recording a WON deal for a lead (the agent closed the sale). Takes the lead's leadId " +
    "and the amount in Indian Rupees. The deal TYPE is decided automatically by the lead's domain — " +
    "for a membership lead also pass durationMonths (3, 6 or 12); for a retail/shop lead also pass " +
    "category. This is a bigger step: it records money AND marks the lead Won, so calling it records " +
    "a proposal and WAITS — it does NOT save yet. Tell the user the amount and what you're about to " +
    "log, and ask them to confirm with a yes. Never say the deal is recorded until the system confirms " +
    "it executed. Amounts are always ₹ (INR) — never convert currency.",
  schema: z.object({
    leadId: z.string().trim().min(1).max(160),
    amount: z.number().positive().max(100_000_000),
    durationMonths: z.enum(["3", "6", "12"]).optional(),
    category: z.enum(DEAL_CATEGORY_ENUM).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "The lead id or slug (from search_leads results)" },
      amount: { type: "number", description: "The deal amount in Indian Rupees (₹), a positive number" },
      durationMonths: {
        type: "string",
        enum: ["3", "6", "12"],
        description: "Membership length in months — REQUIRED only for membership (onboarding) leads",
      },
      category: {
        type: "string",
        enum: [...DEAL_CATEGORY_ENUM],
        description: "Product category — REQUIRED only for retail (shop) leads",
      },
    },
    required: ["leadId", "amount"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { leadId, amount, durationMonths, category } = input as {
      leadId: string;
      amount: number;
      durationMonths?: "3" | "6" | "12";
      category?: (typeof DEAL_CATEGORY_ENUM)[number];
    };
    const lead = await getLeadByRefForElaya(leadId);
    if (!lead || !canAccessLead(principal, lead)) return { error: REFUSE_LEAD };

    // deal_type is DERIVED from the lead's domain — never model-supplied. A non-Gia
    // lead has no deal config.
    if (!isGiaDomain(lead.domain)) {
      return { error: "Deals can only be recorded for Gia-domain leads." };
    }
    const dealType = dealTypeForDomain(lead.domain as GiaDomain);
    // Map the model's friendly durationMonths → the stored DealDuration enum.
    const dealDuration =
      durationMonths === "3" ? "3_months"
      : durationMonths === "6" ? "6_months"
      : durationMonths === "12" ? "1_year"
      : null;

    // Validate the shape NOW (before the proposal) so the model can ask the user for
    // the missing piece in plain language instead of recording a doomed proposal.
    const resolved = resolveDealShapeForDomain(lead.domain as GiaDomain, {
      deal_duration: dealDuration,
      deal_category: category ?? null,
    });
    if (!resolved.ok) {
      // Translate the form-copy into a model-actionable instruction.
      if (dealType === "membership") {
        return { error: "This is a membership lead — ask the user for the membership length (3, 6 or 12 months) and pass it as durationMonths." };
      }
      if (dealType === "retail") {
        return { error: `This is a retail lead — ask the user which product category it is (${DEAL_CATEGORY_ENUM.join(", ")}) and pass it as category.` };
      }
      return { error: resolved.error };
    }

    // No mutation. Supersede any prior live proposal, then record this one. The args
    // stored are the CODE-RESOLVED shape (not raw model input) so the resolver
    // re-runs the exact deal the user is confirming.
    await supersedePriorProposals(ctx.conversationId, principal.userId, principal.userId);
    const proposal = await insertProposedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "log_deal",
      payload: {
        target: { slug: lead.slug, leadId: lead.id },
        args: {
          amount,
          dealType,
          dealDuration: resolved.shape.deal_duration,
          dealCategory: resolved.shape.deal_category,
        },
        channel: ctx.channel,
        before: { status: lead.status },
        after: null,
      },
    });
    if (!proposal) return { error: "I couldn't set that up just now." };

    // Code-derived confirmation line (amount + type), so the model states it accurately.
    const extra =
      resolved.shape.deal_duration
        ? ` (${DEAL_DURATION_LABELS[resolved.shape.deal_duration]})`
        : resolved.shape.deal_category
          ? ` (${DEAL_CATEGORY_LABELS[resolved.shape.deal_category]})`
          : "";
    return {
      proposalRecorded: true,
      message:
        `Proposal recorded (NOT yet done): record a ${DEAL_TYPE_LABELS[dealType]}${extra} deal for ` +
        `${leadDisplayName(lead)} at ${formatCurrency(amount)} and mark the lead Won. Ask the user to ` +
        `confirm with a yes before it executes. Do not state it as done.`,
    };
  },
};

// ═════════════════════════════════════════════
// TASK WRITE TOOLS (Brief 3) — general task work, NOT lead-attached.
//
// These wrap the task-mutations.ts cores (the SAME bodies actions/tasks.ts calls,
// R-01) and gate with canMutateTask — the per-resource access check the CALLER owns
// (Q-13: the core stays ungated). Identity is principal-derived (callerFromPrincipal /
// actorFromPrincipal), never model-supplied. The admin client is passed to
// canMutateTask only for its read-only group-domain lookup — it does not widen access.
//
// Tier split mirrors the lead tools structurally: four execute INLINE (a created or
// edited task is trivially reversible by the user); delete_task alone PROPOSES and
// waits for an affirmative — the mutation lands only in executeProposedAction.
// ═════════════════════════════════════════════

const REFUSE_TASK =
  "I couldn't find that task among the ones you can act on, or you're not allowed to change it. Check it with me first.";
const REFUSE_TASK_ASSIGN =
  "Only managers and above can assign a task to someone else. I can create it for you instead.";

const MANAGER_UP_ROLES: ReadonlySet<UserRole> = new Set(["manager", "admin", "founder"]);

// ── create_personal_task — INLINE ──
const createPersonalTask: ElayaWriteTool = {
  name: "create_personal_task",
  roles: STAFF_ALL,
  description:
    "Create a personal to-do for the user, OR assign a task to ONE teammate (managers and above). " +
    "Use this for a task with at most one assignee — 'remind me to file expenses tomorrow 3pm', or " +
    "'tell Pawani to call the member', 'remind Karan that we meet the cops'. For a task shared by TWO " +
    "OR MORE people, use create_group_task + create_subtask instead. Take the title straight from what " +
    "the user said — never ask what to call it. If no due time is given, leave it open (don't ask for " +
    "one). For another person, pass their userId from find_teammate. A REPEAT ('remind him every 3 " +
    "hours', 'keep nudging her till tonight'): pass remindEveryHours (0.5 to 24) and remindForHours " +
    "(default 24, max 72); the assignee is pinged again at that interval until the task is done or the " +
    "window ends. Happens immediately — no confirmation step. The result says which channels reached " +
    "the assignee: ALWAYS tell the user when the person has no phone on their profile (then it is " +
    "in-app only, they will see it when they open Serene) — never say 'done' as if a message landed.",
  schema: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(1000).optional(),
    priority: z.enum(TASK_PRIORITIES).default("normal"),
    dueAt: z.string().trim().max(40).optional(),
    assigneeId: z.string().uuid().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
    remindEveryHours: z.number().min(0.5).max(24).optional(),
    remindForHours: z.number().min(0.5).max(72).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "What the task is (short)" },
      description: { type: "string", description: "Optional detail" },
      priority: { type: "string", enum: [...TASK_PRIORITIES], description: "Defaults to normal" },
      dueAt: { type: "string", description: "Optional due date-time, e.g. '2026-06-16T15:00' (interpreted as IST)" },
      assigneeId: { type: "string", description: "Optional teammate user id (UUID) — managers+ only; omit to assign to the user" },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
      remindEveryHours: { type: "number", description: "Repeat the reminder to the assignee every N hours (0.5 to 24). Only when the user asks for a repeat." },
      remindForHours: { type: "number", description: "How long the repeat runs, in hours from now (default 24, max 72)" },
    },
    required: ["title"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { title, description, priority, dueAt, assigneeId, tags, remindEveryHours, remindForHours } = input as {
      title: string;
      description?: string;
      priority: (typeof TASK_PRIORITIES)[number];
      dueAt?: string;
      assigneeId?: string;
      tags?: string[];
      remindEveryHours?: number;
      remindForHours?: number;
    };

    // Assigning to ANOTHER user is manager+ only (mirrors createPersonalTaskAction).
    // The gate is the caller's job (Q-13); the core trusts it.
    const assigningToOther = !!assigneeId && assigneeId !== principal.userId;
    if (assigningToOther && !MANAGER_UP_ROLES.has(principal.role)) {
      return { error: REFUSE_TASK_ASSIGN };
    }
    // The assignee must exist + be active (M2 — mirror assertAssigneeActive in
    // actions/tasks.ts; never strand a task on a deactivated account).
    if (assigningToOther && !(await isAssigneeActive(assigneeId!))) {
      return { error: "That user isn't available to take the task." };
    }

    const cleanTitle = sanitizeText(title);
    if (cleanTitle.length === 0) return { error: "The task title was empty after cleaning." };
    const cleanDescription = description ? sanitizeText(description) : null;
    const cleanTags = (tags ?? []).map((t) => sanitizeText(t)).filter((t) => t.length > 0);
    const dueAtInstant = normalizeDueAtToIstInstant(dueAt);

    const nudge = remindEveryHours ? { everyMinutes: remindEveryHours * 60, forMinutes: (remindForHours ?? 24) * 60 } : null;
    const core = await createPersonalTaskCore(actorFromPrincipal(principal), {
      title: cleanTitle,
      description: cleanDescription,
      priority,
      dueAt: dueAtInstant,
      assignedTo: assigneeId ?? null,
      tags: cleanTags,
      nudge,
    });
    if (!core.ok) return { error: "I couldn't create that task just now." };

    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "create_personal_task",
      payload: {
        target: { taskId: core.taskId, groupId: null },
        args: { title: cleanTitle, description: cleanDescription, priority, dueAt: dueAtInstant, assignedTo: core.assignedTo, tags: cleanTags },
        channel: ctx.channel,
        before: null,
        after: { created: { taskId: core.taskId, assignedTo: core.assignedTo, createdBy: core.createdBy } },
      },
    });

    const forOther = core.assignedTo !== principal.userId;
    const reach = forOther ? await assigneeReach(core.assignedTo) : null;
    return {
      done: true,
      summary: forOther
        ? `Created "${cleanTitle}" and assigned it.`
        : `Created your task "${cleanTitle}".`,
      taskId: core.taskId,
      ...(reach ? { assignee_notified_via: reach.channels, assignee_has_phone: reach.hasPhone } : {}),
      ...(nudge ? { repeat: core.nudgeUntil ? { every_hours: remindEveryHours, until: core.nudgeUntil } : "could not be set" } : {}),
      note: forOther && reach && !reach.hasPhone
        ? "The assignee has NO phone number on their profile: nothing went to WhatsApp, only the in-app notification. Say this to the user plainly."
        : undefined,
    };
  },
};

/** How a task ping could reach a teammate right now: in-app always; WhatsApp only with a phone on the profile. */
async function assigneeReach(userId: string): Promise<{ hasPhone: boolean; channels: string[] }> {
  const { data } = await createAdminClient().from("profiles").select("phone").eq("id", userId).maybeSingle();
  const hasPhone = Boolean((data as { phone: string | null } | null)?.phone);
  return { hasPhone, channels: hasPhone ? ["in_app", "whatsapp"] : ["in_app"] };
}

// ── create_group_task — INLINE. All-staff; NO assignee (a group is a container; its
// subtasks carry assignees). Domain is locked to the actor's by the core for non-
// admin/founder — so this deliberately does NOT inherit reassign_lead's MANAGER_UP gate. ──
const createGroupTask: ElayaWriteTool = {
  name: "create_group_task",
  roles: STAFF_ALL,
  description:
    "Create a shared group/team task — the container for a goal TWO OR MORE people work on together. " +
    "Use the goal as the title, taken from what the user said (e.g. 'Build the dashboard on the mobile " +
    "app', 'Send the sales report'). Anyone can create one; it lives in the user's own domain (admins/" +
    "founders may target another). Happens immediately — no confirmation. This makes the container ONLY: " +
    "right after it, add one create_subtask PER person (each resolved via find_teammate) so they're all " +
    "on the shared goal. NEVER stop at the empty group, and never ask how to split the work.",
  schema: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(1000).optional(),
    priority: z.enum(TASK_PRIORITIES).default("normal"),
    dueAt: z.string().trim().max(40).optional(),
    domain: z.enum(APP_DOMAINS as [AppDomain, ...AppDomain[]]).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "The group/workspace title" },
      description: { type: "string", description: "Optional detail" },
      priority: { type: "string", enum: [...TASK_PRIORITIES], description: "Defaults to normal" },
      dueAt: { type: "string", description: "Optional due date-time (interpreted as IST)" },
      domain: { type: "string", enum: [...APP_DOMAINS], description: "Admins/founders only; everyone else is locked to their own domain" },
    },
    required: ["title"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { title, description, priority, dueAt, domain } = input as {
      title: string;
      description?: string;
      priority: (typeof TASK_PRIORITIES)[number];
      dueAt?: string;
      domain?: AppDomain;
    };

    const cleanTitle = sanitizeText(title);
    if (cleanTitle.length === 0) return { error: "The group title was empty after cleaning." };
    const cleanDescription = description ? sanitizeText(description) : null;
    const dueAtInstant = normalizeDueAtToIstInstant(dueAt);

    // The core re-derives the effective domain (own domain unless admin/founder) — we
    // pass the requested one; a non-privileged actor's value is ignored by the core.
    const core = await createGroupTaskCore(actorFromPrincipal(principal), {
      title: cleanTitle,
      description: cleanDescription,
      priority,
      dueAt: dueAtInstant,
      domain: domain ?? principal.domain,
    });
    if (!core.ok) return { error: "I couldn't create that group task just now." };

    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "create_group_task",
      payload: {
        // A group is a container, not a task — target carries groupId only (no taskId).
        target: { groupId: core.groupId },
        args: { title: cleanTitle, description: cleanDescription, priority, dueAt: dueAtInstant, domain: domain ?? principal.domain },
        channel: ctx.channel,
        before: null,
        after: { created: { groupId: core.groupId } },
      },
    });

    return {
      done: true,
      summary: `Created the group workspace "${cleanTitle}". You can add subtasks to it in Tasks.`,
      groupId: core.groupId,
    };
  },
};

// ── create_subtask — INLINE. Add ONE assigned subtask to an existing group. The
// completion of the group workflow: create_group_task makes the container, then this
// adds a member's piece of work. To put several people on a group ("include Arfam and
// Ethan"), call this once per person — resolve each via find_teammate first. Access
// gate: the group must be VISIBLE to the principal (getVisibleGroupById, the admin twin
// — channel-safe; admin/founder see all, manager/agent only groups they're part of).
// Subtask assignment notifies + WhatsApps the assignee via createSubtaskCore (R-01). ──
const createSubtask: ElayaWriteTool = {
  name: "create_subtask",
  roles: STAFF_ALL,
  description:
    "Add a single assigned subtask to an existing group/team workspace — this is how you put a " +
    "person on a group task. ALWAYS resolve the assignee with find_teammate FIRST to get their " +
    "userId, then call this with the group's groupId (from create_group_task or get_my_tasks) and " +
    "that assigneeId. To put several people on ONE shared goal (e.g. 'tell Murtuza and Vishal to send " +
    "the report'), create_group_task once, then call create_subtask once PER person — and give each " +
    "subtask the SAME shared-goal title (e.g. both get 'Send the sales report'). Don't split or invent " +
    "who-does-what — they're on one common goal and can divide it later. Take the title from what the " +
    "user said; don't ask. Happens immediately — no confirmation. The assignee is notified (in-app + WhatsApp).",
  schema: z.object({
    groupId: z.string().uuid(),
    assigneeId: z.string().uuid(),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(1000).optional(),
    priority: z.enum(TASK_PRIORITIES).default("normal"),
    dueAt: z.string().trim().max(40).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      groupId: { type: "string", description: "The group workspace id (UUID, from create_group_task or get_my_tasks)" },
      assigneeId: { type: "string", description: "The teammate's userId (UUID, from find_teammate) — who the subtask is for" },
      title: { type: "string", description: "What this person needs to do" },
      description: { type: "string", description: "Optional detail" },
      priority: { type: "string", enum: [...TASK_PRIORITIES], description: "Defaults to normal" },
      dueAt: { type: "string", description: "Optional due date-time (interpreted as IST)" },
    },
    required: ["groupId", "assigneeId", "title"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { groupId, assigneeId, title, description, priority, dueAt } = input as {
      groupId: string;
      assigneeId: string;
      title: string;
      description?: string;
      priority: (typeof TASK_PRIORITIES)[number];
      dueAt?: string;
    };

    // Access gate (Q-13) — the group must be one this principal can see. The core
    // trusts this. admin/founder pass on all; manager/agent only on groups they're in.
    const group = await getVisibleGroupById(principal, groupId);
    if (!group) {
      return { error: "I couldn't find that group among the ones you can add to. Create the group first, or check the name." };
    }

    // The assignee must exist + be active (M2 — never strand a subtask on a dead account).
    if (!(await isAssigneeActive(assigneeId))) {
      return { error: "That teammate isn't available to take the task." };
    }

    const cleanTitle = sanitizeText(title);
    if (cleanTitle.length === 0) return { error: "The subtask title was empty after cleaning." };
    const cleanDescription = description ? sanitizeText(description) : null;
    const dueAtInstant = normalizeDueAtToIstInstant(dueAt);

    const core = await createSubtaskCore(actorFromPrincipal(principal), {
      groupId,
      title: cleanTitle,
      description: cleanDescription,
      priority,
      dueAt: dueAtInstant,
      assignedTo: assigneeId,
    });
    if (!core.ok) return { error: "I couldn't add that subtask just now." };

    const subtaskId = core.subtask.id;
    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "create_subtask",
      payload: {
        target: { taskId: subtaskId, groupId },
        args: { title: cleanTitle, description: cleanDescription, priority, dueAt: dueAtInstant, assignedTo: assigneeId },
        channel: ctx.channel,
        before: null,
        after: { created: { taskId: subtaskId, groupId, assignedTo: assigneeId } },
      },
    });

    const assigneeName = core.subtask.assignee?.full_name ?? "your teammate";
    return {
      done: true,
      summary: `Added "${cleanTitle}" to "${group.title}" for ${assigneeName}.`,
      taskId: subtaskId,
    };
  },
};

// ── update_task_status — INLINE. Fetch + canMutateTask gate, then core. ──
const updateTaskStatus: ElayaWriteTool = {
  name: "update_task_status",
  roles: STAFF_ALL,
  description:
    "Change a task's status (e.g. mark it in progress, completed, cancelled). Takes the task's id " +
    "(from get_my_tasks). Happens immediately. Use get_my_tasks first to find the task id.",
  schema: z.object({
    taskId: z.string().uuid(),
    status: z.enum(TASK_STATUSES),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "The task id (UUID, from get_my_tasks)" },
      status: { type: "string", enum: [...TASK_STATUSES], description: "The target status" },
    },
    required: ["taskId", "status"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { taskId, status } = input as { taskId: string; status: TaskStatus };
    const admin = createAdminClient();
    const { data: task } = await admin
      .from("tasks")
      .select("id, assigned_to, created_by, group_id, status, task_category")
      .eq("id", taskId)
      .single();
    if (!task) return { error: REFUSE_TASK };
    const allowed = await canMutateTask(admin, callerFromPrincipal(principal), task as TaskMutationTarget);
    if (!allowed) return { error: REFUSE_TASK };

    if (task.status === status) {
      return { done: true, summary: `That task is already ${taskStatusLabel(status)}.`, taskId };
    }

    const core = await updateTaskStatusCore(
      actorFromPrincipal(principal),
      { taskId, status },
      {
        taskCategory: task.task_category as string | null,
        hasGiaMeta: await isLeadTask(admin, taskId),
      },
    );
    if (!core.ok) return { error: "I couldn't change that task's status just now." };

    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "update_task_status",
      payload: {
        target: { taskId, groupId: (task.group_id as string | null) ?? null },
        args: { status },
        channel: ctx.channel,
        before: { status: task.status },
        after: { status },
      },
    });

    return { done: true, summary: `Marked that task ${taskStatusLabel(status)}.`, taskId };
  },
};

// ── update_task — INLINE. Partial field update. Fetch + canMutateTask gate, then core. ──
const updateTask: ElayaWriteTool = {
  name: "update_task",
  roles: STAFF_ALL,
  description:
    "Edit a task's details — title, description, priority, status, due date, assignee, or a REPEAT " +
    "reminder (remindEveryHours: 'remind him every 3 hours' on a task that already exists). Takes the " +
    "task's id (from get_my_tasks, or the taskId a create returned earlier in this conversation) plus " +
    "only the fields to change. Happens immediately. To change ONLY the status, prefer update_task_status.",
  schema: z
    .object({
      taskId: z.string().uuid(),
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().trim().max(1000).optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      status: z.enum(TASK_STATUSES).optional(),
      assigneeId: z.string().uuid().optional(),
      // dueAt present (even null) means "change the due date"; omitted means "leave it".
      dueAt: z.string().trim().max(40).nullable().optional(),
      remindEveryHours: z.number().min(0.5).max(24).optional(),
      remindForHours: z.number().min(0.5).max(72).optional(),
    })
    .refine(
      (v) =>
        v.title !== undefined ||
        v.description !== undefined ||
        v.priority !== undefined ||
        v.status !== undefined ||
        v.assigneeId !== undefined ||
        v.dueAt !== undefined ||
        v.remindEveryHours !== undefined,
      { message: "give at least one field to change" },
    ),
  jsonSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "The task id (UUID, from get_my_tasks)" },
      title: { type: "string", description: "New title" },
      description: { type: "string", description: "New description" },
      priority: { type: "string", enum: [...TASK_PRIORITIES], description: "New priority" },
      status: { type: "string", enum: [...TASK_STATUSES], description: "New status" },
      assigneeId: { type: "string", description: "New assignee user id (UUID)" },
      dueAt: { type: ["string", "null"], description: "New due date-time (IST); null clears it; omit to leave unchanged" },
      remindEveryHours: { type: "number", description: "Set a REPEAT: ping the assignee every N hours (0.5 to 24) until done or the window ends ('remind him every 3 hours')" },
      remindForHours: { type: "number", description: "How long the repeat runs from now, in hours (default 24, max 72)" },
    },
    required: ["taskId"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const raw = input as {
      taskId: string;
      title?: string;
      description?: string;
      priority?: TaskPriority;
      status?: TaskStatus;
      assigneeId?: string;
      dueAt?: string | null;
      remindEveryHours?: number;
      remindForHours?: number;
    };
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("tasks")
      .select("id, assigned_to, created_by, group_id")
      .eq("id", raw.taskId)
      .single();
    if (!existing) return { error: REFUSE_TASK };
    const allowed = await canMutateTask(admin, callerFromPrincipal(principal), existing as TaskMutationTarget);
    if (!allowed) return { error: REFUSE_TASK };

    // Reassigning a task to a DIFFERENT user is manager+ only — mirror the
    // create_personal_task gate (M1: an agent who can edit a task must not be
    // able to dump it on a teammate). Only enforced when assigneeId actually
    // changes the owner (a no-op self-reassign is fine).
    const reassigningToOther =
      raw.assigneeId !== undefined &&
      raw.assigneeId !== principal.userId &&
      raw.assigneeId !== ((existing.assigned_to as string | null) ?? null);
    if (reassigningToOther && !MANAGER_UP_ROLES.has(principal.role)) {
      return { error: REFUSE_TASK_ASSIGN };
    }
    // The new assignee must exist + be active (M2 — mirror assertAssigneeActive
    // in actions/tasks.ts so a tool-driven edit can't strand a task on a
    // deactivated account). Only checked when the owner actually changes.
    if (reassigningToOther && !(await isAssigneeActive(raw.assigneeId!))) {
      return { error: "That user isn't available to take the task." };
    }

    const dueAtChanged = "dueAt" in raw && raw.dueAt !== undefined;
    const dueAtInstant = dueAtChanged ? normalizeDueAtToIstInstant(raw.dueAt) : null;

    // The repeat alone ("remind him every 3 hours") is a change of its own; the field edit below
    // runs only when a field was actually given.
    let repeat: { every_hours: number; until: string } | "could not be set" | undefined;
    if (raw.remindEveryHours) {
      const set = await setTaskNudgeCore(raw.taskId, { everyMinutes: raw.remindEveryHours * 60, forMinutes: (raw.remindForHours ?? 24) * 60 });
      repeat = set.ok ? { every_hours: raw.remindEveryHours, until: set.until } : "could not be set";
    }
    const fieldEdit =
      raw.title !== undefined || raw.description !== undefined || raw.priority !== undefined ||
      raw.status !== undefined || raw.assigneeId !== undefined || dueAtChanged;
    if (!fieldEdit) {
      if (!repeat) return { error: "Nothing to change." };
      await insertExecutedAction({
        conversationId: ctx.conversationId, userId: principal.userId, actionType: "update_task",
        payload: { target: { taskId: raw.taskId, groupId: (existing.group_id as string | null) ?? null }, args: { remindEveryHours: raw.remindEveryHours, remindForHours: raw.remindForHours }, channel: ctx.channel, before: null, after: { repeat } },
      });
      const reach = await assigneeReach((existing.assigned_to as string) ?? principal.userId);
      return { done: true, summary: "Set the repeat on that task.", taskId: raw.taskId, repeat, assignee_notified_via: reach.channels, assignee_has_phone: reach.hasPhone,
        note: reach.hasPhone ? undefined : "The assignee has NO phone number on their profile: the repeats reach them in-app only. Say this plainly." };
    }

    const core = await updateTaskCore(
      actorFromPrincipal(principal),
      {
        taskId: raw.taskId,
        title: raw.title !== undefined ? sanitizeText(raw.title) : undefined,
        description: raw.description !== undefined ? sanitizeText(raw.description) : undefined,
        priority: raw.priority,
        status: raw.status,
        assignedTo: raw.assigneeId,
        dueAt: dueAtInstant,
        dueAtChanged,
      },
      { assignedTo: (existing.assigned_to as string | null) ?? null },
    );
    if (!core.ok) return { error: "I couldn't update that task just now." };

    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "update_task",
      payload: {
        target: { taskId: raw.taskId, groupId: (existing.group_id as string | null) ?? null },
        args: {
          title: raw.title !== undefined ? sanitizeText(raw.title) : undefined,
          description: raw.description !== undefined ? sanitizeText(raw.description) : undefined,
          priority: raw.priority,
          status: raw.status,
          assignedTo: raw.assigneeId,
          dueAt: dueAtChanged ? dueAtInstant : undefined,
        },
        channel: ctx.channel,
        before: null,
        after: { updated: true },
      },
    });

    return { done: true, summary: "Updated that task.", taskId: raw.taskId, ...(repeat ? { repeat } : {}) };
  },
};

// ── delete_task — STATE-CHANGING (propose only). NO mutation in run(). ──
// The payload carries the taskId + a code-derived human title so the confirmation line
// names the right task. The model never supplies the confirmation, and the delete target
// is the stored taskId (not any text), so injected note/description text cannot redirect
// or trigger the delete. The mutation lands in executeProposedAction's delete_task branch.
const deleteTask: ElayaWriteTool = {
  name: "delete_task",
  roles: STAFF_ALL,
  description:
    "Propose deleting a task permanently. Takes the task's id (from get_my_tasks). This is a bigger " +
    "step: calling it records a proposal and WAITS — it does NOT delete yet. Tell the user which task " +
    "you're about to delete and ask them to confirm with a yes. Never say it's deleted until the system confirms it executed.",
  schema: z.object({
    taskId: z.string().uuid(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "The task id (UUID, from get_my_tasks)" },
    },
    required: ["taskId"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { taskId } = input as { taskId: string };
    const admin = createAdminClient();
    const { data: task } = await admin
      .from("tasks")
      .select("id, assigned_to, created_by, group_id, title, task_category")
      .eq("id", taskId)
      .single();
    if (!task) return { error: REFUSE_TASK };
    const allowed = await canMutateTask(admin, callerFromPrincipal(principal), task as TaskMutationTarget);
    if (!allowed) return { error: REFUSE_TASK };

    // The human-readable label is CODE-derived from the DB row (not model text) so the
    // confirmation line names the right task and no injected text can sit in it.
    const label = sanitizeText((task.title as string | null) ?? "this task") || "this task";

    await supersedePriorProposals(ctx.conversationId, principal.userId, principal.userId);
    const proposal = await insertProposedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "delete_task",
      payload: {
        target: { taskId, groupId: (task.group_id as string | null) ?? null },
        args: { taskTitle: label, taskCategory: (task.task_category as string | null) ?? null },
        channel: ctx.channel,
        before: { title: label },
        after: null,
      },
    });
    if (!proposal) return { error: "I couldn't set that up just now." };

    return {
      proposalRecorded: true,
      message:
        `Proposal recorded (NOT yet done): delete the task "${label}". Ask the user to confirm with a yes ` +
        `before it executes. Do not state it as done.`,
    };
  },
};

// ─────────────────────────────────────────────
// Registry + per-role toolset
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// TICKET TOOLS (Sia). The ticket is looked up through elaya-data (principal-scoped: the
// queendom, or every queendom for admin/founder) and written through the SAME cores the
// ticket page uses, so an Elaya note or move is indistinguishable from one made in the app
// — the diary shows who, the sentinel wakes on it, the board re-reads.
// ─────────────────────────────────────────────

const REFUSE_TICKET = "I couldn't find that ticket among the ones you can act on. Check the number with list_tickets first.";

const addTicketNote: ElayaWriteTool = {
  name: "add_ticket_note",
  roles: STAFF_ALL,
  description:
    "Add an internal note to a Sia ticket's diary (what happened, what the vendor said, a cost). " +
    "Takes the ticket number (T-000042) from list_tickets. Happens immediately; the sentinel reads " +
    "the note and updates the ticket's summary, checklist and money from it.",
  schema: z.object({ ticket: z.string().trim().min(1).max(60), note: z.string().trim().min(1).max(2000) }),
  jsonSchema: {
    type: "object",
    properties: {
      ticket: { type: "string", description: "The ticket number (T-000042) or id" },
      note: { type: "string", description: "The note text" },
    },
    required: ["ticket", "note"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { ticket, note } = input as { ticket: string; note: string };
    const d = await getTicketFor(principal, ticket);
    if (!d) return { error: REFUSE_TICKET };
    const clean = sanitizeText(note);
    if (!clean) return { error: "The note was empty after cleaning — nothing to save." };
    const core = await addTicketNoteCore(d.ticket.id, clean, actorFromPrincipal(principal));
    if (core.error || !core.data) return { error: "I couldn't save that note just now." };
    // The sentinel reads the note now (the WhatsApp path already runs inside after(); a plain await is right here).
    await wakeTicketNow(d.ticket.id);
    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "add_ticket_note",
      payload: { target: { ticketId: d.ticket.id, ticketNo: d.ticket.ticket_no }, args: { note: clean }, channel: ctx.channel, before: null, after: { created: { eventId: core.data.id } } },
    });
    return { done: true, summary: `Note added to ${d.ticket.ticket_no} (${d.ticket.title}).`, eventId: core.data.id };
  },
};

const moveTicketStatus: ElayaWriteTool = {
  name: "move_ticket_status",
  roles: STAFF_ALL,
  description:
    "Propose moving a Sia ticket to another status (sourcing, awaiting_member, awaiting_vendor, in_delivery, " +
    "payment_due, resolved, dropped, or open to reopen). Takes the ticket number (T-000042). This records a " +
    "proposal and WAITS — it does NOT move the ticket yet. Tell the user what you are about to do and ask them " +
    "to confirm with a yes. Only the moves get_ticket lists under allowedMoves are possible.",
  schema: z.object({
    ticket: z.string().trim().min(1).max(60),
    status: z.enum(TICKET_STATUSES.zodEnum),
    note: z.string().trim().max(500).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      ticket: { type: "string", description: "The ticket number (T-000042) or id" },
      status: { type: "string", enum: [...TICKET_STATUSES.values], description: "The target status" },
      note: { type: "string", description: "Optional line for the diary (why)" },
    },
    required: ["ticket", "status"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { ticket, status, note } = input as { ticket: string; status: TicketStatus; note?: string };
    const d = await getTicketFor(principal, ticket);
    if (!d) return { error: REFUSE_TICKET };
    if (!canTransition(d.ticket.status, status)) {
      return { error: `A ticket cannot go from ${TICKET_STATUSES.labels[d.ticket.status]} to ${TICKET_STATUSES.labels[status]}. Allowed: ${TICKET_TRANSITIONS[d.ticket.status].join(", ")}.` };
    }
    await supersedePriorProposals(ctx.conversationId, principal.userId, principal.userId);
    const proposal = await insertProposedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "move_ticket_status",
      payload: {
        target: { ticketId: d.ticket.id, ticketNo: d.ticket.ticket_no },
        args: { status, note: note ? sanitizeText(note) : null, title: d.ticket.title },
        channel: ctx.channel,
        before: { status: d.ticket.status },
        after: null,
      },
    });
    if (!proposal) return { error: "I couldn't set that up just now." };
    return {
      proposalRecorded: true,
      message:
        `Proposal recorded (NOT yet done): move ${d.ticket.ticket_no} (${d.ticket.title}) from ` +
        `${TICKET_STATUSES.labels[d.ticket.status]} to ${TICKET_STATUSES.labels[status]}. Ask the user to confirm with a yes ` +
        `before it executes. Do not state it as done.`,
    };
  },
};


// ── start_deep_read — INLINE (0235). Queuing the job IS the act; the answer arrives later. ──
const startDeepRead: ElayaWriteTool = {
  name: "start_deep_read",
  roles: FOUNDER_UP,
  description:
    "Start a DEEP READ: a background job that reads and judges the free text of many rows (hundreds " +
    "to tens of thousands) and answers in a few minutes on this same chat. Use it ONLY when the answer is " +
    "not in any column and no query can compute it: classify tickets by a theme no category holds ('how " +
    "many tickets are health and wellness, and the share'), who sounded unhappy across all member groups " +
    "this month, which requests are about X in spirit rather than by keyword, what kinds of things members " +
    "ask for at night. Do NOT use it for counts, filters, rankings or trends that query_database can do, " +
    "nor for one member or one ticket (get_member_360 / get_freshdesk_ticket). Pass the user's question in " +
    "their own words, complete (the window, the scope, what counts). It returns at once with a job id: tell " +
    "the user in one line that this needs a full read of the data, it is running now, and the answer will " +
    "land in this chat in a few minutes; do not attempt the answer yourself and do not call it twice for " +
    "the same question. The labels it decides are saved and topped up every night, so a follow-up ('split " +
    "that by queendom', 'how many this week') is a quick query_database over the labels view afterwards, and " +
    "a repeat of the same question is fast: rows judged before keep their verdict, only new rows are read. " +
    "There is no size limit: a question over the whole history reads the whole history, in more than one run " +
    "if needed, and every answer ends with what it cost. When the estimated cost is above the founders' spend " +
    "cap the read stops and asks first (a line in this chat); if the user then agrees, call this again with " +
    "the same question and confirm_spend: true. Never pass confirm_spend without that agreement.",
  schema: z.object({
    question: z.string().trim().min(10).max(1200),
    confirm_spend: z.boolean().optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The founder's question, complete and in their words (window, scope, what counts)" },
      confirm_spend: { type: "boolean", description: "true ONLY after the user agreed to a spend the read asked about" },
    },
    required: ["question"],
    additionalProperties: false,
  },
  run: async (principal, input, ctx) => {
    const { question, confirm_spend } = input as { question: string; confirm_spend?: boolean };
    const clean = sanitizeText(question);
    if (clean.length < 10) return { error: "The question was empty after cleaning." };
    const job = await createElayaJob({ kind: "deep_read", requestedBy: principal.userId, conversationId: ctx.conversationId, channel: ctx.channel, question: clean, plan: confirm_spend ? { confirm_spend: true } : {} });
    if (!job) return { error: "The read could not be queued just now. Say it did not start and offer to try again." };
    try {
      await startDeepReadJob(job.id);
    } catch (e) {
      console.error("[write-registry] start_deep_read trigger failed:", e instanceof Error ? e.message : e);
      await advanceElayaJob(job.id, "failed", { error: "could not start the runner" });
      return { error: "The read was recorded but its runner could not be started. Say it did not start and that the tech team should look." };
    }
    await insertExecutedAction({
      conversationId: ctx.conversationId,
      userId: principal.userId,
      actionType: "start_deep_read",
      payload: { target: { jobId: job.id }, args: { question: clean }, channel: ctx.channel, before: null, after: { status: "queued" } },
    });
    return {
      queued: true,
      job_id: job.id,
      note: "Tell the user: this needs a full read of the data, it is running now, and the answer will arrive in this chat in a few minutes (on WhatsApp as a new message). Do not answer the question yourself now.",
    };
  },
};

const ALL_WRITE_TOOLS = [
  logCall,
  // Lead writes (E3)
  addLeadNote,
  createLeadTask,
  updateLeadStatus,
  reassignLead,
  logDeal,
  // Task writes (Brief 3)
  createPersonalTask,
  createGroupTask,
  createSubtask,
  updateTaskStatus,
  updateTask,
  deleteTask,
  // Ticket writes (Sia)
  addTicketNote,
  moveTicketStatus,
  // The deep read (0235)
  startDeepRead,
] as const;

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
  principal: StaffPrincipal,
  action: ElayaActionRow,
): Promise<ProposalExecution> {
  // delete_task is the only state-changing TASK proposal — it has a task-shaped target
  // and its own resolver path (re-fetch by taskId, re-gate, fail-closed if already gone).
  if (action.action_type === "delete_task") {
    return executeProposedTaskDelete(principal, action);
  }
  if (action.action_type === "move_ticket_status") {
    return executeProposedTicketMove(principal, action);
  }

  const payload = action.payload as {
    target?: { slug?: string | null; leadId?: string };
    args?: Record<string, unknown>;
    before?: Record<string, unknown> | null;
  };
  // Prefer the immutable leadId (UUID) over the slug — both are stored at propose
  // time (code-derived, never model-supplied), but the id never drifts even if the
  // lead is renamed. Fall back to slug for any legacy proposal row missing leadId.
  const ref = payload.target?.leadId ?? payload.target?.slug ?? null;

  // Re-resolve by the stable ref + re-check access with the principal.
  const lead = ref ? await getLeadByRefForElaya(ref) : null;
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
        after: { status: target, reason, changed: core.result.changed },
      });
      // The proposal is resolved (executed) either way — but be honest about whether the row
      // actually moved. A no-op (the lead was already in the target status) must NOT claim "Done".
      return {
        status: "executed",
        line: core.result.changed
          ? `Done — ${leadDisplayName(lead)} is now ${statusLabel(target)}.`
          : `${leadDisplayName(lead)} was already ${statusLabel(target)} — nothing to change.`,
      };
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

    if (action.action_type === "log_deal") {
      const amount = payload.args?.amount as number | undefined;
      const dealDuration = (payload.args?.dealDuration as string | null | undefined) ?? null;
      const dealCategory = (payload.args?.dealCategory as string | null | undefined) ?? null;
      if (typeof amount !== "number" || !(amount > 0)) {
        await markActionResolved(action.id, "failed", principal.userId);
        return { status: "failed", line: "I couldn't complete that — the proposal was incomplete." };
      }

      // recordDealCore derives the type from the lead's domain + inserts the deal,
      // then flips the lead to Won (its full Won side-effects via updateLeadStatusCore).
      const core = await recordDealCore(
        actor,
        {
          leadId: lead.id,
          deal_amount: amount,
          deal_duration: dealDuration as DealDuration | null,
          deal_category: dealCategory as DealCategory | null,
        },
        {
          lead: {
            id: lead.id,
            status: lead.status,
            domain: lead.domain,
            slug: lead.slug,
            first_name: lead.first_name,
            last_name: lead.last_name,
            phone: lead.phone,
            email: lead.email,
            assigned_to: lead.assigned_to,
          },
        },
      );
      if (!core.ok) {
        await markActionResolved(action.id, "failed", principal.userId);
        return { status: "failed", line: core.error };
      }

      await markActionResolved(action.id, "executed", principal.userId, {
        ...action.payload,
        after: { dealId: core.dealId, wonChanged: core.wonChanged },
      });
      return {
        status: "executed",
        line: `Done — recorded a ${formatCurrency(amount)} deal for ${leadDisplayName(lead)} and marked the lead Won.`,
      };
    }

    // Unknown LEAD action_type on a proposed row — should never happen (delete_task is
    // routed away at the top; only the lead state tools reach here). Fail closed.
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "I couldn't complete that action." };
  } catch (e) {
    console.error("[elaya-write] proposal execution threw:", e instanceof Error ? e.message : e);
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "Something went wrong completing that — try again." };
  }
}

// ─────────────────────────────────────────────
// Executor for a CONFIRMED delete_task proposal — called ONLY by executeProposedAction
// (which routes the task-shaped target here). Re-fetches the task by id, re-checks
// canMutateTask with the principal, then runs deleteTaskCore.
//
// OPTIMISTIC-CONCURRENCY (failure mode c): deleteTaskCore's .delete().eq(id) returns
// ok:true even on a row that no longer exists (Supabase reports no error for a zero-row
// delete) — so a stale delete would falsely claim "Done". We therefore re-fetch FIRST
// and, if the row is gone, resolve the proposal and say "already removed" rather than
// running the core. The label in the returned line is code-derived from the stored
// payload (never model/lead text).
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Executor for a CONFIRMED move_ticket_status proposal — re-resolves the ticket, re-gates
// with the principal, checks the status is still what it was at propose time (optimistic
// concurrency), then runs the SAME moveTicketStatusCore the ticket page uses.
// ─────────────────────────────────────────────
async function executeProposedTicketMove(
  principal: StaffPrincipal,
  action: ElayaActionRow,
): Promise<ProposalExecution> {
  const payload = action.payload as {
    target?: { ticketId?: string; ticketNo?: string };
    args?: { status?: TicketStatus; note?: string | null; title?: string };
    before?: { status?: string } | null;
  };
  const ticketId = payload.target?.ticketId;
  const target = payload.args?.status;
  const label = payload.target?.ticketNo ?? "that ticket";
  if (!ticketId || !target) {
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "I couldn't complete that — the proposal was incomplete." };
  }
  try {
    const d = await getTicketFor(principal, ticketId);
    if (!d) {
      await markActionResolved(action.id, "failed", principal.userId);
      return { status: "failed", line: `I couldn't complete that — I can no longer act on ${label}.` };
    }
    if (payload.before?.status && d.ticket.status !== payload.before.status) {
      await markActionResolved(action.id, "failed", principal.userId);
      return { status: "failed", line: `${label} moved since I asked (now ${TICKET_STATUSES.labels[d.ticket.status]}). Tell me again what you'd like.` };
    }
    const core = await moveTicketStatusCore(d.ticket.id, target, actorFromPrincipal(principal), {
      note: payload.args?.note ?? null,
      resolution: target === "resolved" ? "delivered" : target === "dropped" ? "not_a_request" : null,
    });
    if (core.error) {
      await markActionResolved(action.id, "failed", principal.userId);
      return { status: "failed", line: `I couldn't move ${label}: ${core.error}` };
    }
    await markActionResolved(action.id, "executed", principal.userId, { ...action.payload, after: { status: target } });
    await wakeTicketNow(d.ticket.id);
    return { status: "executed", line: `Done — ${label} is now ${TICKET_STATUSES.labels[target]}.` };
  } catch (e) {
    console.error("[elaya-write] ticket move threw:", e instanceof Error ? e.message : e);
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "Something went wrong completing that — try again." };
  }
}

async function executeProposedTaskDelete(
  principal: StaffPrincipal,
  action: ElayaActionRow,
): Promise<ProposalExecution> {
  const payload = action.payload as {
    target?: { taskId?: string };
    args?: { taskTitle?: string; taskCategory?: string | null };
  };
  const taskId = payload.target?.taskId;
  const label = payload.args?.taskTitle ?? "that task";

  if (!taskId) {
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "I couldn't complete that — the proposal was incomplete." };
  }

  try {
    const admin = createAdminClient();
    const { data: task } = await admin
      .from("tasks")
      .select("id, assigned_to, created_by, group_id, task_category")
      .eq("id", taskId)
      .single();

    // Already gone — a stale proposal against a deleted task. Be honest, don't error.
    if (!task) {
      await markActionResolved(action.id, "executed", principal.userId, {
        ...action.payload,
        after: { deleted: false, alreadyGone: true },
      });
      return { status: "executed", line: `"${label}" was already removed — nothing to delete.` };
    }

    // Re-gate with the principal (never the stale propose-time decision).
    const allowed = await canMutateTask(admin, callerFromPrincipal(principal), task as TaskMutationTarget);
    if (!allowed) {
      await markActionResolved(action.id, "failed", principal.userId);
      return { status: "failed", line: "I couldn't delete that — you're no longer allowed to act on it." };
    }

    const core = await deleteTaskCore(
      actorFromPrincipal(principal),
      { taskId },
      // Prefer the live row's category over the propose-time snapshot. hasGiaMeta
      // is the live link read (meta-presence = lead task).
      {
        taskCategory: (task.task_category as string | null) ?? payload.args?.taskCategory ?? null,
        hasGiaMeta: await isLeadTask(admin, taskId),
      },
    );
    if (!core.ok) {
      await markActionResolved(action.id, "failed", principal.userId);
      return { status: "failed", line: "I couldn't delete that task just now — try again in a moment." };
    }

    await markActionResolved(action.id, "executed", principal.userId, {
      ...action.payload,
      after: { deleted: true },
    });
    return { status: "executed", line: `Done — deleted "${label}".` };
  } catch (e) {
    console.error("[elaya-write] task delete execution threw:", e instanceof Error ? e.message : e);
    await markActionResolved(action.id, "failed", principal.userId);
    return { status: "failed", line: "Something went wrong deleting that — try again." };
  }
}

// Used by ElayaActionType callers needing the union without importing the service.
export type { ElayaActionType };

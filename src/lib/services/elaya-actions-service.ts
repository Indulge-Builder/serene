// Elaya agentic-write ledger access (elaya_actions, migration 0116 + 0118). SERVER ONLY.
//
// This is the trust + rollback ledger for every write Elaya makes (Phase 2). It is
// BOTH a state-machine (proposed → executed/failed/dismissed) AND an audit trail —
// not a pure append-only log (see migration 0118 COMMENT for the A-11 argument).
//
// Write posture (Q-13): all writes — the insert AND the resolve UPDATE — go through
// the admin client and bypass RLS. elaya_actions has own-row SELECT RLS only and NO
// user INSERT/UPDATE/DELETE policy by design; the authed chat route + the code-side
// confirmation protocol (lib/elaya/brain.ts resolver) are the trust boundary. Mirrors
// elaya-service.ts. No Redis — this is always live.
//
// Lifecycle:
//   • Low-risk write (note/task) executes inline → insertExecutedAction (terminal).
//   • State-changing write (status/reassign) records insertProposedAction at propose
//     time; the brain resolver flips it via markActionResolved on the NEXT turn —
//     executed (affirmed + valid), failed (core error / stale target), or dismissed
//     (anything-not-affirmative). supersedePriorProposals enforces one live proposal
//     per conversation.

import { createAdminClient } from "@/lib/supabase/admin";
import type { ElayaActionRow, ElayaActionStatus, ElayaChannel } from "@/lib/types/elaya";

export type ElayaActionType =
  // Lead writes (E3)
  | "add_lead_note"
  | "log_call"
  | "create_lead_task"
  | "update_lead_status"
  | "reassign_lead"
  // Task writes (Brief 3) — task-shaped target. create_*/update_* execute inline;
  // delete_task is the only state-changing tier (propose → confirm → execute).
  | "create_personal_task"
  | "create_group_task"
  | "update_task_status"
  | "update_task"
  | "delete_task";

/**
 * A write targets either a LEAD (slug + id) or a TASK/GROUP.
 * Task-shaped target: `taskId` for a task row, `groupId` for a task_groups row (a group
 * is a container, not a task — so create_group_task carries groupId with no taskId).
 * At least one id is present; resolvers read whichever the action_type implies.
 */
export type ElayaLeadTarget = { slug: string | null; leadId: string };
export type ElayaTaskTarget = { taskId?: string; groupId?: string | null };
export type ElayaActionTarget = ElayaLeadTarget | ElayaTaskTarget;

/** Audit payload shape — targeted before/after snapshots (see migration 0118).
 * The jsonb column is unchanged — this is a TS-only contract widening (no migration). */
export type ElayaActionPayload = {
  target: ElayaActionTarget;
  args: Record<string, unknown>;
  channel: ElayaChannel;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

// ─────────────────────────────────────────────
// Inserts
// ─────────────────────────────────────────────

/** Low-risk write that already executed — one terminal `executed` audit row. */
export async function insertExecutedAction(args: {
  conversationId: string;
  userId: string;
  actionType: ElayaActionType;
  payload: ElayaActionPayload;
}): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("elaya_actions").insert({
    conversation_id: args.conversationId,
    user_id: args.userId,
    action_type: args.actionType,
    payload: args.payload,
    status: "executed",
    resolved_at: now,
    resolved_by: args.userId,
  });
  if (error) {
    // The write already landed in the lead tables — a missing audit row is a
    // ledger gap, logged but never thrown back into the turn. D-05: no payload contents.
    console.error("[elaya-actions] executed-row insert failed:", error.message);
  }
}

/** State-changing write awaiting confirmation — `proposed` row with before-snapshot. */
export async function insertProposedAction(args: {
  conversationId: string;
  userId: string;
  actionType: ElayaActionType;
  payload: ElayaActionPayload;
}): Promise<ElayaActionRow | null> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("elaya_actions")
    .insert({
      conversation_id: args.conversationId,
      user_id: args.userId,
      action_type: args.actionType,
      payload: args.payload,
      status: "proposed",
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[elaya-actions] proposed-row insert failed:", error?.message);
    return null;
  }
  return data as ElayaActionRow;
}

// ─────────────────────────────────────────────
// Resolver reads + writes
// ─────────────────────────────────────────────

/**
 * THE single live proposal for this conversation, if any. The affirmation resolver
 * runs this on every user turn before the brain. Served by idx_elaya_actions_pending
 * (partial WHERE status='proposed'). user_id is in the predicate as a belt-and-braces
 * scope guard (the conversation already belongs to one user).
 */
export async function getLatestProposedAction(
  conversationId: string,
  userId: string,
): Promise<ElayaActionRow | null> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("elaya_actions")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("status", "proposed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[elaya-actions] pending read failed:", error.message);
    return null;
  }
  return (data as ElayaActionRow | null) ?? null;
}

/**
 * Flip a proposed row to a terminal state (executed | failed | dismissed) and stamp
 * resolution. `patchPayload` optionally merges the `after` snapshot captured at execute
 * time. Admin-client UPDATE — sanctioned system write (no user UPDATE policy by design).
 */
export async function markActionResolved(
  actionId: string,
  status: Extract<ElayaActionStatus, "executed" | "failed" | "dismissed">,
  resolvedBy: string,
  patchPayload?: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {
    status,
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy,
  };
  if (patchPayload) update.payload = patchPayload;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("elaya_actions")
    .update(update)
    .eq("id", actionId)
    .eq("status", "proposed"); // only ever resolve a still-live proposal (idempotent)
  if (error) {
    console.error("[elaya-actions] resolve update failed:", error.message);
  }
}

/**
 * Cancel every still-live proposal for this conversation (status → dismissed).
 * Called before recording a new proposal so there is at most ONE live proposal per
 * conversation at any time.
 */
export async function supersedePriorProposals(
  conversationId: string,
  userId: string,
  resolvedBy: string,
): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("elaya_actions")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("status", "proposed");
  if (error) {
    console.warn("[elaya-actions] supersede failed:", error.message);
  }
}

import "server-only";

// THE task_events emit layer (Oversight, migration 20260624000144). SERVER ONLY.
//
// task_events is the append-only stream behind every /oversight live rail. It is
// written in exactly one place — here — and called only from the task-mutation
// cores (src/lib/services/task-mutations.ts) and the overdue Trigger.dev job.
// NEVER emit from an action, a page, or a UI component (the cores own the
// context-free side-effects, so both the session-action caller and the Elaya
// write tool emit identically — R-01).
//
// The insert is admin-client only (service-role bypasses RLS; task_events has
// NO INSERT policy — append-only, A-11). It is best-effort and NON-FATAL: a
// failed event insert is logged ([task-events] prefix) and swallowed, never
// failing the mutation. It is awaited (so a Trigger.dev/after() lambda stays
// alive until it lands) but its rejection is caught — identical posture to the
// awaited Redis dels around it in the cores.
//
// DERIVED DOMAIN (load-bearing): `tasks` has no domain column. Group subtask →
// task_groups.domain; personal/lead-follow-up task → assignee's profiles.domain.
// `resolveTaskDomain` is THE single place that derivation lives — the cores call
// it (they are context-free and must not re-inline the COALESCE lookup). The
// emitted `domain` + `subject_id` are point-in-time snapshots: a cross-team
// reassignment legitimately makes a task's events span domains (docs/oversight.md
// §4c) — correct, never "fixed".

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppDomain } from "@/lib/types/database";
import type { TaskEventType } from "@/lib/types/oversight";

// Re-export so a caller has one import for the event vocabulary alongside the
// helpers (the type itself lives in lib/types/oversight.ts).
export type { TaskEventType };

type EmitTaskEventInput = {
  taskId: string;
  /**
   * Derived domain at emit time (resolveTaskDomain) — point-in-time snapshot.
   * `null` is accepted (the derivation found nothing) and SKIPS the insert
   * rather than violate the NOT NULL column — so callers can pass the
   * resolveTaskDomain result straight through without a non-null assertion.
   */
  domain: AppDomain | null;
  /** Who caused the event; null for system/cron (e.g. the overdue job). */
  actorId: string | null;
  /** The task's assigned_to at emit time — the agent this event belongs to. */
  subjectId: string | null;
  eventType: TaskEventType;
  /** Denormalised title snapshot so the rail renders without joining tasks. */
  taskTitle: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Resolve a task's derived domain — group subtask → task_groups.domain, else
 * the assignee's profiles.domain. ONE tiny query; returns null only when both
 * paths are null (a task with no group and an assignee row that vanished — the
 * event is then skipped by emitTaskEvent, never inserted with a null domain).
 *
 * Pass the client you already have (admin client in the cores). The cores call
 * this BEFORE emitTaskEvent so the derivation stays in one place (R-01).
 */
export async function resolveTaskDomain(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  input: { groupId: string | null; assignedTo: string | null },
): Promise<AppDomain | null> {
  if (input.groupId) {
    const { data } = await client
      .from("task_groups")
      .select("domain")
      .eq("id", input.groupId)
      .single();
    if (data?.domain) return data.domain as AppDomain;
    // Group row gone — fall through to the assignee path as a backstop.
  }

  if (input.assignedTo) {
    const { data } = await client
      .from("profiles")
      .select("domain")
      .eq("id", input.assignedTo)
      .single();
    if (data?.domain) return data.domain as AppDomain;
  }

  return null;
}

/**
 * Append one task_events row. Best-effort, non-fatal, admin-client only.
 * A null `domain` (the derivation found nothing) means we cannot place the
 * event on any team rail — skip the insert rather than violate the NOT NULL
 * column. Never throws.
 */
export async function emitTaskEvent(input: EmitTaskEventInput): Promise<void> {
  if (!input.domain) return; // can't place it on a rail — skip, never NULL-insert

  try {
    const admin = createAdminClient();
    // Interim `as any` on `.from` — the generated Database type does not know
    // task_events until `supabase gen types` is re-run after migration
    // 20260624000144 (same pattern as revival-service / elaya-actions-service).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("task_events").insert({
      task_id: input.taskId,
      domain: input.domain,
      actor_id: input.actorId,
      subject_id: input.subjectId,
      event_type: input.eventType,
      task_title: input.taskTitle,
      meta: input.meta ?? {},
    });
    if (error) {
      console.warn("[task-events] emit insert failed (non-fatal)", error);
    }
  } catch (e) {
    console.warn("[task-events] emit threw (non-fatal)", e);
  }
}

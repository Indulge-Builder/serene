// THE read across the public ↔ gia boundary for lead tasks (schema restructure,
// 2026-09-17; docs/architecture/schema-restructure-plan.md §12).
//
// A lead task is a `public.tasks` row linked to a `gia.leads` row by
// `gia.task_gia_meta`. PostgREST resolves an embed only inside the schema of the
// request (PGRST200), so a query that starts in `public.tasks` can no longer embed
// `task_gia_meta`, and one that starts in `gia` can no longer embed `tasks`. These two
// reads replace that embed in both directions:
//
//   lead → tasks   getTaskIdsForLead(client, leadId)  then  .from('tasks').in('id', ids)
//   tasks → lead   .from('tasks')…                     then  getGiaLinksForTasks(client, ids)
//
// Every reader of the task↔lead link goes through here — never re-inline the two-step.
// Both take the caller's client, so the session client keeps RLS and the admin client
// keeps its sweep/SLA context. Both return null on a query error (already logged), so
// each caller keeps its own documented failure posture.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, AppDomain } from "@/lib/types/database";
import { giaDb } from "@/lib/supabase/schemas";

type Client = SupabaseClient<Database>;

/** The lead fields any task reader needs; the embed within gia is same-schema, so it works. */
export type GiaTaskLead = {
  id: string;
  slug: string | null;
  first_name: string | null;
  last_name: string | null;
  domain: AppDomain;
  archived_at: string | null;
};

export type GiaTaskLink = {
  lead_id: string;
  call_outcome: string | null;
  lead: GiaTaskLead | null;
};

// `.in()` travels in the URL; keep each request well under PostgREST's length limit.
const IN_CHUNK = 200;

/**
 * The task ids linked to one lead. `callOutcome` narrows to the tasks carrying that
 * marker (the revival guard reads only 'revived' tasks). Returns null on error.
 */
export async function getTaskIdsForLead(
  client: Client,
  leadId: string,
  opts: { callOutcome?: string } = {},
): Promise<string[] | null> {
  let query = giaDb(client).from("task_gia_meta").select("task_id").eq("lead_id", leadId);
  if (opts.callOutcome) query = query.eq("call_outcome", opts.callOutcome);

  const { data, error } = await query;
  if (error) {
    console.error("[gia-task-links] getTaskIdsForLead failed:", error.message);
    return null;
  }
  return (data ?? []).map((r) => r.task_id);
}

/**
 * Whether ONE task is a lead task (a task_gia_meta row exists). The status and delete
 * callers pass it to the task cores as `hasGiaMeta`. A query error answers true: the
 * flag only adds a Redis del, and a spare del is harmless where a missed one leaves
 * the Gia task list stale.
 */
export async function isLeadTask(client: Client, taskId: string): Promise<boolean> {
  const { data, error } = await giaDb(client)
    .from("task_gia_meta")
    .select("task_id")
    .eq("task_id", taskId)
    .limit(1);

  if (error) {
    console.error("[gia-task-links] isLeadTask failed:", error.message);
    return true;
  }
  return (data ?? []).length > 0;
}

/**
 * task_id → its lead link (and the lead row) for a set of tasks. A task with no link
 * is simply absent from the map — that absence IS the "not a lead task" signal (the
 * single-writer invariant: a task_gia_meta row exists iff the task is a lead task).
 * Returns null on error.
 */
export async function getGiaLinksForTasks(
  client: Client,
  taskIds: readonly string[],
): Promise<Map<string, GiaTaskLink> | null> {
  const links = new Map<string, GiaTaskLink>();
  const ids = [...new Set(taskIds)];

  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await giaDb(client)
      .from("task_gia_meta")
      .select(
        "task_id, lead_id, call_outcome, lead:leads!task_gia_meta_lead_id_fkey(id, slug, first_name, last_name, domain, archived_at)",
      )
      .in("task_id", ids.slice(i, i + IN_CHUNK));

    if (error) {
      console.error("[gia-task-links] getGiaLinksForTasks failed:", error.message);
      return null;
    }
    for (const row of data ?? []) {
      const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
      links.set(row.task_id, {
        lead_id: row.lead_id,
        call_outcome: row.call_outcome,
        lead: (lead as GiaTaskLead | null) ?? null,
      });
    }
  }
  return links;
}

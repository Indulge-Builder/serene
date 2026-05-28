/**
 * tasks-service.ts
 * All DB queries for the OS Tasks module.
 * Uses the server Supabase client only — never instantiate elsewhere.
 * No raw SQL strings outside this file.
 */

import { createClient } from '@/lib/supabase/server';
import type {
  Task,
  TaskGroup,
  TaskMessage,
  TaskStatus,
  TaskPriority,
  Profile,
} from '@/lib/types/database';

// ─────────────────────────────────────────────
// Composite types returned by service functions
// ─────────────────────────────────────────────

export const PERSONAL_TASKS_PAGE_SIZE = 50;

/**
 * Composite cursor for keyset pagination over (due_at ASC NULLS LAST, id ASC).
 * Both fields are required because due_at is nullable:
 *   - tasks with a deadline are ordered by due_at then id
 *   - tasks with no deadline always sort after all tasks with a deadline
 *   - within the NULL group, order is stable by id
 */
export type PersonalTaskCursor = {
  due_at: string | null;
  id:     string;
};

export type PersonalTaskFilters = {
  status?:     TaskStatus[];
  priority?:   TaskPriority[];
  due_before?: string; // ISO datetime string
  cursor?:     PersonalTaskCursor | null; // composite cursor for keyset pagination
};

export type PersonalTasksResult = {
  tasks:      Task[];
  hasMore:    boolean;
  nextCursor: PersonalTaskCursor | null; // composite cursor encoding last row's (due_at, id)
};

export type GroupTaskFilters = {
  status?:   TaskStatus[];
  priority?: TaskPriority[];
};

/** Minimal assignee profile attached to subtask list rows */
export type AssigneeSlim = Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;

/** Group list row — subtask counts + unique assignee avatars (no subtask rows) */
export type TaskGroupRow = TaskGroup & {
  subtask_count:     number;
  completed_count:   number;
  assignee_previews: AssigneeSlim[];
};

/** Full subtask row — task + assignee profile */
export type SubtaskWithAssignee = Task & {
  assignee: AssigneeSlim | null;
};

/** Full task detail — task + messages */
export type TaskWithMessages = Task & {
  messages: (TaskMessage & { author: AssigneeSlim | null })[];
};

// ─────────────────────────────────────────────
// Query: personal tasks for a user
// ─────────────────────────────────────────────

/**
 * Returns tasks where task_category='personal' AND assigned_to=userId.
 * Supports status[], priority[], due_before, and composite cursor pagination (LIMIT 50).
 * Ordered by due_at ASC NULLS LAST, then id ASC as a stable tiebreaker.
 *
 * Composite cursor: { due_at: string | null, id: string } from the last row of the
 * previous page. A row qualifies for the next page when:
 *   (due_at > cursor.due_at)
 *   OR (due_at = cursor.due_at AND id > cursor.id)
 *   OR (due_at IS NULL AND cursor.due_at IS NOT NULL)   -- NULL rows always after dated rows
 *   OR (due_at IS NULL AND cursor.due_at IS NULL AND id > cursor.id)
 *
 * A single-column cursor on a nullable column (`.gt('due_at', cursor)`) fails because
 * PostgreSQL evaluates `NULL > any_value` as NULL (falsy), making NULL-due_at tasks
 * invisible on every page after the first.
 *
 * Always returns at most PERSONAL_TASKS_PAGE_SIZE rows.
 * hasMore=true means there is at least one more row beyond the current page.
 */
export async function getPersonalTasks(
  userId: string,
  filters: PersonalTaskFilters = {},
): Promise<PersonalTasksResult> {
  const supabase = await createClient();

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('task_category', 'personal')
    .eq('assigned_to', userId);

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  if (filters.priority && filters.priority.length > 0) {
    query = query.in('priority', filters.priority);
  }

  if (filters.due_before) {
    query = query.lte('due_at', filters.due_before);
  }

  if (filters.cursor) {
    const c = filters.cursor;
    if (c.due_at !== null) {
      // Cursor row had a deadline. Next page = rows that come after it in
      // (due_at ASC NULLS LAST, id ASC) order:
      //   same due_at but later id   → due_at.eq + id.gt
      //   later due_at               → due_at.gt
      //   no deadline (always last)  → due_at.is.null
      query = query.or(
        `due_at.gt.${c.due_at},` +
        `and(due_at.eq.${c.due_at},id.gt.${c.id}),` +
        `due_at.is.null`,
      );
    } else {
      // Cursor row had no deadline (NULL). All rows with a deadline already
      // appeared on a prior page. Only rows in the NULL group that come after
      // the cursor id are needed.
      query = query.or(
        `and(due_at.is.null,id.gt.${c.id})`,
      );
    }
  }

  // Stable sort: due_at ASC NULLS LAST, then id ASC as tiebreaker.
  // Supabase .order() calls chain — the first call is the primary sort key.
  query = query
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('id',     { ascending: true })
    .limit(PERSONAL_TASKS_PAGE_SIZE + 1);

  const { data, error } = await query;

  if (error) {
    console.error('[tasks-service] getPersonalTasks error:', error);
    return { tasks: [], hasMore: false, nextCursor: null };
  }

  const rows = (data ?? []) as Task[];
  const hasMore = rows.length > PERSONAL_TASKS_PAGE_SIZE;
  const page    = hasMore ? rows.slice(0, PERSONAL_TASKS_PAGE_SIZE) : rows;

  // Secondary sort by priority order (urgent → high → normal)
  const priorityOrder: Record<string, number> = { urgent: 1, high: 2, normal: 3 };
  page.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 99;
    const pb = priorityOrder[b.priority] ?? 99;
    return pa - pb;
  });

  const lastRow = page[page.length - 1] ?? null;
  const nextCursor: PersonalTaskCursor | null = hasMore && lastRow
    ? { due_at: lastRow.due_at ?? null, id: lastRow.id }
    : null;

  return { tasks: page, hasMore, nextCursor };
}

// ─────────────────────────────────────────────
// Query: group tasks for a domain (list view)
// Two DB round-trips total:
//   1. get_group_task_summaries RPC — aggregates in Postgres,
//      returns counts + assignee_ids[], no subtask rows transferred.
//   2. Batch profile fetch for unique assignee_ids across all groups.
// ─────────────────────────────────────────────

/** Raw shape returned by the get_group_task_summaries RPC */
type GroupTaskSummaryRaw = {
  id:                string;
  title:             string;
  description:       string | null;
  priority:          string;
  status:            string;
  due_at:            string | null;
  created_by:        string;
  domain:            string;
  created_at:        string;
  updated_at:        string;
  subtask_total:     number; // bigint cast to number by Postgres JSON serialisation
  subtask_completed: number;
  assignee_ids:      string[] | null;
};

/**
 * Returns task_groups for a domain with subtask counts and
 * up to 4 unique assignee avatars per group.
 * No subtask rows are returned — list view only.
 * Exactly 2 DB round-trips: one RPC + one profile batch fetch.
 */
export async function getGroupTasks(
  filters: GroupTaskFilters = {},
): Promise<TaskGroupRow[]> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any).rpc('get_group_task_summaries', {
    p_status:   filters.status   && filters.status.length   > 0 ? filters.status   : null,
    p_priority: filters.priority && filters.priority.length > 0 ? filters.priority : null,
  });

  if (error || !rows || (rows as unknown[]).length === 0) {
    if (error) console.error('[tasks-service] getGroupTasks RPC error:', error);
    return [];
  }

  const summaries = rows as GroupTaskSummaryRaw[];

  // Collect all unique assignee ids across all groups for one batch profile fetch
  const allAssigneeIds = [
    ...new Set(
      summaries.flatMap((r) => r.assignee_ids ?? []),
    ),
  ];

  const profileMap = new Map<string, AssigneeSlim>();

  if (allAssigneeIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', allAssigneeIds);

    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        id:         p.id as string,
        full_name:  p.full_name as string,
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  return summaries.map((r): TaskGroupRow => {
    // Slice to max 4 assignee previews in the service layer (not in SQL)
    const assignee_previews: AssigneeSlim[] = (r.assignee_ids ?? [])
      .slice(0, 4)
      .reduce<AssigneeSlim[]>((acc, id) => {
        const profile = profileMap.get(id);
        if (profile) acc.push(profile);
        return acc;
      }, []);

    return {
      // TaskGroup fields
      id:          r.id,
      title:       r.title,
      description: r.description ?? null,
      priority:    r.priority as TaskGroup['priority'],
      status:      r.status   as TaskGroup['status'],
      due_at:      r.due_at   ?? null,
      created_by:  r.created_by,
      domain:      r.domain,
      created_at:  r.created_at,
      updated_at:  r.updated_at,
      // Aggregates — bigint arrives as number from JSON; cast with Number() per Q-09
      subtask_count:   Number(r.subtask_total),
      completed_count: Number(r.subtask_completed),
      assignee_previews,
    };
  });
}

// ─────────────────────────────────────────────
// Query: subtasks for a single group
// ─────────────────────────────────────────────

/**
 * Returns all subtasks for one group with their assignee profile.
 * Ordered by priority then due_at.
 */
export async function getGroupSubtasks(groupId: string): Promise<SubtaskWithAssignee[]> {
  const supabase = await createClient();

  const { data: subtasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('group_id', groupId)
    .eq('task_category', 'group_subtask')
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error || !subtasks) {
    if (error) console.error('[tasks-service] getGroupSubtasks error:', error);
    return [];
  }

  const assigneeIds = [
    ...new Set(
      (subtasks as Task[])
        .map((t) => t.assigned_to)
        .filter((id): id is string => id !== null),
    ),
  ];

  let profileMap: Map<string, AssigneeSlim> = new Map();

  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', assigneeIds);

    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        id:         p.id as string,
        full_name:  p.full_name as string,
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  return (subtasks as Task[]).map((task): SubtaskWithAssignee => ({
    ...task,
    assignee: task.assigned_to ? (profileMap.get(task.assigned_to) ?? null) : null,
  }));
}

// ─────────────────────────────────────────────
// Query: single task with messages (modal view)
// ─────────────────────────────────────────────

/**
 * Returns a single task with its full message thread.
 * Used by the task detail modal.
 */
export async function getTaskById(taskId: string): Promise<TaskWithMessages | null> {
  const supabase = await createClient();

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskError || !task) return null;

  const messages = await getTaskMessages(taskId);

  return { ...(task as Task), messages };
}

// ─────────────────────────────────────────────
// Query: task messages ordered newest first
// ─────────────────────────────────────────────

/**
 * Returns task messages ordered DESC (newest first).
 * Used by the chat panel.
 */
export async function getTaskMessages(
  taskId: string,
): Promise<(TaskMessage & { author: AssigneeSlim | null })[]> {
  const supabase = await createClient();

  const { data: messages, error } = await supabase
    .from('task_messages')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error || !messages) {
    if (error) console.error('[tasks-service] getTaskMessages error:', error);
    return [];
  }

  const authorIds = [
    ...new Set(
      (messages as TaskMessage[]).map((m) => m.author_id).filter(Boolean),
    ),
  ];

  let profileMap: Map<string, AssigneeSlim> = new Map();

  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', authorIds);

    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        id:         p.id as string,
        full_name:  p.full_name as string,
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  return (messages as TaskMessage[]).map((msg) => ({
    ...msg,
    author: profileMap.get(msg.author_id) ?? null,
  }));
}

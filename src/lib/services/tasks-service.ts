/**
 * tasks-service.ts
 * All DB queries for the OS Tasks module.
 * Uses the server Supabase client only — never instantiate elsewhere.
 * No raw SQL strings outside this file.
 *
 * Caching notes:
 * - getGroupTasks: uses React cache() for per-request memoisation.
 *   Cannot use unstable_cache — createClient() calls cookies() which is
 *   forbidden inside unstable_cache closures (Next.js throws at runtime).
 *   Per-request dedup is sufficient; the group tab is fetched once per RSC pass.
 *
 * Sort notes:
 * - getPersonalTasks: fully backed by the get_personal_tasks RPC (migration 0026).
 *   Both the no-cursor (page 1) and cursor (pages 2+) paths call the same RPC.
 *   The RPC sorts at the DB level on every page:
 *     due_at ASC NULLS LAST → priority CASE (urgent=1, high=2, normal=3) → id ASC.
 *   The PostgREST cursor path has been fully retired (TD-003 resolved 2026-05-29).
 *   No JavaScript sort. No PostgREST .order()/.or() chain. One code path only.
 */

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redis } from '@/lib/redis';
import { REDIS_KEYS, TASK_GIA_TTL, TASK_PERSONAL_PAGE1_TTL, TASK_GROUP_LIST_TTL } from '@/lib/constants/redis-keys';
import type { AssignableUser, WithAuthor, WithAssignee } from '@/lib/types';
import type {
  Task,
  TaskGroup,
  TaskRemark,
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
  tags?:       string[];   // filter by tag — only tasks containing ALL specified tags
  due_before?: string; // ISO datetime string
  cursor?:     PersonalTaskCursor | null; // composite cursor for keyset pagination
  limit?:      number; // override page size (default PERSONAL_TASKS_PAGE_SIZE); capped at 500
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

/** Minimal assignee profile attached to subtask list rows — derived from the
 * canonical AssignableUser (lib/types), never a fresh Pick<Profile, …>. */
export type AssigneeSlim = Pick<AssignableUser, 'id' | 'full_name' | 'avatar_url'>;

/** Group list row — subtask counts + unique assignee avatars (no subtask rows) */
export type TaskGroupRow = TaskGroup & {
  subtask_count:     number;
  completed_count:   number;
  assignee_previews: AssigneeSlim[];
};

/** Full subtask row — task + assignee profile */
export type SubtaskWithAssignee = WithAssignee<Task, AssigneeSlim | null>;

/** TaskRemark with resolved author profile — canonical type for the chat panel */
export type TaskRemarkWithAuthor = WithAuthor<TaskRemark, AssigneeSlim | null>;

/** Full task detail — task + remarks */
export type TaskWithMessages = Task & {
  messages: TaskRemarkWithAuthor[];
};

// ─────────────────────────────────────────────
// Query: personal tasks for a user
// ─────────────────────────────────────────────

/**
 * Returns tasks where task_category='personal' AND assigned_to=userId.
 * Supports status[], priority[], due_before, and composite cursor pagination (LIMIT 50).
 *
 * Sort order on every page: due_at ASC NULLS LAST → priority CASE (urgent=1, high=2,
 * normal=3) → id ASC. Both the no-cursor and cursor paths call the get_personal_tasks
 * RPC (migration 0026) — there is no split path. The PostgREST cursor path was retired
 * when TD-003 was resolved on 2026-05-29.
 *
 * Composite cursor: { due_at: string | null, id: string } from the last row of the
 * previous page. p_cursor_has_due_at disambiguates the null case:
 *   - true  → cursor row had a deadline; RPC applies the 3-branch non-null cursor logic
 *   - false → cursor row had no deadline; RPC restricts to due_at IS NULL AND id > cursor_id
 *   - omitted / null → no cursor; RPC returns from the beginning (page 1)
 *
 * Always returns at most PERSONAL_TASKS_PAGE_SIZE rows.
 * hasMore=true means there is at least one more row beyond the current page.
 */
export async function getPersonalTasks(
  userId: string,
  filters: PersonalTaskFilters = {},
): Promise<PersonalTasksResult> {
  const supabase = await createClient();
  const pageSize = Math.min(filters.limit ?? PERSONAL_TASKS_PAGE_SIZE, 500);

  const cursor = filters.cursor ?? null;

  // Cache page 1 only — cursor pages have unstable keys and go straight to DB.
  // Page 1 = all three cursor params are null (no prior page).
  const isPage1 =
    cursor === null &&
    (filters.status   === undefined || filters.status.length   === 0) &&
    (filters.priority === undefined || filters.priority.length === 0) &&
    (filters.tags     === undefined || filters.tags.length     === 0) &&
    !filters.due_before;

  if (isPage1) {
    const cacheKey = REDIS_KEYS.task.personalPage1(userId);
    try {
      const cached = await redis.get<PersonalTasksResult>(cacheKey);
      if (cached !== null) return cached;
    } catch (e) {
      console.error('[tasks-service] getPersonalTasks Redis get error:', e);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_personal_tasks', {
    p_user_id:          userId,
    p_status:           filters.status   && filters.status.length   > 0 ? filters.status   : null,
    p_priority:         filters.priority && filters.priority.length > 0 ? filters.priority : null,
    p_tags:             filters.tags     && filters.tags.length     > 0 ? filters.tags     : null,
    p_due_before:       filters.due_before ?? null,
    p_limit:            pageSize + 1,
    // Cursor params — all null when no cursor (page 1 behaviour preserved).
    p_cursor_id:        cursor?.id        ?? null,
    p_cursor_due_at:    cursor?.due_at    ?? null,
    p_cursor_has_due_at: cursor !== null ? cursor.due_at !== null : null,
  });

  if (error) {
    // TD-002: replace with Sentry.captureException() when Sentry is wired up
    console.error('[tasks-service] getPersonalTasks RPC error:', error);
    return { tasks: [], hasMore: false, nextCursor: null };
  }

  const rows = (data ?? []) as Task[];
  const hasMore = rows.length > pageSize;
  const page    = hasMore ? rows.slice(0, pageSize) : rows;

  const lastRow = page[page.length - 1] ?? null;
  const nextCursor: PersonalTaskCursor | null = hasMore && lastRow
    ? { due_at: lastRow.due_at ?? null, id: lastRow.id }
    : null;

  const result: PersonalTasksResult = { tasks: page, hasMore, nextCursor };

  // Populate page-1 cache on success — non-fatal.
  if (isPage1) {
    const cacheKey = REDIS_KEYS.task.personalPage1(userId);
    try {
      await redis.setex(cacheKey, TASK_PERSONAL_PAGE1_TTL, result);
    } catch (e) {
      console.error('[tasks-service] getPersonalTasks Redis setex error:', e);
    }
  }

  return result;
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
 * Returns task_groups visible to the caller (groups they created or are assigned
 * a subtask in) with subtask counts and up to 4 unique assignee avatars per group.
 * No subtask rows are returned — list view only.
 * Exactly 2 DB round-trips: one RPC + one profile batch fetch.
 *
 * Uses React cache() for per-request memoisation. Cannot use unstable_cache
 * because createClient() calls cookies() which Next.js forbids inside
 * unstable_cache closures. See src/lib/CLAUDE.md § unstable_cache + cookies().
 *
 * userId is used for the Redis cache key only — it is NOT passed to the RPC.
 * The RPC derives visibility from auth.uid() inside Postgres (SECURITY DEFINER).
 * Visibility is user-specific (creator OR subtask assignee); the old domain+role
 * key was wrong after the flat-visibility migration (0058).
 *
 * Redis cache: 120s, keyed by userId only (unfiltered calls only — filtered calls
 * bypass Redis because filter combinations are too numerous to cache).
 */
export const getGroupTasks = cache(async (
  filters: GroupTaskFilters = {},
  cacheHint?: { userId: string },
): Promise<TaskGroupRow[]> => {
  const supabase = await createClient();

  // Redis read — unfiltered calls only (migration 0058: key is per-user)
  const isUnfiltered =
    (filters.status   === undefined || filters.status.length   === 0) &&
    (filters.priority === undefined || filters.priority.length === 0);

  if (isUnfiltered && cacheHint?.userId) {
    const cacheKey = REDIS_KEYS.task.groupList(cacheHint.userId);
    try {
      const cached = await redis.get<TaskGroupRow[]>(cacheKey);
      if (cached !== null) return cached;
    } catch (e) {
      console.error('[tasks-service] getGroupTasks Redis get error:', e);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any).rpc('get_group_task_summaries', {
    p_status:   filters.status   && filters.status.length   > 0 ? filters.status   : null,
    p_priority: filters.priority && filters.priority.length > 0 ? filters.priority : null,
  });

  if (error || !rows || (rows as unknown[]).length === 0) {
    // TD-002: Rule P-07 violation — replace with Sentry.captureException() when Sentry is wired up
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

  const result = summaries.map((r): TaskGroupRow => {
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
      domain:      r.domain as TaskGroup['domain'],
      created_at:  r.created_at,
      updated_at:  r.updated_at,
      // Aggregates — bigint arrives as number from JSON; cast with Number() per Q-09
      subtask_count:   Number(r.subtask_total),
      completed_count: Number(r.subtask_completed),
      assignee_previews,
    };
  });

  // Redis write — unfiltered calls only, non-fatal
  if (isUnfiltered && cacheHint?.userId) {
    const cacheKey = REDIS_KEYS.task.groupList(cacheHint.userId);
    try {
      await redis.setex(cacheKey, TASK_GROUP_LIST_TTL, result);
    } catch (e) {
      console.error('[tasks-service] getGroupTasks Redis setex error:', e);
    }
  }

  return result;
});

// ─────────────────────────────────────────────
// Query: subtasks for a single group
// ─────────────────────────────────────────────

/**
 * Returns all subtasks for one group with their assignee profile.
 * Ordered by priority then due_at.
 *
 * userId is required for the Redis cache key — agents get RLS-filtered results
 * (assigned tasks only); managers get all; cache must be user-scoped to prevent
 * cross-user data bleed. The Supabase query and RLS are unchanged.
 *
 * Uses React cache() for per-request memoisation. Cannot use unstable_cache
 * because createClient() calls cookies(), which Next.js forbids inside
 * unstable_cache closures. See src/lib/CLAUDE.md § unstable_cache + cookies().
 *
 * Security: Redis cache stores the RESULT of an RLS-filtered query.
 * Key design (groupId + userId) prevents cross-user cache bleed. See redis-keys.ts.
 */
export const getGroupSubtasks = cache(async (groupId: string, userId: string): Promise<SubtaskWithAssignee[]> => {
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
});

// ─────────────────────────────────────────────
// Query: single task with messages (modal view)
// ─────────────────────────────────────────────

/**
 * Returns a single task with its full message thread.
 * Used by the task detail modal.
 * Task fetch and remarks fetch are independent — run in parallel.
 */
export async function getTaskById(taskId: string): Promise<TaskWithMessages | null> {
  const supabase = await createClient();

  const [{ data: task, error: taskError }, messages] = await Promise.all([
    supabase.from('tasks').select('*').eq('id', taskId).single(),
    getTaskRemarks(taskId),
  ]);

  if (taskError || !task) return null;

  return { ...(task as Task), messages };
}

// ─────────────────────────────────────────────
// Query: task remarks ordered oldest first (timeline)
// ─────────────────────────────────────────────

/**
 * Returns task_remarks ordered ASC (oldest first — newest appended at bottom).
 * Batch-resolves author profiles in one query — no N+1.
 * Server client only. Never call adminClient here.
 *
 * No userId in the cache key — all authorized viewers see identical remarks.
 * RLS gates task access (not remark filtering), so the result is identical for
 * every user who can see the task.
 *
 * Uses React cache() for per-request memoisation. Cannot use unstable_cache
 * because createClient() calls cookies(), which Next.js forbids inside
 * unstable_cache closures. See src/lib/CLAUDE.md § unstable_cache + cookies().
 *
 * Security: Redis cache stores the RESULT of an RLS-gated access path.
 * All authorized callers see identical remarks — no per-user key needed. See redis-keys.ts.
 */
export const getTaskRemarks = cache(async (
  taskId: string,
): Promise<TaskRemarkWithAuthor[]> => {
  const supabase = await createClient();

  const { data: remarks, error } = await supabase
    .from('task_remarks')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error || !remarks) {
    if (error) console.error('[tasks-service] getTaskRemarks error:', error);
    return [];
  }

  // Collect all unique author_ids first, then one batch profile fetch — no N+1.
  const authorIds = [
    ...new Set(
      (remarks as TaskRemark[]).map((m) => m.author_id).filter(Boolean),
    ),
  ];

  const profileMap = new Map<string, Pick<Profile, 'id' | 'full_name' | 'avatar_url'>>();

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

  return (remarks as TaskRemark[]).map((remark) => ({
    ...remark,
    author: profileMap.get(remark.author_id) ?? null,
  }));
});

// ─────────────────────────────────────────────
// Query: single task_group by id (workspace view)
// ─────────────────────────────────────────────

/**
 * Returns a single task_groups row by id.
 * Uses the server Supabase client — RLS enforces domain-scoped access.
 * A manager from a different domain will receive null (RLS returns no rows).
 * Caller must redirect to /tasks on null.
 */
export async function getTaskGroupById(groupId: string): Promise<TaskGroup | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('task_groups')
    .select('*')
    .eq('id', groupId)
    .single();

  if (error || !data) return null;
  return data as TaskGroup;
}

// ─────────────────────────────────────────────
// Query: all distinct tags used by a user's personal tasks
// Used to populate the My Tasks tag filter dropdown (TasksShell → TasksFilters).
// Returns a sorted deduplicated string array.
// Uses the GIN-indexed tags column — does not require a sequential scan.
// ─────────────────────────────────────────────

export async function getPersonalTaskTags(userId: string): Promise<string[]> {
  const supabase = await createClient();

  // Scoped to active tasks only — completed/cancelled tasks grow unboundedly.
  // Aligns with idx_tasks_tags_active partial index (task_category='personal'
  // AND status NOT IN ('completed','cancelled','error')).
  const { data, error } = await supabase
    .from('tasks')
    .select('tags')
    .eq('task_category', 'personal')
    .eq('assigned_to', userId)
    .not('status', 'in', '("completed","cancelled","error")');

  if (error || !data) return [];

  const tagSet = new Set<string>();
  for (const row of data) {
    for (const tag of (row.tags ?? [])) {
      if (tag) tagSet.add(tag);
    }
  }

  return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}

// ─────────────────────────────────────────────
// Query: all gia_followup tasks for a lead (dossier task card)
//
// Starts from `tasks` (native column filters applied directly), then !inner-joins
// task_gia_meta to filter by lead_id. Starting from task_gia_meta instead would
// silently drop the status filter — PostgREST/Supabase JS client does not apply
// dot-notation filters on joined tables when the root table is task_gia_meta.
// See leads/CLAUDE.md §getNextLeadTask join direction for the full explanation.
//
// Order: active tasks first (NOT IN completed/cancelled/error), then due_at ASC
// NULLS LAST. This uses a two-level ORDER BY: a CASE priority column first (0 for
// active, 1 for terminal), then due_at.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// GIA tasks for the tasks-page Gia tab
// ─────────────────────────────────────────────

/** Shape returned by the get_gia_tasks RPC — Task fields + joined lead identity. */
export type GiaTask = Task & {
  lead_id:         string;
  lead_first_name: string | null;
  lead_last_name:  string | null;
  lead_phone:      string | null;
  lead_slug:       string | null;
  lead_domain:     string;
};

/**
 * All gia_followup tasks for the caller (scoped by role via the get_gia_tasks RPC).
 * Agents receive only their own assigned tasks.
 * Managers/admin/founder receive all tasks in their domain.
 * Ordered active-first, then due_at ASC NULLS LAST, then created_at ASC.
 */
export async function getGiaTasksForUser(
  userId: string,
  role:   string,
  domain: string,
): Promise<GiaTask[]> {
  const cacheKey = REDIS_KEYS.task.giaList(userId, role, domain);

  // Cache-aside: try Redis first, fall through to RPC on any error or miss.
  try {
    const cached = await redis.get<GiaTask[]>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[tasks-service] getGiaTasksForUser Redis get error:', e);
  }

  // get_gia_tasks trusts p_user_id/p_role/p_domain — EXECUTE revoked from
  // `authenticated` (migration 0102, audit F-1). Admin client only; args are
  // session-derived by TasksAsync (Q-13: the caller is the trust boundary).
  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_gia_tasks', {
    p_user_id: userId,
    p_role:    role,
    p_domain:  domain,
  });

  if (error) {
    console.error(
      '[tasks-service] getGiaTasksForUser error:',
      error.message ?? error.code ?? error,
    );
    return [];
  }

  const result = (data ?? []) as GiaTask[];

  // Populate cache on success — non-fatal.
  try {
    await redis.setex(cacheKey, TASK_GIA_TTL, result);
  } catch (e) {
    console.error('[tasks-service] getGiaTasksForUser Redis setex error:', e);
  }

  return result;
}

// ─────────────────────────────────────────────
// Lead tasks for one dossier
// ─────────────────────────────────────────────

/** All gia_followup tasks for one lead, ordered active-first then due_at ASC. */
export async function getAllLeadTasks(leadId: string): Promise<Task[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_gia_meta!inner(lead_id)')
    .eq('task_gia_meta.lead_id', leadId)
    .eq('task_category', 'gia_followup')
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('[tasks-service] getAllLeadTasks error:', error);
    return [];
  }

  // Generated rows type attachments as Json; Task narrows it to ChecklistItem[]
  // (the tasks_attachments_is_array CHECK guarantees the shape) — cross once.
  const tasks = (data ?? []) as unknown as Task[];

  // Sort active tasks before terminal ones in JS (PostgREST cannot express a
  // CASE column in ORDER BY across a join).
  const TERMINAL = new Set(['completed', 'cancelled', 'error']);
  return tasks.sort((a, b) => {
    const aTerminal = TERMINAL.has(a.status) ? 1 : 0;
    const bTerminal = TERMINAL.has(b.status) ? 1 : 0;
    return aTerminal - bTerminal;
  });
}

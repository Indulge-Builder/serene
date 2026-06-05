-- Migration 0058 — Flat group task visibility
--
-- Previous model:
--   agent   → only groups they created
--   manager → all groups in their domain
--   admin/founder → all groups everywhere
--
-- New model (flat, no role branching):
--   anyone → groups they CREATED or are ASSIGNED a subtask in
--   delete → only the creator (orphaned group cleanup is service-role only)
--
-- get_group_task_summaries RPC updated with the same two-condition WHERE clause.
-- All get_user_role() / get_user_domain() calls removed from both the RLS policy
-- and the RPC — visibility is now purely data-driven.
--
-- Supporting index: idx_tasks_group_assignee — fast EXISTS subquery lookups.
--
-- Sign-off conditions:
--   ✓ Gia agent sees Group tab (page.tsx no longer gates on role=agent)
--   ✓ Agent assigned a subtask in someone else's group sees that group
--   ✓ Admin/founder sees only groups they created or are assigned in
--   ✓ Manager sees only groups they created or are assigned in
--   ✓ Creator can delete their own group; no other role can delete
--   ✗ get_user_role() / get_user_domain() must not appear in this migration

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1 — Supporting index
-- Speeds up the EXISTS subquery in both the RLS policy and the RPC.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_group_assignee
  ON tasks(group_id, assigned_to)
  WHERE task_category = 'group_subtask';

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2 — Drop existing task_groups policies
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "task_groups_select" ON task_groups;
DROP POLICY IF EXISTS "task_groups_update" ON task_groups;
DROP POLICY IF EXISTS "task_groups_delete" ON task_groups;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3 — Recreate policies with flat visibility model
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT: creator OR subtask assignee — no role check, no domain check.
CREATE POLICY "task_groups_select"
  ON task_groups FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.group_id = task_groups.id
        AND tasks.assigned_to = auth.uid()
        AND tasks.task_category = 'group_subtask'
    )
  );

-- UPDATE: same two-condition rule — you can only edit a group you created or
-- are assigned a subtask in.
CREATE POLICY "task_groups_update"
  ON task_groups FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.group_id = task_groups.id
        AND tasks.assigned_to = auth.uid()
        AND tasks.task_category = 'group_subtask'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.group_id = task_groups.id
        AND tasks.assigned_to = auth.uid()
        AND tasks.task_category = 'group_subtask'
    )
  );

-- DELETE: creator only.
-- Orphaned group cleanup (e.g. admin bulk-delete) is a service-role operation —
-- it uses adminClient which bypasses RLS. The application-layer guard in
-- deleteGroupTaskAction enforces admin/founder at the action layer.
CREATE POLICY "task_groups_delete"
  ON task_groups FOR DELETE
  USING (
    created_by = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4 — Recreate get_group_task_summaries with flat visibility WHERE clause
--
-- SECURITY DEFINER note: auth.uid() returns the calling session's user ID even
-- inside a SECURITY DEFINER function, because auth.uid() reads from the session
-- JWT (set by the PostgREST gateway) — NOT from the function owner's session.
-- The existing tg.created_by = auth.uid() branch already relied on this behaviour;
-- the new EXISTS subquery is consistent with it.
--
-- get_user_role() / get_user_domain() are intentionally absent from this function.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_group_task_summaries(
  p_status   text[]  DEFAULT NULL,
  p_priority text[]  DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  title             text,
  description       text,
  priority          text,
  status            text,
  due_at            timestamptz,
  created_by        uuid,
  domain            text,
  created_at        timestamptz,
  updated_at        timestamptz,
  subtask_total     bigint,
  subtask_completed bigint,
  assignee_ids      uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    tg.id,
    tg.title,
    tg.description,
    tg.priority,
    tg.status,
    tg.due_at,
    tg.created_by,
    tg.domain::text,
    tg.created_at,
    tg.updated_at,
    COUNT(t.id)                                                                  AS subtask_total,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')                           AS subtask_completed,
    array_agg(DISTINCT t.assigned_to) FILTER (WHERE t.assigned_to IS NOT NULL)  AS assignee_ids
  FROM task_groups tg
  LEFT JOIN tasks t
    ON t.group_id = tg.id
   AND t.task_category = 'group_subtask'
  WHERE
    -- Flat visibility: creator OR subtask assignee — no role/domain branching.
    -- auth.uid() resolves from the calling session JWT inside SECURITY DEFINER.
    (
      tg.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM tasks sub
        WHERE sub.group_id = tg.id
          AND sub.assigned_to = auth.uid()
          AND sub.task_category = 'group_subtask'
      )
    )
    AND (p_status   IS NULL OR tg.status   = ANY(p_status))
    AND (p_priority IS NULL OR tg.priority = ANY(p_priority))
  GROUP BY
    tg.id, tg.title, tg.description, tg.priority, tg.status,
    tg.due_at, tg.created_by, tg.domain, tg.created_at, tg.updated_at
  ORDER BY tg.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_group_task_summaries(text[], text[]) TO authenticated;

COMMIT;

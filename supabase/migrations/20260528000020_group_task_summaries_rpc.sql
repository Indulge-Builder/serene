-- ============================================================
-- Migration 0020 — get_group_task_summaries RPC
--
-- Replaces in-memory aggregation in getGroupTasks (tasks-service.ts).
-- Returns per-group counts and distinct assignee IDs in one round-trip.
-- No subtask rows transferred to Node — only aggregates.
--
-- SECURITY DEFINER means the function executes as its owner (postgres),
-- not as the calling user. RLS on task_groups does NOT fire for rows
-- accessed inside this function — the owner bypasses it entirely.
-- Domain and role scoping that RLS would normally enforce must therefore
-- be replicated explicitly inside the WHERE clause using get_user_role()
-- and get_user_domain(), which resolve correctly from auth.uid() even
-- inside a SECURITY DEFINER context because auth.uid() is set from the
-- calling session's JWT, not the function owner's session.
--
-- Visibility contract (mirrors migration 0018 task_groups_select policy):
--   agent   — groups they created (created_by = auth.uid())
--   manager — all groups in their domain (get_user_domain())
--   admin / founder — all groups across all domains
-- ============================================================

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
    tg.domain,
    tg.created_at,
    tg.updated_at,
    COUNT(t.id)                                                                    AS subtask_total,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')                             AS subtask_completed,
    array_agg(DISTINCT t.assigned_to) FILTER (WHERE t.assigned_to IS NOT NULL)    AS assignee_ids
  FROM task_groups tg
  LEFT JOIN tasks t
    ON t.group_id = tg.id
   AND t.task_category = 'group_subtask'
  WHERE
    -- Replicate task_groups_select RLS (migration 0018) explicitly,
    -- because SECURITY DEFINER bypasses RLS on task_groups.
    (
      tg.created_by = auth.uid()
      OR get_user_role() IN ('admin', 'founder')
      OR (get_user_role() = 'manager' AND tg.domain = get_user_domain()::text)
    )
    AND (p_status   IS NULL OR tg.status   = ANY(p_status))
    AND (p_priority IS NULL OR tg.priority = ANY(p_priority))
  GROUP BY
    tg.id, tg.title, tg.description, tg.priority, tg.status,
    tg.due_at, tg.created_by, tg.domain, tg.created_at, tg.updated_at
  ORDER BY tg.created_at DESC;
$$;

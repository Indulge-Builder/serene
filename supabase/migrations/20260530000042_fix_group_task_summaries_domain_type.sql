-- Migration 0042: Fix get_group_task_summaries after task_groups.domain → app_domain
--
-- Migration 0041 changed task_groups.domain from text to app_domain enum.
-- The get_group_task_summaries RPC (migration 0020) still compared:
--   tg.domain = get_user_domain()::text
-- which resolves to app_domain = text — no operator exists for this pairing,
-- causing PostgreSQL error 42883 ("function does not exist" / operator not found)
-- whenever a manager calls the tasks page.
--
-- Fix: both sides are now app_domain. Remove the ::text cast so the comparison
-- becomes app_domain = app_domain, which uses the standard enum equality operator.
-- All other columns in the RETURNS TABLE remain text — get_user_domain() is only
-- used in the WHERE clause, not in the SELECT list.

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
    COUNT(t.id)                                                                    AS subtask_total,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')                             AS subtask_completed,
    array_agg(DISTINCT t.assigned_to) FILTER (WHERE t.assigned_to IS NOT NULL)    AS assignee_ids
  FROM task_groups tg
  LEFT JOIN tasks t
    ON t.group_id = tg.id
   AND t.task_category = 'group_subtask'
  WHERE
    -- Replicate task_groups_select RLS (migration 0018/0041) explicitly,
    -- because SECURITY DEFINER bypasses RLS on task_groups.
    -- Both tg.domain and get_user_domain() are now app_domain — no ::text cast needed.
    (
      tg.created_by = auth.uid()
      OR get_user_role() IN ('admin', 'founder')
      OR (get_user_role() = 'manager' AND tg.domain = get_user_domain())
    )
    AND (p_status   IS NULL OR tg.status   = ANY(p_status))
    AND (p_priority IS NULL OR tg.priority = ANY(p_priority))
  GROUP BY
    tg.id, tg.title, tg.description, tg.priority, tg.status,
    tg.due_at, tg.created_by, tg.domain, tg.created_at, tg.updated_at
  ORDER BY tg.created_at DESC;
$$;

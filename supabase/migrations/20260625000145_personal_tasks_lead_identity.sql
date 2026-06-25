-- ============================================================
-- Migration 0145 — get_personal_tasks: return linked-lead identity
--
-- PROBLEM (Q2, 2026-06-25): a lead follow-up is now a `personal` task that
-- carries a `task_gia_meta` row (the meta table IS the task→lead link since the
-- 0138 category collapse). Its title is the type-derived label ("Call" /
-- "WhatsApp message") — the lead's identity lives ONLY in `task_gia_meta`/`leads`.
-- `get_personal_tasks` was `RETURNS SETOF tasks` (the bare task row, no join), so
-- the My Tasks list renders just "Call" with no way to show WHICH lead.
--
-- FIX: widen the return to the full `tasks` row PLUS four nullable lead-identity
-- columns, sourced via a LEFT JOIN through `task_gia_meta` → `leads`. Non-lead
-- personal tasks LEFT-JOIN to NULL — unchanged behaviour. The 0138 single-writer
-- invariant guarantees ≤1 `task_gia_meta` row per task, so the join never fans
-- a task into multiple rows.
--
-- The WHERE clause, all cursor logic, the ORDER BY, and every parameter are
-- BYTE-IDENTICAL to the live 0026 body (verified via pg_get_functiondef) — the
-- ONLY change is the SELECT list (explicit columns + lead join) and the return
-- type. The columns are enumerated in `tasks` ordinal order so the service's
-- typed cast (PersonalTaskRow = Task & { lead_* }) stays valid; this mirrors the
-- get_gia_tasks (0055) and get_active_lead_by_phone v2 (0090) enumerate-columns
-- pattern (no `SELECT *` once a join widens the shape).
--
-- DROP required: changing the return type is not a CREATE OR REPLACE.
-- Self-scoped (p_user_id is verified by the action against auth.uid() before the
-- call) → keeps GRANT EXECUTE TO authenticated; no Q-13 change.
-- SECURITY DEFINER + SET search_path = public per A-10.
-- ============================================================

DROP FUNCTION IF EXISTS get_personal_tasks(
  uuid,
  text[],
  text[],
  text[],
  timestamptz,
  int,
  uuid,
  timestamptz,
  boolean
);

CREATE OR REPLACE FUNCTION get_personal_tasks(
  p_user_id           uuid,
  p_status            text[]      DEFAULT NULL,
  p_priority          text[]      DEFAULT NULL,
  p_tags              text[]      DEFAULT NULL,
  p_due_before        timestamptz DEFAULT NULL,
  p_limit             int         DEFAULT 51,    -- pageSize + 1 for hasMore check
  p_cursor_id         uuid        DEFAULT NULL,  -- id of last row on previous page
  p_cursor_due_at     timestamptz DEFAULT NULL,  -- due_at of last row (may be null)
  p_cursor_has_due_at boolean     DEFAULT NULL   -- true = cursor row had a deadline; false = null
)
RETURNS TABLE(
  -- tasks.* in ordinal order (keep in sync with the tasks table)
  id            uuid,
  assigned_to   uuid,
  created_by    uuid,
  module        task_module,
  task_type     text,
  status        text,
  due_at        timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz,
  updated_at    timestamptz,
  title         text,
  description   text,
  priority      text,
  task_category text,
  group_id      uuid,
  attachments   jsonb,
  tags          text[],
  overdue_at    timestamptz,
  -- joined lead identity (NULL for non-lead personal tasks)
  lead_id         uuid,
  lead_first_name text,
  lead_last_name  text,
  lead_slug       text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    t.id, t.assigned_to, t.created_by, t.module, t.task_type, t.status,
    t.due_at, t.completed_at, t.created_at, t.updated_at, t.title,
    t.description, t.priority, t.task_category, t.group_id, t.attachments,
    t.tags, t.overdue_at,
    l.id        AS lead_id,
    l.first_name AS lead_first_name,
    l.last_name  AS lead_last_name,
    l.slug       AS lead_slug
  FROM tasks t
  LEFT JOIN task_gia_meta tgm ON tgm.task_id = t.id
  LEFT JOIN leads l           ON l.id = tgm.lead_id
  WHERE t.task_category = 'personal'
    AND t.assigned_to   = p_user_id
    -- ── Standard filters ──────────────────────────────────────────────────
    AND (p_status     IS NULL OR t.status   = ANY(p_status))
    AND (p_priority   IS NULL OR t.priority = ANY(p_priority))
    AND (p_tags       IS NULL OR t.tags     @> p_tags)
    AND (p_due_before IS NULL OR t.due_at  <= p_due_before)
    -- ── Cursor condition (identical to 0026) ──────────────────────────────
    AND CASE
          WHEN p_cursor_id IS NULL THEN
            TRUE
          WHEN p_cursor_has_due_at = TRUE THEN
            t.due_at > p_cursor_due_at
            OR (t.due_at = p_cursor_due_at AND t.id > p_cursor_id)
            OR t.due_at IS NULL
          WHEN p_cursor_has_due_at = FALSE THEN
            t.due_at IS NULL AND t.id > p_cursor_id
          ELSE TRUE
        END
  ORDER BY
    t.due_at ASC NULLS LAST,
    CASE t.priority
      WHEN 'urgent' THEN 1
      WHEN 'high'   THEN 2
      ELSE               3
    END ASC,
    t.id ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_personal_tasks(
  uuid, text[], text[], text[], timestamptz, int, uuid, timestamptz, boolean
) TO authenticated;

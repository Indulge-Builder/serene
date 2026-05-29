-- ============================================================
-- Migration 0026 — get_personal_tasks: add cursor parameters
--
-- Resolves TD-003: the no-cursor path of getPersonalTasks called this
-- RPC (priority sort at DB level), but the cursor path fell back to a
-- PostgREST query that could not express ORDER BY CASE — meaning pages 2+
-- silently lacked the priority tiebreaker sort.
--
-- This migration extends get_personal_tasks with three optional cursor
-- parameters so the RPC handles ALL pages. The PostgREST cursor path
-- in tasks-service.ts is fully retired after this migration runs.
--
-- Cursor logic — four cases, handled via CASE WHEN in the WHERE clause:
--   1. No cursor (p_cursor_id IS NULL):
--      All rows pass the cursor condition — return from the beginning.
--   2. Cursor has due_at (p_cursor_has_due_at = true):
--      due_at > p_cursor_due_at                   (later deadline)
--      OR (due_at = p_cursor_due_at AND id > p_cursor_id)  (same deadline, later id)
--      OR due_at IS NULL                           (no-deadline rows always come last)
--   3. Cursor has null due_at (p_cursor_has_due_at = false):
--      due_at IS NULL AND id > p_cursor_id         (only remaining null-due_at rows)
--
-- DROP required to change the parameter list (Postgres treats new params
-- as a new overload, not a replacement, unless the old function is dropped first).
-- The dropped signature must match the one created in migration 0025 exactly.
--
-- SECURITY DEFINER + SET search_path = public per Rule A-10.
-- p_user_id is a required parameter — never derived from a caller-supplied claim.
-- The action layer verifies auth.uid() matches p_user_id before calling.
-- ============================================================

DROP FUNCTION IF EXISTS get_personal_tasks(
  uuid,
  text[],
  text[],
  text[],
  timestamptz,
  int
);

CREATE OR REPLACE FUNCTION get_personal_tasks(
  p_user_id         uuid,
  p_status          text[]      DEFAULT NULL,
  p_priority        text[]      DEFAULT NULL,
  p_tags            text[]      DEFAULT NULL,
  p_due_before      timestamptz DEFAULT NULL,
  p_limit           int         DEFAULT 51,    -- pageSize + 1 for hasMore check
  p_cursor_id       uuid        DEFAULT NULL,  -- id of last row on previous page
  p_cursor_due_at   timestamptz DEFAULT NULL,  -- due_at of last row (may be null)
  p_cursor_has_due_at boolean   DEFAULT NULL   -- true = cursor row had a deadline; false = null
)
RETURNS SETOF tasks
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT *
  FROM tasks
  WHERE task_category = 'personal'
    AND assigned_to   = p_user_id
    -- ── Standard filters ──────────────────────────────────────────────────
    AND (p_status     IS NULL OR status   = ANY(p_status))
    AND (p_priority   IS NULL OR priority = ANY(p_priority))
    AND (p_tags       IS NULL OR tags     @> p_tags)
    AND (p_due_before IS NULL OR due_at  <= p_due_before)
    -- ── Cursor condition ──────────────────────────────────────────────────
    -- Three distinct cases depending on whether a cursor is present and
    -- whether the cursor row had a deadline. Cases are explicit WHEN branches
    -- (not collapsed) to prevent inter-case row leakage.
    AND CASE
          -- Case 1: No cursor — first page, all rows pass.
          WHEN p_cursor_id IS NULL THEN
            TRUE

          -- Case 2: Cursor row had a deadline (due_at IS NOT NULL).
          -- Return rows that sort after the cursor in (due_at ASC NULLS LAST, id ASC):
          --   • later due_at                           → row comes after
          --   • same due_at but later id               → same bucket, later position
          --   • no deadline (NULL)                     → NULL always sorts last, so all
          --                                               no-deadline rows come after any
          --                                               row with a deadline
          WHEN p_cursor_has_due_at = TRUE THEN
            due_at > p_cursor_due_at
            OR (due_at = p_cursor_due_at AND id > p_cursor_id)
            OR due_at IS NULL

          -- Case 3: Cursor row had no deadline (due_at IS NULL).
          -- All rows with a deadline already appeared on a prior page.
          -- Only remaining no-deadline rows after the cursor id are valid.
          WHEN p_cursor_has_due_at = FALSE THEN
            due_at IS NULL AND id > p_cursor_id

          -- Safety fallback (should never be reached given the caller always
          -- passes either NULL or a boolean for p_cursor_has_due_at).
          ELSE TRUE
        END
  ORDER BY
    due_at ASC NULLS LAST,
    CASE priority
      WHEN 'urgent' THEN 1
      WHEN 'high'   THEN 2
      ELSE               3
    END ASC,
    id ASC
  LIMIT p_limit;
$$;

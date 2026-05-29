-- ============================================================
-- Migration 0025 — Task performance indexes
--
-- Purpose:
--   1. Replace two dead partial indexes that used WHERE status = 'pending'
--      (invalid since migration 0017 migrated 'pending' → 'to_do').
--      These indexes have been inert since 0017 shipped.
--   2. Add composite index for the most frequent agent read pattern.
--   3. Add covering index for getPersonalTaskTags (active tasks only).
--
-- CONCURRENTLY omitted intentionally:
--   Supabase migrations run inside an implicit transaction.
--   CREATE INDEX CONCURRENTLY is not permitted inside a transaction block.
--   All existing migrations (e.g. 0013_performance_indexes.sql) confirm
--   this pattern — no CONCURRENTLY is used anywhere in this codebase.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Drop and recreate idx_tasks_assigned_to
--    Old condition: WHERE status = 'pending'  ← dead since 0017
--    New condition: WHERE status NOT IN ('completed','cancelled','error')
-- ─────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_tasks_assigned_to;

CREATE INDEX idx_tasks_assigned_to
  ON tasks(assigned_to, due_at ASC NULLS LAST)
  WHERE status NOT IN ('completed', 'cancelled', 'error');

-- ─────────────────────────────────────────────────────────────
-- 2. Drop and recreate idx_tasks_module
--    Old condition: WHERE status = 'pending'  ← dead since 0017
--    New condition: WHERE status NOT IN ('completed','cancelled','error')
-- ─────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_tasks_module;

CREATE INDEX idx_tasks_module
  ON tasks(module, assigned_to)
  WHERE status NOT IN ('completed', 'cancelled', 'error');

-- ─────────────────────────────────────────────────────────────
-- 3. New composite index for the agent active-tasks read pattern
--    Covers: assigned_to + task_category + due_at in one index scan.
--    getPersonalTasks queries:
--      WHERE task_category = 'personal' AND assigned_to = $1
--      ORDER BY due_at ASC NULLS LAST
--    This index eliminates the need for a sequential scan on that shape.
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_agent_active
  ON tasks(assigned_to, task_category, due_at ASC NULLS LAST)
  WHERE status NOT IN ('completed', 'cancelled', 'error');

-- ─────────────────────────────────────────────────────────────
-- 3b. get_personal_tasks RPC
--     PostgREST's .order() chain cannot express a CASE expression sort.
--     This RPC provides the correct DB-level ordering:
--       PRIMARY:   due_at ASC NULLS LAST
--       SECONDARY: priority order (urgent=1, high=2, normal=3)
--       TERTIARY:  id ASC (stable tiebreaker)
--     Cursor pagination, filters, and limit are preserved from the
--     service layer implementation. SECURITY DEFINER so RLS is bypassed —
--     p_user_id is a required parameter, never derived from a caller-supplied
--     claim, and should match auth.uid() (enforced at the action layer).
--
--     NOTE: this function does NOT replace the service query for all cases —
--     it is only invoked when no cursor is present (initial page / full load).
--     Cursor pages fall back to the PostgREST query because CASE ORDER cannot
--     be expressed with a keyset cursor. This is acceptable because priority
--     within a single due_at bucket is visual only — cursor pages retain
--     relative stability.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_personal_tasks(
  p_user_id   uuid,
  p_status    text[]    DEFAULT NULL,
  p_priority  text[]    DEFAULT NULL,
  p_tags      text[]    DEFAULT NULL,
  p_due_before timestamptz DEFAULT NULL,
  p_limit     int       DEFAULT 51  -- pageSize + 1 for hasMore check
)
RETURNS SETOF tasks
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT *
  FROM tasks
  WHERE task_category = 'personal'
    AND assigned_to   = p_user_id
    AND (p_status    IS NULL OR status   = ANY(p_status))
    AND (p_priority  IS NULL OR priority = ANY(p_priority))
    AND (p_tags      IS NULL OR tags     @> p_tags)
    AND (p_due_before IS NULL OR due_at <= p_due_before)
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

-- ─────────────────────────────────────────────────────────────
-- 4. Covering index for getPersonalTaskTags
--    getPersonalTaskTags currently reads tags from ALL personal tasks
--    regardless of status, growing unboundedly as tasks complete.
--    This index scopes the scan to active personal tasks only and
--    covers the tags column so the query becomes an index-only scan.
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_tags_active
  ON tasks(assigned_to)
  INCLUDE (tags)
  WHERE task_category = 'personal'
    AND status NOT IN ('completed', 'cancelled', 'error');

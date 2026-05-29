-- ============================================================
-- Migration 0022 — Replace task_messages with task_remarks
-- ============================================================
-- Rationale: task_messages was the original name chosen at Phase 7.
--   After the full OS Tasks schema (0017–0021) settled, the concept
--   evolved into "remarks" — structured comments that can carry a
--   status_change payload, not just free-form chat messages.
--   The rename aligns the table name with how the product surfaces it.
--
-- Pre-production data: task_messages has no production data.
--   CASCADE handles RLS policies, indexes, and the Realtime
--   publication entry automatically. No data migration is needed.
--
-- Pre-mortem checklist:
--   1. CASCADE on DROP TABLE removes the supabase_realtime publication
--      entry automatically (Supabase Realtime tracks publications at
--      the Postgres publication level — DROP TABLE CASCADE removes the
--      table from all publications that include it).
--   2. status_change CHECK must use the exact same values as
--      tasks.status CHECK (tasks_status_check, migration 0017):
--        'to_do','in_progress','in_review','completed','error','cancelled'
--      These values are defined in two places. If tasks.status ever
--      gains a new value, task_remarks.status_change must be updated
--      in a subsequent migration. This coupling is documented here
--      so future engineers know where to look.
--   3. log_task_changes() trigger (migration 0021) fires AFTER UPDATE
--      on tasks only. It has no reference to task_messages or
--      task_remarks — unaffected by this migration.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- Part A — Drop task_messages
-- ─────────────────────────────────────────────────────────────
-- CASCADE removes:
--   - All RLS policies on task_messages (from migrations 0017, 0019, 0021)
--   - idx_task_messages_task_id index
--   - The supabase_realtime publication entry for task_messages
-- No data to preserve — pre-production table.

DROP TABLE IF EXISTS task_messages CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Part B — Create task_remarks
-- ─────────────────────────────────────────────────────────────

CREATE TABLE task_remarks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id     uuid        NOT NULL REFERENCES profiles(id),
  content       text        NOT NULL,  -- sanitizeText() applied at action layer before insert

  -- status_change: nullable. Populated when this remark accompanied a status transition.
  -- COUPLING WARNING: CHECK values must stay in sync with tasks.status CHECK (tasks_status_check).
  -- If tasks.status ever gains a new value, add a new migration to extend this CHECK too.
  status_change text        CHECK (status_change IN (
                              'to_do', 'in_progress', 'in_review',
                              'completed', 'error', 'cancelled'
                            )),

  is_suppressed boolean     NOT NULL DEFAULT false,
  suppressed_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  suppressed_at timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ASC not DESC: timeline reads oldest-first, newest appended at bottom.
CREATE INDEX idx_task_remarks_task_id
  ON task_remarks(task_id, created_at ASC);

ALTER TABLE task_remarks ENABLE ROW LEVEL SECURITY;

-- SELECT: mirrors task_messages visibility decision from migration 0019.
-- Viewer can see the remark if they can see the associated task:
--   - assigned to the task
--   - created the task
--   - manager, admin, or founder role
CREATE POLICY "task_remarks_select"
  ON task_remarks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE id = task_remarks.task_id
        AND (
          assigned_to = auth.uid()
          OR created_by = auth.uid()
          OR get_user_role() IN ('manager', 'admin', 'founder')
        )
    )
  );

-- INSERT: authenticated user who can see the task
CREATE POLICY "task_remarks_insert"
  ON task_remarks FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tasks
      WHERE id = task_remarks.task_id
        AND (
          assigned_to = auth.uid()
          OR created_by = auth.uid()
          OR get_user_role() IN ('manager', 'admin', 'founder')
        )
    )
  );

-- ──────────────────────────────────────────────────────────────
-- IMPORTANT: Suppression UPDATE policy — column scope
-- ──────────────────────────────────────────────────────────────
-- This policy permits admin and founder to UPDATE task_remarks rows.
-- PostgreSQL RLS does NOT restrict which columns may be updated —
-- the USING / WITH CHECK clauses only control which ROWS are eligible.
-- Column restriction (only is_suppressed, suppressed_by, suppressed_at
-- may change) is enforced exclusively at the Server Action layer
-- (suppressTaskRemarkAction in src/lib/actions/tasks.ts).
-- Future engineers: do not assume SQL prevents content/author changes.
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "task_remarks_suppression_update"
  ON task_remarks FOR UPDATE
  USING   (get_user_role() IN ('admin', 'founder'))
  WITH CHECK (get_user_role() IN ('admin', 'founder'));

-- No DELETE policy — ever. Append-only with suppression soft-delete pattern (rule A-11).

-- Enable Realtime for live task thread updates
ALTER PUBLICATION supabase_realtime ADD TABLE task_remarks;

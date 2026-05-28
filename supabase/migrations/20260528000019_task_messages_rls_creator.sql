-- ============================================================
-- Migration 0019 — task_messages RLS: creator visibility + manager domain scope
-- ============================================================
-- Two bugs fixed (both A-09 violations):
--
-- Bug 1 — missing creator branch on agent visibility:
--   The original policy only allowed assigned_to = auth.uid() for agents.
--   A user who created a task but assigned it to a colleague could not read
--   the task's message thread. created_by = auth.uid() was absent from the
--   USING clause for both SELECT and INSERT.
--
-- Bug 2 — manager cross-domain leak:
--   get_user_role() IN ('manager', 'admin', 'founder') granted managers
--   unrestricted access to task_messages across all domains. A manager in
--   concierge domain could subscribe to and read messages on finance tasks.
--
-- Fix — three-tier rule applied uniformly to SELECT and INSERT:
--   1. Any authenticated user who is the assignee or creator of the task
--      can always read/write its messages (personal task ownership).
--   2. Manager can additionally see messages on group_subtask tasks whose
--      parent task_group.domain matches get_user_domain().
--   3. admin and founder have unrestricted access.
--
-- Type note: task_groups.domain is text (migration 0017).
-- get_user_domain() returns app_domain (enum, migration 0001).
-- Explicit ::text cast required on get_user_domain() wherever it is
-- compared to a text column — PostgreSQL will not implicitly cast enum → text.
--
-- Rule A-14: never edit an existing migration. New migration only.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SELECT policy
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "task_messages_select" ON task_messages;

CREATE POLICY "task_messages_select"
  ON task_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_messages.task_id
        AND (
          -- Tier 1: direct ownership — assignee or creator, any role
          t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()

          -- Tier 2: manager sees group tasks in their own domain
          OR (
            get_user_role() = 'manager'
            AND t.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM task_groups tg
              WHERE tg.id = t.group_id
                AND tg.domain = get_user_domain()::text
            )
          )

          -- Tier 3: admin and founder — unrestricted
          OR get_user_role() IN ('admin', 'founder')
        )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- INSERT policy
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "task_messages_insert" ON task_messages;

CREATE POLICY "task_messages_insert"
  ON task_messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_messages.task_id
        AND (
          -- Tier 1: direct ownership
          t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()

          -- Tier 2: manager in matching domain
          OR (
            get_user_role() = 'manager'
            AND t.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM task_groups tg
              WHERE tg.id = t.group_id
                AND tg.domain = get_user_domain()::text
            )
          )

          -- Tier 3: admin and founder
          OR get_user_role() IN ('admin', 'founder')
        )
    )
  );

-- No UPDATE policy — append-only (rule A-11). Not touched.
-- No DELETE policy — append-only (rule A-11). Not touched.

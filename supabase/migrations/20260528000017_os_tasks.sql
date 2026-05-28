-- ============================================================
-- Migration 0017 — OS Tasks: task_groups, task_messages,
--                  tasks core upgrades, notifications type fix
-- ============================================================
-- Pre-mortem checklist:
--   1. task_groups created BEFORE group_id FK is added to tasks.
--   2. group_id column added BEFORE task_category backfill runs.
--   3. Status enum migration runs BEFORE new status CHECK is applied.
--   4. Notifications type check expanded safely (existing types all preserved).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Part B — task_groups (must come before tasks FK)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE task_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text,
  priority    text        NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('urgent', 'high', 'normal')),
  status      text        NOT NULL DEFAULT 'to_do'
                            CHECK (status IN ('to_do', 'in_progress', 'in_review', 'completed', 'error', 'cancelled')),
  due_at      timestamptz,
  created_by  uuid        NOT NULL REFERENCES profiles(id),
  domain      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Reuse the existing update_updated_at() function — do NOT recreate it.
CREATE TRIGGER task_groups_updated_at
  BEFORE UPDATE ON task_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_task_groups_domain
  ON task_groups(domain)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE INDEX idx_task_groups_created_by
  ON task_groups(created_by);

ALTER TABLE task_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_groups_select"
  ON task_groups FOR SELECT
  USING (
    created_by = auth.uid()
    OR get_user_role() IN ('manager', 'admin', 'founder')
  );

CREATE POLICY "task_groups_insert"
  ON task_groups FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "task_groups_update"
  ON task_groups FOR UPDATE
  USING (
    created_by = auth.uid()
    OR get_user_role() IN ('manager', 'admin', 'founder')
  )
  WITH CHECK (
    created_by = auth.uid()
    OR get_user_role() IN ('manager', 'admin', 'founder')
  );

CREATE POLICY "task_groups_delete"
  ON task_groups FOR DELETE
  USING (get_user_role() IN ('admin', 'founder'));

-- ─────────────────────────────────────────────────────────────
-- Part A — Alter tasks core table
-- ─────────────────────────────────────────────────────────────

-- Step 1: Add new columns (nullable first to avoid breaking existing rows)

ALTER TABLE tasks ADD COLUMN title       text;
ALTER TABLE tasks ADD COLUMN description text;
ALTER TABLE tasks ADD COLUMN priority    text NOT NULL DEFAULT 'normal';
ALTER TABLE tasks ADD COLUMN task_category text NOT NULL DEFAULT 'personal';

-- group_id added BEFORE task_category backfill (pre-mortem item 1)
ALTER TABLE tasks ADD COLUMN group_id    uuid REFERENCES task_groups(id) ON DELETE CASCADE;

-- Step 2: Backfill title — existing rows get '(untitled)'
UPDATE tasks SET title = '(untitled)' WHERE title IS NULL;

-- Step 3: Apply NOT NULL to title now that all rows have a value
ALTER TABLE tasks ALTER COLUMN title SET NOT NULL;

-- Step 4: Add CHECK constraint on priority
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('urgent', 'high', 'normal'));

-- Step 5: Backfill task_category
--   Any task with a matching task_gia_meta row → 'gia_followup'
--   All others → 'personal' (already defaulted above)
UPDATE tasks
SET task_category = 'gia_followup'
WHERE id IN (SELECT task_id FROM task_gia_meta);

-- Step 6: Add CHECK constraint on task_category
ALTER TABLE tasks ADD CONSTRAINT tasks_category_check
  CHECK (task_category IN ('personal', 'group_subtask', 'gia_followup'));

-- Step 7: Migrate status values to new enum vocabulary
--   'pending' → 'to_do'
--   'done'    → 'completed'
--   'cancelled' stays unchanged
UPDATE tasks SET status = 'to_do'     WHERE status = 'pending';
UPDATE tasks SET status = 'completed' WHERE status = 'done';

-- Step 8: Replace status CHECK constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('to_do', 'in_progress', 'in_review', 'completed', 'error', 'cancelled'));

-- Step 9: New indexes
CREATE INDEX idx_tasks_category
  ON tasks(task_category)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE INDEX idx_tasks_group_id
  ON tasks(group_id)
  WHERE group_id IS NOT NULL;

CREATE INDEX idx_tasks_priority
  ON tasks(priority, due_at)
  WHERE status NOT IN ('completed', 'cancelled');

-- ─────────────────────────────────────────────────────────────
-- Part C — task_messages (append-only, mirrors lead_notes pattern)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE task_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES profiles(id),
  content    text        NOT NULL,  -- sanitizeText() applied at action layer before insert
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_messages_task_id
  ON task_messages(task_id, created_at DESC);

ALTER TABLE task_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: viewer can see the task (mirrors tasks RLS without a full table scan)
-- Uses EXISTS with a targeted subquery on tasks — avoids sequential scan (pre-mortem item 3)
CREATE POLICY "task_messages_select"
  ON task_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_messages.task_id
        AND (
          (get_user_role() = 'agent' AND t.assigned_to = auth.uid())
          OR get_user_role() IN ('manager', 'admin', 'founder')
        )
    )
  );

-- INSERT: authenticated user who can see the task
CREATE POLICY "task_messages_insert"
  ON task_messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_messages.task_id
        AND (
          (get_user_role() = 'agent' AND t.assigned_to = auth.uid())
          OR get_user_role() IN ('manager', 'admin', 'founder')
        )
    )
  );

-- No UPDATE policy — append-only (rule A-11)
-- No DELETE policy — append-only (rule A-11)

-- Enable Realtime for live task thread updates
ALTER PUBLICATION supabase_realtime ADD TABLE task_messages;

-- ─────────────────────────────────────────────────────────────
-- Part D — notifications: add task_assigned type
-- ─────────────────────────────────────────────────────────────

-- Safety check: the existing CHECK covers 'lead_assigned','lead_won','task_due','mention','system'
-- New constraint adds 'task_assigned' — all existing values remain valid.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('lead_assigned', 'lead_won', 'task_due', 'task_assigned', 'mention', 'system'));

-- ─────────────────────────────────────────────────────────────
-- RLS verification note for tasks_agent_select
-- ─────────────────────────────────────────────────────────────
-- The existing "tasks_agent_select" policy reads:
--   get_user_role() = 'agent' AND assigned_to = auth.uid()
-- For group_subtask rows: an agent can only see subtasks assigned to themselves.
-- A subtask assigned to a colleague is invisible to this agent because
-- assigned_to ≠ auth.uid(). The policy is correct as-is — no change needed.

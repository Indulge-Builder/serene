-- ============================================================
-- Migration 0021 — task_messages suppression + task_audit_log
-- ============================================================
-- Pre-mortem checklist:
--   1. Suppression UPDATE policy permits ANY column update for admin/founder.
--      Column restriction (is_suppressed, suppressed_by, suppressed_at only)
--      is enforced at the Server Action layer — NOT in SQL. Document this so
--      future engineers do not assume SQL enforces it.
--   2. log_task_changes() uses auth.uid() which is NULL in service-role context.
--      Fallback to NEW.assigned_to is imperfect for reassignment logs — the new
--      assignee will appear as the changer. This is acceptable for service-role
--      writes (rare) and is documented in the trigger body below.
--   3. task_audit_log ON DELETE CASCADE — deleting a task also deletes its audit
--      log. This is intentional: task deletion is already restricted to admin/founder
--      at the application layer. Accepted trade-off.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- Part A — task_messages suppression columns
-- ─────────────────────────────────────────────────────────────

-- Add three columns to task_messages.
-- is_suppressed defaults to false — all existing rows remain visible.
-- suppressed_by and suppressed_at are null until a suppression occurs.

ALTER TABLE task_messages
  ADD COLUMN is_suppressed  boolean     NOT NULL DEFAULT false,
  ADD COLUMN suppressed_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN suppressed_at  timestamptz;

-- ──────────────────────────────────────────────────
-- IMPORTANT: Suppression UPDATE policy — column scope
-- ──────────────────────────────────────────────────
-- This policy permits admin and founder to UPDATE task_messages rows.
-- PostgreSQL RLS does NOT restrict which columns may be updated — the
-- USING / WITH CHECK clauses only control which ROWS are eligible.
-- Column restriction (only is_suppressed, suppressed_by, suppressed_at
-- may change) is enforced exclusively at the Server Action layer
-- (suppressTaskMessageAction in src/lib/actions/tasks.ts).
-- Future engineers: do not assume SQL prevents content/author changes.
-- ──────────────────────────────────────────────────

CREATE POLICY "task_messages_suppression_update"
  ON task_messages FOR UPDATE
  USING   (get_user_role() IN ('admin', 'founder'))
  WITH CHECK (get_user_role() IN ('admin', 'founder'));


-- ─────────────────────────────────────────────────────────────
-- Part B — task_audit_log
-- Append-only audit trail. Pattern mirrors profile_audit_log (migration 0001).
-- ─────────────────────────────────────────────────────────────

-- ─── Table ───────────────────────────────────────────────────

CREATE TABLE task_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  -- ON DELETE CASCADE: deleting a task removes its audit log.
  -- Task deletion is restricted to admin/founder at the application layer.
  -- Accepted trade-off — consistency over retention when a task is hard-deleted.
  changed_by  uuid        NOT NULL REFERENCES profiles(id),
  field_name  text        NOT NULL,
  old_value   text,
  new_value   text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_audit_log_task_id
  ON task_audit_log(task_id, changed_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE task_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: manager, admin, founder only. Agents do not see the audit log.
CREATE POLICY "task_audit_log_select"
  ON task_audit_log FOR SELECT
  USING (get_user_role() IN ('manager', 'admin', 'founder'));

-- No INSERT policy — written by trigger (service role) only.
-- No UPDATE policy — ever.
-- No DELETE policy — ever.


-- ─── Audit trigger function ───────────────────────────────────

CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _actor uuid;
BEGIN
  -- Prefer the authenticated session user.
  -- auth.uid() is NULL for service-role writes (e.g. Trigger.dev callbacks,
  -- admin bulk operations). In that case fall back to NEW.assigned_to as a
  -- best-effort attribution. Known limitation: a reassignment write by service
  -- role will record the NEW assignee as the changer, not the actual initiator.
  -- This is documented here and in CLAUDE.md. Do not add a changed_by column
  -- to tasks to "fix" this — the complexity is not worth it.
  _actor := COALESCE(auth.uid(), NEW.assigned_to);

  -- Log only these six fields. All other columns are intentionally excluded:
  --   task_category: immutable after creation.
  --   group_id:      immutable after creation.
  --   created_at:    metadata, not business state.
  --   updated_at:    derived, not business state.
  --   completed_at:  derived from status transition, already captured via status.

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'title', OLD.title, NEW.title);
  END IF;

  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'description', OLD.description, NEW.description);
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'status', OLD.status, NEW.status);
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'priority', OLD.priority, NEW.priority);
  END IF;

  IF OLD.due_at IS DISTINCT FROM NEW.due_at THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'due_at', OLD.due_at::text, NEW.due_at::text);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger fires AFTER UPDATE only — not INSERT, not DELETE.
CREATE TRIGGER tasks_audit
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_task_changes();

-- ============================================================
-- Migration 0023 — Add attachments (checklist) column to tasks
-- ============================================================
-- Rationale: tasks now support a structured checklist stored as JSONB.
-- Each item: { id: uuid-string, text: string, checked: boolean }
--
-- Pre-mortem checklist:
--   1. NOT NULL DEFAULT '[]'::jsonb — all existing rows backfilled to
--      empty array automatically; no UPDATE step needed.
--   2. CHECK constraint validates it is a JSON array (not object/scalar).
--   3. log_task_changes() trigger (migration 0021) watches exactly six
--      fields: title, description, status, priority, due_at, assigned_to.
--      attachments is NOT in that list — checklist toggles will NOT
--      flood task_audit_log. No trigger change needed.
--   4. No index on attachments — the column is never queried as a filter,
--      only read per-task after the task row is already fetched.
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Validate that the column value is always a JSON array (not object, not scalar).
-- Items shape: [{ "id": "uuid", "text": "string", "checked": boolean }]
-- Shape validation beyond array-type is enforced at the application layer.
ALTER TABLE tasks ADD CONSTRAINT tasks_attachments_is_array
  CHECK (jsonb_typeof(attachments) = 'array');

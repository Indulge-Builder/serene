-- ============================================================
-- Migration 0024 — Add tags column to tasks
-- ============================================================
-- Rationale: personal tasks need a tags[] field so users can
-- label tasks and filter the My Tasks list by tag.
--
-- Design decisions:
--   1. text[] NOT NULL DEFAULT '{}' — backfills all existing rows
--      to empty array; no UPDATE step needed.
--   2. GIN index on tags — supports the Postgres @> (contains)
--      operator used for tag-based filtering without sequential scan.
--      GIN is the correct index type for array containment queries.
--   3. No CHECK constraint on array length or content — enforced
--      at the application layer (Zod: max 10, each max 50 chars,
--      sanitized via sanitizeText).
--   4. RLS: existing tasks RLS policies cover tags automatically
--      because tags is a column on the tasks table, which already
--      has row-level security enabled.
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}';

-- GIN index for efficient array containment (@>) queries.
-- Partial index on personal tasks only — group subtasks never use tags.
CREATE INDEX idx_tasks_tags_gin
  ON tasks USING GIN (tags)
  WHERE task_category = 'personal';

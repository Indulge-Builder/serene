-- ============================================================
-- Migration 0027 — Lead SLA columns + constraint extensions
-- Adds status_changed_at and last_activity_at to leads.
-- Extends notifications and lead_activities type CHECK constraints.
--
-- This migration:
--   1. Adds two timestamptz columns to leads (backfilled from created_at).
--   2. Drops and re-creates the notifications type CHECK to add sla_breach_agent + sla_breach_manager.
--   3. Adds sla_breach to lead_activities action_type via DROP/ADD constraint.
--
-- Rule A-14: never edit a migration that has already run. New constraint values
-- are added here via ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT pattern.
-- ============================================================

-- ─── 1. Add SLA timestamp columns to leads ───────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status_changed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at   timestamptz;

-- Backfill: use created_at as the baseline for existing rows
UPDATE leads
SET
  status_changed_at = created_at,
  last_activity_at  = created_at
WHERE status_changed_at IS NULL;

-- Partial indexes for SLA timer scheduling queries
CREATE INDEX IF NOT EXISTS idx_leads_status_changed_at
  ON leads(status_changed_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_activity_at
  ON leads(last_activity_at)
  WHERE archived_at IS NULL;

-- ─── 2. Extend notifications.type CHECK ──────────────────────────────────────
-- Original constraint from migration 0016:
--   CHECK (type IN ('lead_assigned','lead_won','task_due','mention','system'))
-- After migration 0017 (OS Tasks), 'task_assigned' was added but the migration
-- text shows the CHECK was extended inline. We now add sla_breach_agent and
-- sla_breach_manager.
-- Pattern: drop existing constraint by name, re-add with extended value list.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'lead_assigned',
      'lead_won',
      'task_due',
      'task_assigned',
      'mention',
      'system',
      'sla_breach_agent',
      'sla_breach_manager'
    ));

-- ─── 3. Extend lead_activities action_type — add sla_breach ──────────────────
-- Original CHECK (from migration 0003): no explicit CHECK — action_type is free text.
-- Verified: no CHECK constraint on lead_activities.action_type in migration 0003.
-- The column is text NOT NULL with no CHECK. We add a CHECK here to make
-- sla_breach an explicit documented value without restricting existing values.
-- NOTE: We do NOT add a restrictive CHECK here because existing action_types
-- (lead_created, status_changed, note_added, agent_assigned, call_logged,
-- duplicate_submission) were inserted without a CHECK constraint, and adding one
-- now would require enumerating all historical values. Instead, we add a
-- migration comment only — sla_breach is valid by convention, enforced at app layer.

-- Document the sla_breach action_type as a comment in the migration:
-- Valid action_type values: lead_created | status_changed | note_added |
--   agent_assigned | call_logged | duplicate_submission | sla_breach
COMMENT ON COLUMN lead_activities.action_type IS
  'lead_created | status_changed | note_added | agent_assigned | call_logged | duplicate_submission | sla_breach';

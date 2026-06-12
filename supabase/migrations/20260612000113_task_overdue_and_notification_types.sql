-- Migration 0113: tasks.overdue_at + the two new notification type values
--                 + the two new whatsapp_notification_logs type values.
--
-- overdue_at: stamped exactly once by the overdue-escalation job
-- (check-task-overdue in src/trigger/task-reminders.ts) when a gia_followup
-- task passes due_at + TASK-01B.threshold_minutes with no clearing event
-- (task completed/cancelled OR a lead activity logged after due_at).
-- Deliberately a timestamp column, NOT a status value — the tasks.status
-- CHECK does not grow (Phase 2 directive). Exactly-once is enforced by the
-- job's UPDATE … WHERE overdue_at IS NULL.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS overdue_at timestamptz;

-- Partial index: the overdue job and future escalation surfaces only ever ask
-- about open gia tasks that have been stamped.
CREATE INDEX IF NOT EXISTS idx_tasks_overdue_at
  ON tasks (overdue_at)
  WHERE overdue_at IS NOT NULL;

-- ── notifications.type — two new values, existing naming convention ─────────
-- 'sla_breach_founder'   — SLA-01C (new lead untouched 45 min → founder)
-- 'task_overdue_manager' — TASK-01B (gia task due +30 min, no clearing event)

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
      'sla_breach_manager',
      'sla_breach_founder',
      'task_overdue_manager'
    ));

-- ── whatsapp_notification_logs.type — the two new template sends ────────────
-- 'task_due_reminder'    — task_due_reminder template to the assigned agent
-- 'task_overdue_manager' — task_overdue_manager template to domain managers

ALTER TABLE whatsapp_notification_logs
  DROP CONSTRAINT IF EXISTS whatsapp_notification_logs_type_check;

ALTER TABLE whatsapp_notification_logs
  ADD CONSTRAINT whatsapp_notification_logs_type_check
  CHECK (type IN (
    'agent_assignment',
    'founder_alert',
    'sla_breach',
    'lead_initiation',
    'task_due_reminder',
    'task_overdue_manager'
  ));

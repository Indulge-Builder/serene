-- Migration 0153: widen whatsapp_notification_logs.type CHECK with 'task_assigned'
--
-- The new "a task was assigned to you by <X>" WhatsApp template (sendTaskAssignedNotification
-- in whatsapp-api.ts) needs a log type, the one-log-row-per-attempt finally contract every
-- template send writes. Fires when a task is assigned TO the assignee (a personal task
-- assigned to another, or a group subtask). Gated by the existing 'task_assigned' control-
-- plane key (migration 0133) — NOT a new gate category, just a new LOG type. Mirrors the
-- 0142 / 0117 / 0151 CHECK widenings (DROP + re-ADD, re-listing all existing values).

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
    'task_overdue_manager',
    'task_due_soon',
    'task_overdue_agent',
    'task_overdue_manager_generic',
    'elaya_reply',
    'customer_welcome',
    'customer_reply',
    'task_assigned'
  ));

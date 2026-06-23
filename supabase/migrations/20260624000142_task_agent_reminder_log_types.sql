-- Migration 0142: three new whatsapp_notification_logs.type values for the
-- lead-agnostic task reminders (agent due-soon/overdue + non-lead manager
-- escalation).
--
-- 'task_due_soon'                 — TASK-01A "due soon" WhatsApp to the assigned
--                                   agent, fired 30 min BEFORE the deadline for
--                                   EVERY still-open task (sendTaskDueSoonTask).
-- 'task_overdue_agent'            — TASK-01A overdue WhatsApp to the assigned
--                                   agent, fired AT the deadline for EVERY
--                                   still-open task (the agent's own ping).
-- 'task_overdue_manager_generic'  — TASK-01B overdue escalation for a NON-lead
--                                   task to the assignee's manager (reports_to →
--                                   domain fallback), fired at due + threshold.
--                                   Task-shaped; the lead path keeps the existing
--                                   'task_overdue_manager' (lead-shaped) type.
--
-- The agent pings ride the existing 'task_due' control-plane key; the generic
-- manager escalation rides 'task_overdue_manager'. No notification_preferences
-- CHECK change is needed — these are LOG types, not new gate categories.
--
-- Re-lists all six existing 0113 values + 'elaya_reply' (0117) + the three new.

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
    'elaya_reply'
  ));

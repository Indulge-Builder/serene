-- Widen the type CHECK on whatsapp_notification_logs.
--
-- Before: type IN ('agent_assignment', 'founder_alert')
-- After:  type IN ('agent_assignment', 'founder_alert', 'sla_breach', 'lead_initiation')
--
-- Historical SLA rows cannot be reclassified: sendSlaAgentNotification logged them as
-- 'agent_assignment' and no reliable discriminator exists in stored gupshup_body values
-- (the body is a raw Gupshup API response, not the template ID we sent). Existing rows
-- stay as 'agent_assignment'; new SLA rows will use 'sla_breach' from this migration on.

ALTER TABLE whatsapp_notification_logs
  DROP CONSTRAINT IF EXISTS whatsapp_notification_logs_type_check;

ALTER TABLE whatsapp_notification_logs
  ADD CONSTRAINT whatsapp_notification_logs_type_check
  CHECK (type IN ('agent_assignment', 'founder_alert', 'sla_breach', 'lead_initiation'));

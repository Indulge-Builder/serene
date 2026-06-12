-- Migration 0117: widen the whatsapp_notification_logs.type CHECK with 'elaya_reply'.
--
-- Elaya's WhatsApp channel (staff persona) sends free-form session replies via
-- sendElayaWhatsAppReply in src/lib/services/whatsapp-api.ts. Every outbound
-- reply attempt gets exactly one audit row here — the same one-log-row-per-attempt
-- contract the template senders follow. recipient_phone stays last-4-digits only.

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
    'elaya_reply'
  ));

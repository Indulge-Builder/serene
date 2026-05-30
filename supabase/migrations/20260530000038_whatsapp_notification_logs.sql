CREATE TABLE whatsapp_notification_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text        NOT NULL CHECK (type IN ('agent_assignment', 'founder_alert')),
  lead_id          uuid        REFERENCES leads(id) ON DELETE SET NULL,
  recipient_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_phone  text        NOT NULL,  -- last 4 digits only — never store full number
  agent_name       text,                  -- agent being assigned (both notification types)
  lead_name        text,
  lead_phone       text,                  -- last 4 digits only
  domain           text,
  gupshup_status   int,                   -- HTTP status from Gupshup
  gupshup_body     text,                  -- response body, truncated to 2000 chars
  delivered        boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_notif_logs_lead_id    ON whatsapp_notification_logs(lead_id);
CREATE INDEX idx_wa_notif_logs_created_at ON whatsapp_notification_logs(created_at DESC);

ALTER TABLE whatsapp_notification_logs ENABLE ROW LEVEL SECURITY;

-- admin and founder can read all logs
CREATE POLICY wa_notif_logs_admin_founder_select
  ON whatsapp_notification_logs FOR SELECT
  USING (get_user_role() = ANY (ARRAY['admin','founder']::user_role[]));

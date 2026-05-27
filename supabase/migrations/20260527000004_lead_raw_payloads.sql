-- Migration 0004: lead_raw_payloads — immutable raw webhook log
-- Every inbound payload is stored verbatim before any extraction.
-- This is the source of truth for what was actually received.
-- Append-only: no UPDATE or DELETE ever (Rule 08).

CREATE TABLE lead_raw_payloads (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid          REFERENCES leads(id),              -- NULL until lead is created; backfilled immediately after insert
  source      text          NOT NULL,                           -- meta | google | website | whatsapp
  payload     jsonb         NOT NULL,                           -- verbatim payload as received
  received_at timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_raw_payloads_lead_id   ON lead_raw_payloads(lead_id);
CREATE INDEX idx_lead_raw_payloads_source    ON lead_raw_payloads(source, received_at DESC);

ALTER TABLE lead_raw_payloads ENABLE ROW LEVEL SECURITY;

-- Admins and founders can audit raw payloads
CREATE POLICY "lead_raw_payloads_admin_founder_select"
  ON lead_raw_payloads FOR SELECT
  USING (get_user_role() IN ('admin', 'founder'));

-- No UPDATE, no DELETE — append-only enforced at policy level.
-- All inserts come from service role (webhook context).

-- Migration 0032: whatsapp_conversations table
-- One row per unique phone number / lead. Container for a WhatsApp thread.
-- RLS mirrors leads table exactly (agent → own leads, manager → domain, admin/founder → all).
-- Realtime enabled for live inbox updates.

CREATE TABLE whatsapp_conversations (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid          NOT NULL REFERENCES leads(id) ON DELETE CASCADE UNIQUE,
  wa_id           text          NOT NULL UNIQUE,          -- E.164 without + (Meta's sender ID format)
  phone           text          NOT NULL,                 -- E.164 with + (canonical store format)
  status          text          NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'resolved')),
  last_message_at timestamptz,
  bot_active      boolean       NOT NULL DEFAULT true,
  bot_paused_by   uuid          REFERENCES profiles(id),
  bot_paused_at   timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_conversations_lead_id
  ON whatsapp_conversations(lead_id);

-- Partial index: only open conversations, sorted by most recent activity
CREATE INDEX idx_wa_conversations_last_message
  ON whatsapp_conversations(last_message_at DESC)
  WHERE status = 'open';

CREATE TRIGGER whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────
-- Helper: check if caller can see a given conversation
-- Mirrors leads RLS exactly via leads JOIN.
-- SECURITY DEFINER + SET search_path required (A-10).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION can_access_wa_conversation(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM leads l
    WHERE l.id = p_lead_id
      AND l.archived_at IS NULL
      AND (
        (get_user_role() = 'agent'   AND l.assigned_to = auth.uid())
        OR (get_user_role() = 'manager' AND l.domain = get_user_domain()::text)
        OR get_user_role() IN ('admin', 'founder')
      )
  );
$$;

-- Agents see only conversations for leads assigned to them
CREATE POLICY "wa_conversations_agent_select"
  ON whatsapp_conversations FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND can_access_wa_conversation(lead_id)
  );

-- Managers see all conversations in their domain
CREATE POLICY "wa_conversations_manager_select"
  ON whatsapp_conversations FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND can_access_wa_conversation(lead_id)
  );

-- Admin and founder see everything
CREATE POLICY "wa_conversations_admin_founder_select"
  ON whatsapp_conversations FOR SELECT
  USING (
    get_user_role() IN ('admin', 'founder')
  );

-- Update policy: same domain-scoping as leads update policy
-- Used for: bot_active toggle, status resolution, last_message_at refresh
CREATE POLICY "wa_conversations_update"
  ON whatsapp_conversations FOR UPDATE
  USING (
    (get_user_role() = 'agent'   AND can_access_wa_conversation(lead_id))
    OR (get_user_role() = 'manager' AND can_access_wa_conversation(lead_id))
    OR get_user_role() IN ('admin', 'founder')
  );

-- INSERT comes from service role only (webhook ingestion + server actions)
-- No INSERT policy needed for app users.

-- Realtime for live inbox updates
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;

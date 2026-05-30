-- Migration 0033: whatsapp_messages table
-- Append-only. Every message in both directions stored here.
-- One narrow UPDATE exception: delivery receipt status columns only (status, status_at).
-- This is a system write (webhook), not a user mutation — satisfies A-11.
-- wa_message_id uses a partial unique INDEX (not constraint) to allow multiple NULL rows
-- for optimistic pre-confirm inserts that don't yet have Meta's message ID.

CREATE TABLE whatsapp_messages (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid          NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  lead_id         uuid          NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction       text          NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type     text          NOT NULL CHECK (sender_type IN ('lead', 'agent', 'bot')),
  sender_id       uuid          REFERENCES profiles(id),   -- NULL for lead-sent or bot messages
  wa_message_id   text,                                    -- Meta's message ID; NULL for optimistic rows
  message_type    text          NOT NULL
                                CHECK (message_type IN ('text', 'image', 'video', 'document', 'audio', 'template')),
  content         text,                                    -- NULL for media-only messages
  media_url       text,                                    -- signed URL for media messages
  media_mime_type text,
  status          text          DEFAULT 'sent'
                                CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  status_at       timestamptz,
  is_bot          boolean       NOT NULL DEFAULT false,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Primary read pattern: full conversation thread, oldest first
CREATE INDEX idx_wa_messages_conversation_id
  ON whatsapp_messages(conversation_id, created_at ASC);

-- Lead dossier integration: last N messages for a lead
CREATE INDEX idx_wa_messages_lead_id
  ON whatsapp_messages(lead_id, created_at DESC);

-- Webhook dedup + delivery receipt updates: partial so NULLs never conflict
CREATE UNIQUE INDEX idx_wa_messages_wa_message_id
  ON whatsapp_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────
-- SELECT — same domain-scoping as conversations, via leads JOIN
-- ─────────────────────────────────────────────────────────
CREATE POLICY "wa_messages_agent_select"
  ON whatsapp_messages FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND can_access_wa_conversation(lead_id)
  );

CREATE POLICY "wa_messages_manager_select"
  ON whatsapp_messages FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND can_access_wa_conversation(lead_id)
  );

CREATE POLICY "wa_messages_admin_founder_select"
  ON whatsapp_messages FOR SELECT
  USING (
    get_user_role() IN ('admin', 'founder')
  );

-- ─────────────────────────────────────────────────────────
-- UPDATE — delivery receipt only; service/webhook role writes this.
-- App users (agent/manager) cannot UPDATE any row.
-- Column restriction (only status + status_at) is enforced at the application layer.
-- RLS cannot restrict which columns change — only which rows are eligible.
-- ─────────────────────────────────────────────────────────
-- No UPDATE policy for regular roles. Service role bypasses RLS.
-- This means delivery receipt status updates go through server actions
-- using the service-role client (src/lib/supabase/admin.ts).

-- INSERT: service role only (webhook ingestion + sendWhatsAppMessage action)
-- No INSERT policy for app users — all writes use service-role client.

-- No DELETE policy — append-only enforced at policy level.

-- Realtime for live message streaming to agent inbox
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;

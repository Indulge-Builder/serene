-- Migration 0034: whatsapp_conversation_reads table
-- Tracks per-agent read position per conversation.
-- Not in The_Gia.md §14 — added to enable unread badge counts on the WhatsApp inbox.
-- Only agents ever need unread counts; managers/admin see all and have no unread UI.
-- RLS: agents can only read and write their own rows. No other roles need policies here.

CREATE TABLE whatsapp_conversation_reads (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid          NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  agent_id        uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at    timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, agent_id)
);

CREATE INDEX idx_wa_reads_agent_id
  ON whatsapp_conversation_reads(agent_id);

ALTER TABLE whatsapp_conversation_reads ENABLE ROW LEVEL SECURITY;

-- Agents can only read their own read-position rows
CREATE POLICY "wa_reads_agent_select"
  ON whatsapp_conversation_reads FOR SELECT
  USING (agent_id = auth.uid());

-- Agents can insert their own read-position rows
CREATE POLICY "wa_reads_agent_insert"
  ON whatsapp_conversation_reads FOR INSERT
  WITH CHECK (agent_id = auth.uid());

-- Agents can update their own read-position rows (UPSERT pattern: mark as read)
CREATE POLICY "wa_reads_agent_update"
  ON whatsapp_conversation_reads FOR UPDATE
  USING (agent_id = auth.uid());

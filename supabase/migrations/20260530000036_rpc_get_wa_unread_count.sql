-- get_wa_unread_count()
-- Per-agent unread WhatsApp conversation count.
-- Counts open conversations where the calling agent has no read record,
-- or where the conversation has a message newer than their last read.
-- Returns 0 (never null) — COUNT(*) always produces a row.

CREATE OR REPLACE FUNCTION get_wa_unread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM whatsapp_conversations wc
  LEFT JOIN whatsapp_conversation_reads wcr
    ON wcr.conversation_id = wc.id
    AND wcr.agent_id = auth.uid()
  WHERE wc.status = 'open'
    AND (
      wcr.last_read_at IS NULL
      OR wc.last_message_at > wcr.last_read_at
    )
    AND can_access_wa_conversation(wc.id)
$$;

GRANT EXECUTE ON FUNCTION get_wa_unread_count() TO authenticated;

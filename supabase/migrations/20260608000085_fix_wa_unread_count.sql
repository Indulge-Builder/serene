-- Fix get_wa_unread_count(): can_access_wa_conversation expects lead_id, not conversation id.
-- Passing wc.id always failed the leads lookup — unread badge returned 0 for every agent.

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
    AND can_access_wa_conversation(wc.lead_id)
$$;

GRANT EXECUTE ON FUNCTION get_wa_unread_count() TO authenticated;

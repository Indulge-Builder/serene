-- Migration 0037: INSERT policy for outbound whatsapp_messages
-- Allows authenticated agents/managers/admin/founder to insert outbound rows
-- for conversations they can access. Enforces: direction=outbound, sender_type=agent,
-- sender_id=own uid, and conversation access via can_access_wa_conversation().
-- Inbound inserts continue to use createAdminClient() in whatsapp-ingestion.ts (A-11).

CREATE POLICY wa_messages_outbound_insert
  ON whatsapp_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    direction       = 'outbound'
    AND sender_type = 'agent'
    AND sender_id   = auth.uid()
    AND can_access_wa_conversation(lead_id)
    AND get_user_role() IN ('agent', 'manager', 'admin', 'founder')
  );

-- Elaya WhatsApp idempotency — structural dedup guard (audit M7).
--
-- tryHandleElayaWhatsAppMessage dedups inbound WhatsApp messages by checking
-- hasProcessedWaMessage (a SELECT on meta->>'wa_message_id') BEFORE inserting the
-- user-message row. But the check + insert are not atomic, and the marker row is
-- written only AFTER profile lookup + (for voice notes) a multi-second Deepgram
-- transcription. Two BSP redeliveries landing inside that window both pass the
-- SELECT, both burn the daily cap, both run a full brain turn, both reply.
--
-- This adds the missing structural backstop (the lead pipeline already has the
-- equivalent on whatsapp_messages.wa_message_id): a partial UNIQUE index on the
-- WhatsApp inbound message id. A raced second insert now fails with 23505, which
-- insertUserMessage maps to "already processed" — exactly one turn per message.
--
-- Partial predicate is the SAME triple hasProcessedWaMessage filters on
-- (channel='whatsapp' AND role='user' AND wa_message_id present), so:
--   • in-app messages (no wa_message_id) are untouched — they never enter the index;
--   • assistant rows are untouched;
--   • only an inbound staff WhatsApp message id is uniquely constrained.
-- elaya_messages stays append-only (A-11) — this is an index, not a policy.

CREATE UNIQUE INDEX IF NOT EXISTS idx_elaya_messages_wa_dedup
  ON public.elaya_messages ((meta->>'wa_message_id'))
  WHERE channel = 'whatsapp'
    AND role = 'user'
    AND meta->>'wa_message_id' IS NOT NULL;

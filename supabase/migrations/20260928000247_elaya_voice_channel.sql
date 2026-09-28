-- 0247 — Elaya's voice channel (2026-09-28)
--
-- A real-time voice door on Elaya: the browser joins a LiveKit room, the voice
-- worker (backend/voice) listens, sends each finished sentence to the SAME
-- Python brain endpoint every other channel uses, and speaks the reply. The
-- brain persists both rows of every turn exactly as it does for chat, stamped
-- with the new channel value `voice`, so a call continues the user's one active
-- conversation and shows up in the /elaya transcript afterwards.
--
-- Two things change here, nothing else:
--   1. The `channel` CHECKs on elaya_conversations and elaya_messages learn
--      'voice' (and 'mcp', which the later tables already carry; no row has it
--      today, the connector stores no messages, so this only makes the four
--      CHECKs agree).
--   2. One settings row, `voice_enabled`, seeded FALSE: deploying the code
--      changes nothing until an operator flips it, the brain-switch posture.
--
--   UPDATE elaya_settings SET value = 'true' WHERE key = 'voice_enabled';
--
-- No RLS change (0116's policies stand; the browser never inserts a voice row,
-- the brain does through the service role).

ALTER TABLE public.elaya_conversations
  DROP CONSTRAINT IF EXISTS elaya_conversations_channel_check;
ALTER TABLE public.elaya_conversations
  ADD CONSTRAINT elaya_conversations_channel_check
  CHECK (channel IN ('in_app', 'whatsapp', 'mcp', 'voice'));

ALTER TABLE public.elaya_messages
  DROP CONSTRAINT IF EXISTS elaya_messages_channel_check;
ALTER TABLE public.elaya_messages
  ADD CONSTRAINT elaya_messages_channel_check
  CHECK (channel IN ('in_app', 'whatsapp', 'mcp', 'voice'));

INSERT INTO public.elaya_settings (key, value)
VALUES ('voice_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

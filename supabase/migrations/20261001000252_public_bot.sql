-- Migration 0252: the public Indulge bot (docs/architecture/indulge-bot-plan.md).
--
-- A second WhatsApp line (the public number) next to the staff one, the bot's own state on a
-- conversation, the library grown into the knowledge pack (new kinds, draft/approved, the
-- "when to send" line, the file's real type and size, ready messages with attachments), the
-- published pack as an append-only version table, the append-only turn ledger, the corrections
-- queue, the bot's own model row, and its three settings. Everything ships OFF:
-- public_bot_enabled is false until the founder switches it on.
--
-- Nothing here changes how the staff line behaves: every existing conversation is line 'staff',
-- every existing caller keeps its uniqueness (now per line), and the bot gate in code reads
-- public_bot_enabled before anything else.

-- ── 1. The bot's own model row ──────────────────────────────────────────────────────────────
ALTER TABLE public.llm_providers DROP CONSTRAINT llm_providers_job_type_check;
ALTER TABLE public.llm_providers ADD CONSTRAINT llm_providers_job_type_check
  CHECK (job_type = ANY (ARRAY['routing'::text, 'reasoning'::text, 'heavy'::text, 'public_bot'::text]));

INSERT INTO public.llm_providers (job_type, provider, model, max_tokens, active)
VALUES ('public_bot', 'anthropic', 'claude-haiku-4-5', 1024, true)
ON CONFLICT (job_type) DO NOTHING;

-- ── 2. Two lines: a conversation belongs to the number it arrived on ───────────────────────
ALTER TABLE gia.whatsapp_conversations
  ADD COLUMN line text NOT NULL DEFAULT 'staff' CHECK (line IN ('staff', 'public'));

-- One thread per person PER LINE (was: per person). A prospect who already has a thread on the
-- staff number gets a second, separate thread on the public number.
ALTER TABLE gia.whatsapp_conversations DROP CONSTRAINT whatsapp_conversations_lead_id_key;
ALTER TABLE gia.whatsapp_conversations DROP CONSTRAINT whatsapp_conversations_wa_id_key;
ALTER TABLE gia.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_line_lead_id_key UNIQUE (line, lead_id);
ALTER TABLE gia.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_line_wa_id_key UNIQUE (line, wa_id);
-- The old single-column lookups by lead_id stay fast.
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_lead_id ON gia.whatsapp_conversations (lead_id);

-- The bot's own state, separate from bot_active (bot_active stays the agent's switch: an agent
-- reply turns it off, as today). The bot speaks only when bot_active AND bot_state = 'active'.
ALTER TABLE gia.whatsapp_conversations
  ADD COLUMN bot_state text NOT NULL DEFAULT 'active'
    CHECK (bot_state IN ('active', 'handed_over', 'opted_out')),
  ADD COLUMN handed_over_at timestamptz,
  ADD COLUMN handover_reason text;

-- ── 3. Which library item a message carried ─────────────────────────────────────────────────
ALTER TABLE gia.whatsapp_messages
  ADD COLUMN training_asset_id uuid REFERENCES public.elaya_training_assets (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_training_asset
  ON gia.whatsapp_messages (lead_id, training_asset_id) WHERE training_asset_id IS NOT NULL;

-- ── 4. The notification log knows the line and the bot's send types ─────────────────────────
ALTER TABLE gia.whatsapp_notification_logs
  ADD COLUMN line text NOT NULL DEFAULT 'staff' CHECK (line IN ('staff', 'public'));
ALTER TABLE gia.whatsapp_notification_logs DROP CONSTRAINT whatsapp_notification_logs_type_check;
ALTER TABLE gia.whatsapp_notification_logs ADD CONSTRAINT whatsapp_notification_logs_type_check
  CHECK (type = ANY (ARRAY[
    'agent_assignment', 'founder_alert', 'sla_breach', 'lead_initiation', 'task_due_reminder',
    'task_overdue_manager', 'task_due_soon', 'task_overdue_agent', 'task_overdue_manager_generic',
    'elaya_reply', 'customer_welcome', 'customer_reply', 'task_assigned', 'sia_alert',
    'public_reply', 'public_media', 'public_welcome', 'handover_alert', 'library_send'
  ]::text[]));

-- ── 5. The library grows into the knowledge pack ────────────────────────────────────────────
ALTER TABLE public.elaya_training_assets DROP CONSTRAINT elaya_training_assets_kind_check;
ALTER TABLE public.elaya_training_assets ADD CONSTRAINT elaya_training_assets_kind_check
  CHECK (kind = ANY (ARRAY[
    'brochure', 'work_example', 'testimonial', 'review', 'podcast', 'image', 'video', 'doc',
    'fact', 'url',
    'audio', 'ready_message', 'story', 'answer', 'objection', 'news', 'forbidden'
  ]::text[]));

ALTER TABLE public.elaya_training_assets
  ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  ADD COLUMN when_to_send text,
  ADD COLUMN mime_type text,
  ADD COLUMN byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  ADD COLUMN attachments uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES public.profiles (id),
  ADD COLUMN approved_at timestamptz;
-- Rows written before today were curated by hand for the June bot and never reached anyone;
-- they keep counting as approved so nothing a founder already entered silently disappears.
UPDATE public.elaya_training_assets SET status = 'approved' WHERE status = 'draft';

-- ── 6. Stories: the case library gets a public face ─────────────────────────────────────────
ALTER TABLE gia.service_cases
  ADD COLUMN public_summary text,
  ADD COLUMN public_approved_at timestamptz,
  ADD COLUMN public_approved_by uuid REFERENCES public.profiles (id);

-- ── 7. The published pack: append-only, the newest row is what the bot knows ───────────────
CREATE TABLE public.bot_knowledge_versions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version       bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  compiled_text text        NOT NULL,
  item_count    integer     NOT NULL CHECK (item_count >= 0),
  -- The asset and story ids that went in, so a reply can be traced to what it knew.
  asset_ids     uuid[]      NOT NULL DEFAULT '{}',
  story_ids     uuid[]      NOT NULL DEFAULT '{}',
  -- The leak check's verdict at publish time (always clean: a hit refuses the publish).
  leak_check    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- A rollback publishes an older version's text again as a new row; this names it.
  restored_from bigint,
  published_by  uuid        REFERENCES public.profiles (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.bot_knowledge_versions IS
  'The public bot''s published knowledge pack (0252). Append-only: the newest row is live; a rollback is a new row. Written only by bot-knowledge-service publish (admin client).';
ALTER TABLE public.bot_knowledge_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_knowledge_versions_select" ON public.bot_knowledge_versions FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'manager'));
GRANT SELECT ON public.bot_knowledge_versions TO authenticated;
GRANT ALL ON public.bot_knowledge_versions TO service_role;

-- ── 8. The turn ledger: one row per bot turn, append-only ───────────────────────────────────
CREATE TABLE gia.whatsapp_bot_turns (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid        NOT NULL REFERENCES gia.whatsapp_conversations (id) ON DELETE CASCADE,
  lead_id            uuid        REFERENCES gia.leads (id) ON DELETE SET NULL,
  line               text        NOT NULL DEFAULT 'public' CHECK (line IN ('staff', 'public')),
  -- replied | handed_over | blocked (output guard) | capped (a ceiling) | opted_out | error
  outcome            text        NOT NULL CHECK (outcome IN ('replied', 'handed_over', 'blocked', 'capped', 'opted_out', 'error')),
  model              text,
  pack_version       bigint,
  input_tokens       integer     NOT NULL DEFAULT 0,
  output_tokens      integer     NOT NULL DEFAULT 0,
  cache_read_tokens  integer     NOT NULL DEFAULT 0,
  cache_write_tokens integer     NOT NULL DEFAULT 0,
  cost_usd           numeric(12, 6) NOT NULL DEFAULT 0,
  tools              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sent_asset_ids     uuid[]      NOT NULL DEFAULT '{}',
  input_guard        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  output_guard       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  handover_reason    text,
  latency_ms         integer,
  created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE gia.whatsapp_bot_turns IS
  'The public bot''s turn ledger (0252). Append-only: model, pack version, tokens, cost, tools, guard verdicts, outcome. The daily spend cap is summed from it.';
CREATE INDEX idx_whatsapp_bot_turns_created ON gia.whatsapp_bot_turns (created_at DESC);
CREATE INDEX idx_whatsapp_bot_turns_conversation ON gia.whatsapp_bot_turns (conversation_id, created_at DESC);
ALTER TABLE gia.whatsapp_bot_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_bot_turns_select" ON gia.whatsapp_bot_turns FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
-- No insert / update / delete policy: written by the service role only, never changed.

-- ── 9. The corrections queue: an agent says what the bot should have said ──────────────────
CREATE TABLE public.bot_corrections (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       uuid        REFERENCES gia.whatsapp_messages (id) ON DELETE SET NULL,
  conversation_id  uuid        REFERENCES gia.whatsapp_conversations (id) ON DELETE SET NULL,
  lead_id          uuid        REFERENCES gia.leads (id) ON DELETE SET NULL,
  what_she_said    text        NOT NULL,
  should_have_said text        NOT NULL,
  note             text,
  status           text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'dismissed')),
  created_by       uuid        NOT NULL REFERENCES public.profiles (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_by      uuid        REFERENCES public.profiles (id),
  resolved_at      timestamptz,
  resolution_note  text
);
COMMENT ON TABLE public.bot_corrections IS
  'Corrections to the public bot from the agent inbox (0252). Each ends as a pack edit, a playbook edit, or dismissed. Written by actions/public-bot.ts through the admin client.';
CREATE INDEX idx_bot_corrections_open ON public.bot_corrections (created_at DESC) WHERE status = 'open';
ALTER TABLE public.bot_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_corrections_select" ON public.bot_corrections FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'manager') OR created_by = auth.uid());
GRANT SELECT ON public.bot_corrections TO authenticated;
GRANT ALL ON public.bot_corrections TO service_role;

-- ── 10. The settings: off, a small daily cap, no test phones ────────────────────────────────
INSERT INTO public.elaya_settings (key, value) VALUES
  ('public_bot_enabled', 'false'::jsonb),
  ('public_bot_daily_cap_usd', '5'::jsonb),
  ('public_bot_test_phones', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

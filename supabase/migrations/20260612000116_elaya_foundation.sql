-- Migration 0116: Elaya foundation — the substrate every future AI feature plugs into.
--
-- Tables:
--   elaya_conversations  one row per chat session (24h expiry enforced in the service layer)
--   elaya_messages       append-only transcript (A-11); `channel` column from day one so the
--                        future WhatsApp customer channel lands without a schema change
--   user_context         per-user durable context Elaya may consult (writes service-role only;
--                        empty until the context-writing phase)
--   elaya_actions        proposed agentic actions (EMPTY until Phase 2 — write surface is
--                        service-role only; no app code inserts yet)
--   llm_providers        config table mapping job-type → provider+model (sla_policies pattern:
--                        read per request via the admin client, never module-cached — a model
--                        switch applies on the next message with no deploy)
--   elaya_settings       small key/value config (daily message cap, PII masking depth,
--                        session expiry) — same read-per-request contract
--
-- RLS posture: users read their own conversations/messages/context/actions; user-role message
-- INSERT is allowed on own conversations (the chat route double-enforces via requireProfile-
-- equivalent auth — A-09 two layers). Assistant/tool writes, context writes, action writes and
-- all config writes are service-role only. Config SELECT is admin/founder (mirrors sla_policies).

-- ─────────────────────────────────────────────────────────────────────────────
-- elaya_conversations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE elaya_conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel         text        NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp')),
  title           text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_elaya_conversations_user_recent
  ON elaya_conversations (user_id, last_message_at DESC)
  WHERE archived_at IS NULL;

CREATE TRIGGER elaya_conversations_updated_at
  BEFORE UPDATE ON elaya_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE elaya_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elaya_conversations_select_own"
  ON elaya_conversations FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "elaya_conversations_insert_own"
  ON elaya_conversations FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()) AND channel = 'in_app');

-- No UPDATE/DELETE policies: last_message_at bumps and archiving go through the
-- service-role client from elaya-service.ts (the authed route is the trust boundary).

-- ─────────────────────────────────────────────────────────────────────────────
-- elaya_messages — APPEND-ONLY (A-11). No UPDATE or DELETE. Ever.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE elaya_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES elaya_conversations(id) ON DELETE CASCADE,
  -- sender_id is the human author for role='user' rows; NULL for assistant/tool rows.
  -- Denormalised so the daily-cap count is one indexed predicate, no join.
  sender_id       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  role            text        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  channel         text        NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp')),
  content         text        NOT NULL,
  -- tool_calls: normalized [{ id, name, input }] emitted by the assistant turn (audit trail);
  -- meta: provider/model/usage snapshot for the turn. Both deliberately schemaless.
  tool_calls      jsonb,
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT elaya_messages_user_rows_have_sender
    CHECK (role <> 'user' OR sender_id IS NOT NULL)
);

CREATE INDEX idx_elaya_messages_conversation
  ON elaya_messages (conversation_id, created_at ASC);

-- Serves the server-enforced daily cap: COUNT(*) WHERE sender_id = X AND created_at >= IST midnight
CREATE INDEX idx_elaya_messages_sender_day
  ON elaya_messages (sender_id, created_at DESC)
  WHERE role = 'user';

ALTER TABLE elaya_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elaya_messages_select_own"
  ON elaya_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM elaya_conversations c
      WHERE c.id = conversation_id AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "elaya_messages_insert_own_user"
  ON elaya_messages FOR INSERT
  WITH CHECK (
    role = 'user'
    AND sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM elaya_conversations c
      WHERE c.id = conversation_id AND c.user_id = (SELECT auth.uid())
    )
  );

-- assistant/tool rows are written by the service-role client only.
-- No UPDATE policy. No DELETE policy. Append-only (A-11).

-- ─────────────────────────────────────────────────────────────────────────────
-- user_context — durable per-user context for Elaya (one row per user)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE user_context (
  user_id    uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  context    jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER user_context_updated_at
  BEFORE UPDATE ON user_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_context_select_own"
  ON user_context FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- Writes are service-role only (Elaya's context writer lands in a later phase).

-- ─────────────────────────────────────────────────────────────────────────────
-- elaya_actions — EMPTY until Phase 2 (agentic writes). Schema reserved now so
-- the action-proposal pipeline lands without a foundation migration.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE elaya_actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES elaya_conversations(id) ON DELETE CASCADE,
  message_id      uuid        REFERENCES elaya_messages(id) ON DELETE SET NULL,
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type     text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed', 'approved', 'dismissed', 'executed', 'failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_elaya_actions_user ON elaya_actions (user_id, created_at DESC);

ALTER TABLE elaya_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elaya_actions_select_own"
  ON elaya_actions FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- All writes service-role only (Phase 2 approve/dismiss goes through gated actions).

-- ─────────────────────────────────────────────────────────────────────────────
-- llm_providers — job-type → provider + model (config-over-deploy, sla_policies pattern)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE llm_providers (
  job_type   text        PRIMARY KEY CHECK (job_type IN ('routing', 'reasoning')),
  provider   text        NOT NULL CHECK (provider IN ('anthropic', 'google', 'openai')),
  model      text        NOT NULL,
  max_tokens integer     NOT NULL DEFAULT 2048 CHECK (max_tokens > 0),
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER llm_providers_updated_at
  BEFORE UPDATE ON llm_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE llm_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "llm_providers_admin_founder_select"
  ON llm_providers FOR SELECT
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

-- Writes service-role only (future settings UI goes through an admin-gated action).

INSERT INTO llm_providers (job_type, provider, model, max_tokens, active) VALUES
  ('routing',   'anthropic', 'claude-haiku-4-5',  1024, true),
  ('reasoning', 'anthropic', 'claude-sonnet-4-6', 2048, true);

-- ─────────────────────────────────────────────────────────────────────────────
-- elaya_settings — key/value config rows (cap, masking depth, session expiry)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE elaya_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER elaya_settings_updated_at
  BEFORE UPDATE ON elaya_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE elaya_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elaya_settings_admin_founder_select"
  ON elaya_settings FOR SELECT
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

-- Writes service-role only.

INSERT INTO elaya_settings (key, value) VALUES
  ('daily_message_cap',    '200'::jsonb),
  ('pii_masking_depth',    '"light"'::jsonb),
  ('session_expiry_hours', '24'::jsonb);

-- 0254 — The model usage ledger, the spend read, the turn idempotency key, two cost switches.
-- 2026-10-02. Cost audit P0 (docs/audits/2026-10-01-elaya-cost-architecture.md): "usage accounting
-- cannot explain or enforce the bill". Both runtimes (the Node registry, lib/elaya/registry.ts, and
-- the Python registry, backend/app/llm/registry.py) write ONE row per provider request here, at the
-- adapter boundary, so every feature is counted with zero call-site edits: the chat turn and its
-- router and closing call, the memory reader, the profiler, intake, the drafts, the assessment, the
-- brief, the deep read, the alerts, the media reader, the vendor extractor, the public bot. Raw token
-- counts in every category the provider bills + the price version they were priced with, so a wrong
-- rate is a re-price and never a lost number. Append-only (rule 08): no UPDATE, no DELETE, ever.

-- ── 1. The ledger ─────────────────────────────────────────────────────────────
CREATE TABLE public.llm_usage_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  runtime               text        NOT NULL CHECK (runtime IN ('node', 'python')),
  provider              text        NOT NULL,
  model_requested       text        NOT NULL,                 -- the configured model (llm_providers)
  model                 text,                                 -- the model the provider says answered
  request_id            text,                                 -- the provider's own message id (reconciliation, dedupe)
  feature               text        NOT NULL,                 -- chat_turn | chat_router | chat_closing | memory_reader | profiler | ... grown as we learn
  job_type              text,                                 -- routing | reasoning | heavy | public_bot
  channel               text,
  user_id               uuid,
  conversation_id       uuid,
  message_id            uuid,
  job_id                uuid,
  run_id                uuid,                                 -- sia.extraction_runs, when the caller keeps one
  attempt               smallint    NOT NULL DEFAULT 1,
  prompt_version        text,
  behaviour_version     text,
  input_tokens          integer     NOT NULL DEFAULT 0,       -- uncached input, billed at the full rate
  cache_write_tokens    integer     NOT NULL DEFAULT 0,       -- every cache write (5 min + 1 h)
  cache_write_1h_tokens integer     NOT NULL DEFAULT 0,       -- the 1 h part of the above (billed 2x, not 1.25x)
  cache_read_tokens     integer     NOT NULL DEFAULT 0,
  output_tokens         integer     NOT NULL DEFAULT 0,
  stop_reason           text,
  latency_ms            integer,
  tools_offered         smallint,                             -- how many tool definitions rode the request
  tool_result_chars     integer,                              -- the serialized tool results in the request's messages
  cost_usd              numeric(12,6),                        -- NULL = the model is not in the price table
  price_version         text,
  ok                    boolean     NOT NULL DEFAULT true,    -- false = the provider failed; the counters may be partial
  error                 text
);
COMMENT ON TABLE public.llm_usage_events IS
  'One row per model request Serene makes, from either runtime, written at the provider boundary. Raw token counts in every billed category + the price version; cost_usd is our own estimate. Append-only.';

CREATE INDEX idx_llm_usage_events_created ON public.llm_usage_events (created_at DESC);
CREATE INDEX idx_llm_usage_events_feature ON public.llm_usage_events (feature, created_at DESC);
CREATE INDEX idx_llm_usage_events_conversation ON public.llm_usage_events (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_llm_usage_events_user ON public.llm_usage_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;
-- A retry that got a receipt lands once: the provider's id is unique per provider.
CREATE UNIQUE INDEX idx_llm_usage_events_request ON public.llm_usage_events (provider, request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.llm_usage_events ENABLE ROW LEVEL SECURITY;
-- Admin and founder may read the ledger (the spend page to come); writes are the service role's only.
CREATE POLICY "llm_usage_events_select" ON public.llm_usage_events FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.llm_usage_events TO authenticated;
GRANT ALL ON public.llm_usage_events TO service_role;
-- No UPDATE / DELETE policies: a ledger row is never changed.

-- ── 2. The spend read ─────────────────────────────────────────────────────────
-- Dollars spent since an instant, optionally for a set of features (the chat daily cap reads
-- the chat features; the spend page reads everything). Service role only (Q-13 revoked tier):
-- the caller is a server read with a code-derived window, never a browser.
CREATE OR REPLACE FUNCTION public.llm_spend_usd(p_since timestamptz, p_features text[] DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(cost_usd), 0)::numeric
  FROM public.llm_usage_events
  WHERE created_at >= p_since
    AND (p_features IS NULL OR feature = ANY (p_features));
$$;
REVOKE EXECUTE ON FUNCTION public.llm_spend_usd(timestamptz, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_spend_usd(timestamptz, text[]) TO service_role;

-- ── 3. The analyst's view (0223 conventions: explicit columns, no free text) ──
CREATE VIEW elaya_read.llm_usage AS
  SELECT id AS event_id, created_at, runtime, feature, job_type, channel, model, user_id AS staff_id,
         conversation_id, job_id, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
         stop_reason, latency_ms, cost_usd, ok
  FROM public.llm_usage_events;
COMMENT ON VIEW elaya_read.llm_usage IS
  'Every model request Elaya and the background jobs made, with tokens by category and our cost estimate (USD). feature says what paid: chat_turn / chat_router / chat_closing / memory_reader / profiler / intake / ticket_draft / assessment / briefing / deep_read_* / alerts_tone / media_read / vendor_extract / public_bot ... staff_id joins staff.staff_id. ALWAYS aggregate or filter by created_at.';
GRANT SELECT ON elaya_read.llm_usage TO elaya_reader;

-- ── 4. A general turn idempotency key (0148 was WhatsApp only) ────────────────
-- The voice worker and any future caller may stamp meta.turn_key on the user row of a turn; a
-- retried request with the same key is refused by the index (23505 → the endpoint's 409), so a
-- transport retry never runs a second turn. Same posture as idx_elaya_messages_wa_dedup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_elaya_messages_turn_key
  ON public.elaya_messages ((meta->>'turn_key'))
  WHERE role = 'user'
    AND meta->>'turn_key' IS NOT NULL;

-- ── 5. Two switches, both inert until a founder sets them ────────────────────
-- elaya_chat_daily_cap_usd: a day's ceiling (IST) for the chat features; null = no ceiling.
-- elaya_specialist_tiers: {"analytics": "reasoning", ...} moves a specialist to another model tier
-- with no deploy (the audit: route by complexity, not by the word "analytics").
INSERT INTO public.elaya_settings (key, value) VALUES ('elaya_chat_daily_cap_usd', 'null'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.elaya_settings (key, value) VALUES ('elaya_specialist_tiers', '{}'::jsonb) ON CONFLICT (key) DO NOTHING;

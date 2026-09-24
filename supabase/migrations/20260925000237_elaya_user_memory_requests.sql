-- Migration 0237: Elaya's living memory of each user, and the improvement requests the team raises.
--
-- Why (2026-09-25, the founder): "a living memory of each user, a consolidated map of everything
-- Elaya learns about how that person wants things, so every answer goes through it first" — with no
-- cap. Until now a user had three style dropdowns, a 600-character note, and a hidden 900-character
-- blurb Elaya rewrote every fourth message (user_context.learned). That blurb could not tell a
-- personal preference ("don't write long") from a system fault ("the overdue count is wrong"), and it
-- forgot as it grew. Two tables replace it:
--
--   elaya_user_memory: one row per thing learned about ONE user (a rule, a preference, a correction
--   of how she should behave with them, a style, a fact, an interest), with the message it came from.
--   Written by the after-turn reader (lib/elaya/memory.ts) through the service role, and by the user
--   or an admin through the gated actions. Folded into every prompt for that user, in both brains.
--
--   elaya_improvement_requests: when a user says Elaya was wrong about the SYSTEM (wrong data, wrong
--   time frame, a tool she lacks, a wrong answer), the turn still answers the corrected question and
--   logs the request here through the raise_improvement_request tool. Admins review the queue on
--   /settings/elaya-requests and mark each fixed / declined / turned into a playbook; open ones are
--   folded into every prompt as known issues so she stops repeating them.
--
-- Rules honoured: RLS on both (7); the request ledger is append-only for users (8): a status change
-- is the admin action on the service role; authorization reads profiles via get_user_role() (9).

-- ── 1. The living memory ─────────────────────────────────────────────────────
CREATE TABLE public.elaya_user_memory (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('rule', 'preference', 'correction', 'style', 'fact', 'interest')),
  statement   text        NOT NULL CHECK (char_length(statement) BETWEEN 3 AND 400),
  evidence    text,                                    -- the user's words the entry rests on
  source      text        NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'self', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  retired_at  timestamptz,                             -- removed by the user / an admin / superseded; never deleted
  retired_by  uuid        REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.elaya_user_memory IS 'What Elaya has learned about how one user wants things: rules, preferences, corrections, style, facts, interests. Folded into every prompt for that user. Retired rows stay for the record.';
CREATE INDEX idx_elaya_user_memory_live ON public.elaya_user_memory (user_id, updated_at DESC) WHERE retired_at IS NULL;

ALTER TABLE public.elaya_user_memory ENABLE ROW LEVEL SECURITY;
-- The owner reads their own; admin and founder read everyone's. Every write is the service role's
-- (the reader, and the gated actions in actions/elaya-memory.ts).
CREATE POLICY elaya_user_memory_select ON public.elaya_user_memory
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.elaya_user_memory TO authenticated;
GRANT ALL ON public.elaya_user_memory TO service_role;

-- ── 2. The improvement requests ──────────────────────────────────────────────
CREATE TABLE public.elaya_improvement_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.profiles(id),
  conversation_id uuid        REFERENCES public.elaya_conversations(id),
  channel         text        NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp', 'mcp')),
  kind            text        NOT NULL CHECK (kind IN ('wrong_data', 'time_frame', 'missing_tool', 'wrong_answer', 'behaviour', 'other')),
  question        text,                                -- what the user had asked
  answer          text,                                -- what Elaya answered
  correction      text        NOT NULL CHECK (char_length(correction) BETWEEN 3 AND 2000),
  diagnosis       text,                                -- Elaya's own one-line guess at the cause
  status          text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'declined', 'playbook')),
  admin_note      text,                                -- what was done, in the admin's words (folded into the prompt while open or fixed)
  resolved_by     uuid        REFERENCES public.profiles(id),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.elaya_improvement_requests IS 'A user told Elaya she was wrong about the system (data, time frame, a missing tool, a wrong answer). Raised in the turn, reviewed by admins on /settings/elaya-requests; open ones are folded into the prompt as known issues.';
CREATE INDEX idx_elaya_improvement_requests_status ON public.elaya_improvement_requests (status, created_at DESC);

ALTER TABLE public.elaya_improvement_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY elaya_improvement_requests_select ON public.elaya_improvement_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.elaya_improvement_requests TO authenticated;
GRANT ALL ON public.elaya_improvement_requests TO service_role;

NOTIFY pgrst, 'reload schema';

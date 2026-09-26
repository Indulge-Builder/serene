-- 0245 — Hands: Elaya's second WhatsApp number and the thread on a ticket
-- (docs/architecture/hands-plan.md, step 1: Layers A and C). Written 2026-09-26.
--
-- What this is: a separate schema for a SEPARATE WhatsApp number, linked through its own Baileys
-- process (connector-hands/), that is allowed to type. It talks only to the numbers on its
-- allowlist (Instinct today). The Sia watcher (schema sia, wag_*) is untouched: different number,
-- different process, different session rows, read only by law.
--
-- Contracts carried over from the watcher (0169):
--   RAW FIRST      every inbound Baileys event lands in hands.raw_events before parsing
--   IDEMPOTENT     messages upsert on (jid, wa_message_id)
--   SERVICE ONLY   every table: RLS enabled, no policies; the connector and Serene's admin client
--                  write; the CALLER gates (canAccessMember on the thread's ticket)
--   QUEUE, NOT DOOR  Serene never pushes into the connector; it writes hands.outbox rows and the
--                  connector polls them. The connector is the only process holding the session.
--
-- vendors.kind (Layer B): a vendor is a person or company we call, or an AGENT we message (Instinct).
-- Both are ranked by the one ranker; the kind only tells the ticket page which surface opens.

CREATE SCHEMA IF NOT EXISTS hands;
GRANT USAGE ON SCHEMA hands TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. The connector's own session and heartbeat (the 0174 / 0175 shapes, its own rows)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE hands.auth_state (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hands.auth_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE hands.auth_state IS
  'The hands connector''s Baileys session (creds + signal keys), the wag_auth_state shape on its own rows. Never shared with the watcher. Service-role only.';

CREATE TABLE hands.connector_status (
  id          smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  beat_at     timestamptz NOT NULL DEFAULT now(),
  state       text        NOT NULL DEFAULT 'connecting'
              CHECK (state IN ('pairing', 'connecting', 'connected', 'logged_out')),
  connected   boolean     NOT NULL DEFAULT false,
  state_since timestamptz NOT NULL DEFAULT now(),
  account_jid text,
  qr          text,
  qr_at       timestamptz
);
ALTER TABLE hands.connector_status ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE hands.connector_status IS
  'One row: the hands connector''s heartbeat and pairing QR (the wag_watcher_status shape). Liveness = beat_at freshness. Service-role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Who the hands number may talk to (fail closed: not on the list = never sent, never read)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE hands.allowed_contacts (
  jid        text        PRIMARY KEY,                       -- 1234567890@s.whatsapp.net
  label      text        NOT NULL,                          -- "Instinct"
  vendor_id  uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hands.allowed_contacts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE hands.allowed_contacts IS
  'The only WhatsApp numbers the hands connector will send to or file messages from. An agent vendor (vendors.kind = agent) points here through vendor_id. Service-role only; edited on /settings/hands.';

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Threads: one conversation with one contact, for one ticket (or the free Talk tab)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE hands.threads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jid              text        NOT NULL REFERENCES hands.allowed_contacts(jid),
  kind             text        NOT NULL CHECK (kind IN ('ticket', 'talk')),
  ticket_id        uuid,                                    -- soft: sia.tickets is partition-free but lives in another schema; the core checks it
  vendor_id        uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
  queendom_id      uuid        REFERENCES sia.queendoms(id) ON DELETE SET NULL,   -- copied from the ticket at open: the scope readers filter on it
  status           text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  last_message_at  timestamptz,
  last_direction   text        CHECK (last_direction IN ('in', 'out')),
  last_preview     text
);
-- One live ticket thread per ticket; the Talk tab may hold one open thread per contact.
CREATE UNIQUE INDEX idx_hands_threads_one_open_per_ticket ON hands.threads (ticket_id) WHERE ticket_id IS NOT NULL AND status = 'open';
CREATE UNIQUE INDEX idx_hands_threads_one_open_talk       ON hands.threads (jid) WHERE kind = 'talk' AND status = 'open';
CREATE INDEX idx_hands_threads_queendom_recent ON hands.threads (queendom_id, last_message_at DESC);
ALTER TABLE hands.threads ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE hands.threads IS
  'One conversation the hands number holds with one allowed contact: for a ticket (the job) or free (the Talk tab). queendom_id is copied from the ticket so a seated viewer sees only their queendom''s jobs. Service-role only; the caller gates.';

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Raw first, then messages
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE hands.raw_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  event_type  text        NOT NULL,
  payload     jsonb       NOT NULL
);
CREATE INDEX idx_hands_raw_events_type ON hands.raw_events (event_type, received_at DESC);
ALTER TABLE hands.raw_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE hands.raw_events IS 'The black-box recorder for the hands number: every Baileys event untouched, before parsing. Append-only.';

CREATE TABLE hands.messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid        REFERENCES hands.threads(id) ON DELETE SET NULL,   -- null until the connector can attach it (an inbound before any thread)
  jid            text        NOT NULL,
  wa_message_id  text        NOT NULL,
  direction      text        NOT NULL CHECK (direction IN ('in', 'out')),
  kind           text        NOT NULL CHECK (kind IN ('text', 'image', 'document', 'audio', 'video', 'other')),
  text           text,
  media_path     text,                                     -- storage path once copied (a QR image is one of these)
  media_mime     text,
  wa_timestamp   timestamptz NOT NULL,
  -- The reply frame the rulebook asks Instinct for: DONE / NEED / OPTIONS / FAILED / WAITING, read
  -- from the first word by the connector; null when the line does not start with one (a human reads it).
  frame          text        CHECK (frame IN ('done', 'need', 'options', 'failed', 'waiting')),
  -- A payment ask: the QR message plus what was read from Instinct's own line. paid_* land when a
  -- person scans it (the hands_payment ticket event is the ledger; this is the mirror on the message).
  payment        jsonb,                                    -- { amount_inr, payee, expires_at, paid_at, paid_by, paid_amount_inr }
  outbox_id      uuid,                                     -- the outbox row this outbound came from
  raw            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jid, wa_message_id)
);
CREATE INDEX idx_hands_messages_thread_time ON hands.messages (thread_id, wa_timestamp ASC);
ALTER TABLE hands.messages ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE hands.messages IS
  'Every message on the hands number, both directions, idempotent on (jid, wa_message_id). frame = the first word of Instinct''s reply when it follows the rulebook. payment = a QR ask and its settlement. Service-role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- E. The outbox: the ONLY way a message leaves the hands number
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE hands.outbox (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid        NOT NULL REFERENCES hands.threads(id) ON DELETE CASCADE,
  jid            text        NOT NULL,
  text           text        NOT NULL,
  -- who asked: a person (the genie who tapped Approve or typed), or Elaya at a trust level above L0
  requested_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  source         text        NOT NULL CHECK (source IN ('human', 'elaya')),
  -- the disclosure record shown to the approver: what was sent from the brief and what was held back
  disclosure     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status         text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'refused')),
  requested_at   timestamptz NOT NULL DEFAULT now(),
  attempted_at   timestamptz,
  sent_at        timestamptz,
  wa_message_id  text,
  error          text
);
CREATE INDEX idx_hands_outbox_queued ON hands.outbox (requested_at) WHERE status = 'queued';
ALTER TABLE hands.outbox ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE hands.outbox IS
  'Serene writes a row; the connector polls, re-checks the allowlist, sends, and marks sent / failed / refused (the only UPDATE, by the connector). Never deleted. Service-role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- F. Grants + PostgREST exposure (the 0193 posture)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT ALL ON ALL TABLES    IN SCHEMA hands TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA hands TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hands GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA hands GRANT ALL ON SEQUENCES TO service_role;

ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, sia, freshdesk, gia, member, hands';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- G. Layer B: a vendor is a human company or an agent we message (constants/vendors.ts VENDOR_KINDS)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'human';
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_kind_check;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_kind_check CHECK (kind IN ('human', 'agent'));
COMMENT ON COLUMN public.vendors.kind IS
  'human = a company or person we call or email (every vendor until 0245); agent = an AI agent we message on WhatsApp through the hands number (Instinct). Ranked by the one ranker like any other vendor; the ticket page opens the hands thread for an agent.';

-- ─────────────────────────────────────────────────────────────────────────────
-- H. The files the agent sends (a QR, a screenshot): private bucket, admin-client signed urls only
-- (the freshdesk-attachments 0197 posture). The connector uploads; the page signs.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('hands-media', 'hands-media', false)
ON CONFLICT (id) DO NOTHING;

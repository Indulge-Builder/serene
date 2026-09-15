-- Migration 0194: M0 of the client-ticket plan — the queendoms, the Sia roles, and the
-- seven stores of the client twin (client-ticket-plan.md sections 5 and 7.0).
--
-- What this creates, and the rule of each piece:
--   sia.queendoms            the org unit (queen > bishop > genies + one joker), 3 rows seeded
--   profiles.queendom_id     + profiles.sia_role (queen|bishop|genie|joker)
--   clients                  + queendom_id / tier / app_member_id / consent; SELECT+INSERT+UPDATE
--                            widened from admin-only to "the whole queendom" (decided 2026-09-15)
--   client_people            the humans under a membership (a couple = one client, two people)
--   client_facts             STORE 2: typed facts, APPEND ONLY, evidence + confidence + supersede
--   client_relations         STORE 3: the relationship map (edges), derived, service-role writes
--   client_events            STORE 4: the timeline, partitioned by month, derived, service-role
--   client_documents/chunks  STORE 5: prose + masked chunks + embeddings (vector(1024), HNSW)
--   client_snapshot          STORE 6: the twin's face, rebuilt, versioned
--   client_health_policy     STORE 7: delta + half-life per signal (rows, not code)
--   client_health_events     STORE 7: the score ledger, APPEND ONLY
--   client_anticipations     STORE 7: the "right time" queue
--   client_access_log        every card open, APPEND ONLY (the DPDP audit)
--   sia.extraction_runs      every model run over client data (law 6)
--
-- Access: one predicate, client_visible(client_id) = admin/founder OR the client's queendom is
-- the caller's queendom (get_user_queendom(), read from profiles — Rule 09). Truth ledgers carry
-- no UPDATE/DELETE policy (A-11). Derived stores are service-role writes only. Chunks have no
-- user policy at all (embeddings never leave the worker).
--
-- Embeddings: vector(1024) via the pgvector already installed (0110); halfvec is a later
-- optimisation if size ever matters. Dimension pinned to Jina v4 at 1024 (plan 5.8).

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Queendoms + the Sia roles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE sia.queendoms (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL UNIQUE,      -- "Anishqa Queendom"
  slug                text        NOT NULL UNIQUE,      -- anishqa
  freshdesk_group_id  bigint      UNIQUE,               -- joins the mirror's history
  queen_id            uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  bishop_id           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  joker_id            uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER queendoms_updated_at BEFORE UPDATE ON sia.queendoms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO sia.queendoms (name, slug, freshdesk_group_id) VALUES
  ('Anishqa Queendom',    'anishqa',    1070000391257),
  ('Ananyshree Queendom', 'ananyshree', 1070000391220),
  ('Sanika Queendom',     'sanika',     1070000391947);

-- The sia schema opens to signed-in users for exactly the tables that get a grant; the
-- wag_ archive keeps its service-role-only grants (0172) untouched.
GRANT USAGE ON SCHEMA sia TO authenticated;
GRANT SELECT ON sia.queendoms TO authenticated;
ALTER TABLE sia.queendoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY queendoms_select ON sia.queendoms FOR SELECT TO authenticated USING (true);
-- Writes: service role only (the roster script, the admin actions).

ALTER TABLE public.profiles
  ADD COLUMN queendom_id uuid REFERENCES sia.queendoms(id) ON DELETE SET NULL,
  ADD COLUMN sia_role    text CHECK (sia_role IN ('queen', 'bishop', 'genie', 'joker'));
CREATE INDEX idx_profiles_queendom ON public.profiles (queendom_id) WHERE queendom_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_user_queendom()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT queendom_id FROM profiles WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. The spine gains its join keys; access widens to the queendom
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN queendom_id   uuid  REFERENCES sia.queendoms(id) ON DELETE SET NULL,
  ADD COLUMN tier          text,                        -- premium | celebrity | genie | monthly_trial | … (vocabulary in constants)
  ADD COLUMN app_member_id text  UNIQUE,                -- the member app's id
  ADD COLUMN consent       jsonb NOT NULL DEFAULT '{}'::jsonb;  -- DPDP: {recorded_at, channel, version, usage_tracking}
CREATE INDEX idx_clients_queendom ON public.clients (queendom_id, membership_status);
CREATE INDEX idx_clients_tier ON public.clients (tier);

-- THE access predicate for everything hanging off a client.
CREATE OR REPLACE FUNCTION public.can_access_client_queendom(p_queendom uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT get_user_role() IN ('admin', 'founder')
      OR (p_queendom IS NOT NULL AND p_queendom = get_user_queendom());
$$;

CREATE OR REPLACE FUNCTION public.client_visible(p_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = p_client_id AND can_access_client_queendom(c.queendom_id)
  );
$$;

DROP POLICY IF EXISTS clients_select_admin ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (can_access_client_queendom(queendom_id));
-- Decided 2026-09-15: edit access = view access (the whole queendom, admin, founder).
CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (can_access_client_queendom(queendom_id));
CREATE POLICY clients_update ON public.clients
  FOR UPDATE TO authenticated
  USING (can_access_client_queendom(queendom_id))
  WITH CHECK (can_access_client_queendom(queendom_id));
-- No DELETE policy: a client record is never deleted by a user (expired ones stay).

-- ─────────────────────────────────────────────────────────────────────────────
-- C. The people under a membership
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_people (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  relation     text        NOT NULL CHECK (relation IN ('primary', 'spouse', 'partner', 'child', 'parent', 'sibling', 'staff', 'other')),
  phone_e164   text,
  email        text,
  can_request  boolean     NOT NULL DEFAULT true,   -- may this person raise requests in the group
  note         text,
  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_people_client ON public.client_people (client_id);
CREATE INDEX idx_client_people_phone ON public.client_people (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE TRIGGER client_people_updated_at BEFORE UPDATE ON public.client_people
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
ALTER TABLE public.client_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_people_select ON public.client_people FOR SELECT TO authenticated USING (client_visible(client_id));
CREATE POLICY client_people_insert ON public.client_people FOR INSERT TO authenticated WITH CHECK (client_visible(client_id));
CREATE POLICY client_people_update ON public.client_people FOR UPDATE TO authenticated USING (client_visible(client_id)) WITH CHECK (client_visible(client_id));
CREATE POLICY client_people_delete ON public.client_people FOR DELETE TO authenticated USING (client_visible(client_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- D. STORE 2 — client_facts (truth, append only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_facts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  facet          text        NOT NULL CHECK (facet IN (
                   'identity', 'address', 'family', 'dietary', 'preference', 'interest',
                   'occasion', 'travel', 'budget_signal', 'contact_rule', 'note')),
  key            text        NOT NULL DEFAULT '',     -- sub name inside the facet; '' for a bare note
  value          text        NOT NULL,                -- what a human would say
  value_json     jsonb,                               -- the structured form when there is one
  polarity       text        NOT NULL DEFAULT 'neutral' CHECK (polarity IN ('likes', 'dislikes', 'neutral')),
  source         text        NOT NULL CHECK (source IN (
                   'agent_note', 'typeform', 'atlas', 'freshdesk_contact', 'freshdesk_ticket',
                   'whatsapp_group', 'ticket', 'app_taste', 'app_behaviour', 'import')),
  evidence       jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- pointers: message triple, ticket id, note id, app event id
  confidence     numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
  observed_at    timestamptz NOT NULL DEFAULT now(),         -- when it was true, from the source's clock
  valid_until    timestamptz,                                -- a fact with a natural expiry
  superseded_by  uuid        REFERENCES public.client_facts(id) ON DELETE SET NULL,
  run_id         uuid,                                       -- sia.extraction_runs for model facts (soft)
  created_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_facts_client_facet ON public.client_facts (client_id, facet, key, observed_at DESC);
CREATE INDEX idx_client_facts_current ON public.client_facts (client_id, facet) WHERE superseded_by IS NULL;
CREATE INDEX idx_client_facts_run ON public.client_facts (run_id) WHERE run_id IS NOT NULL;
ALTER TABLE public.client_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_facts_select ON public.client_facts FOR SELECT TO authenticated USING (client_visible(client_id));
-- A human fact: insert only, always by the signed-in user, confidence 1.0, a human source.
CREATE POLICY client_facts_insert_human ON public.client_facts
  FOR INSERT TO authenticated
  WITH CHECK (client_visible(client_id) AND created_by = auth.uid() AND source = 'agent_note' AND run_id IS NULL);
-- No UPDATE / DELETE policies. superseded_by is set by the service-role core (a correction is a
-- new row that supersedes the old; the old row stays).
COMMENT ON TABLE public.client_facts IS
  'STORE 2 of the client twin: typed facts, append only, evidence + confidence + observed_at + '
  'superseded_by. Never UPDATE a value; a correction is a new row. Vocabulary: constants/client-facets.ts.';

-- ─────────────────────────────────────────────────────────────────────────────
-- E. STORE 3 — client_relations (derived edges)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_relations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_kind     text        NOT NULL CHECK (entity_kind IN ('person', 'vendor', 'place', 'venue', 'brand', 'interest', 'client')),
  entity_id       text        NOT NULL,       -- client_people.id, vendors.id, a place key, a brand key, another clients.id
  entity_label    text        NOT NULL,
  relation        text        NOT NULL,       -- spouse, child, staff, uses, prefers, avoids, visits, lives_in, travels_to, knows, collects, follows
  strength        numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (strength >= 0 AND strength <= 1),
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  evidence_count  integer     NOT NULL DEFAULT 1,
  evidence        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, entity_kind, entity_id, relation)
);
CREATE INDEX idx_client_relations_client ON public.client_relations (client_id, strength DESC);
CREATE INDEX idx_client_relations_entity ON public.client_relations (entity_kind, entity_id);
CREATE TRIGGER client_relations_updated_at BEFORE UPDATE ON public.client_relations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
ALTER TABLE public.client_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_relations_select ON public.client_relations FOR SELECT TO authenticated USING (client_visible(client_id));
-- Writes: service role (the merger). Derived: rebuilt from facts and events.

-- ─────────────────────────────────────────────────────────────────────────────
-- F. STORE 4 — client_events (the timeline; partitioned by month; derived)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_events (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  client_id     uuid        NOT NULL,           -- soft (no FK onto a partitioned table's children is needed; the client cascade is a job)
  occurred_at   timestamptz NOT NULL,
  kind          text        NOT NULL,           -- message_in | message_out | ticket_created | ticket_status | ticket_resolved | note_added |
                                                -- app_view | app_save | app_wish | app_taste | location | payment | invoice | renewal | call | fact_added | health_signal
  source        text        NOT NULL,           -- whatsapp_group | freshdesk | ticket | app | zoho | serene | atlas
  source_ref    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  actor         text,                           -- client | staff:<profile id> | system | model
  summary       text        NOT NULL DEFAULT '',
  tone          text        CHECK (tone IN ('praise', 'neutral', 'frustrated', 'angry')),
  weight        numeric(4,3) NOT NULL DEFAULT 0.100,
  expires_at    timestamptz,                    -- app behaviour rows: 180 days (the app's own promise)
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX idx_client_events_client_time ON public.client_events (client_id, occurred_at DESC);
CREATE INDEX idx_client_events_kind ON public.client_events (kind, occurred_at DESC);
CREATE INDEX idx_client_events_expires ON public.client_events (expires_at) WHERE expires_at IS NOT NULL;
ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_events_select ON public.client_events FOR SELECT TO authenticated USING (client_visible(client_id));
-- Writes: service role (the projector).

-- Monthly partitions from the start of the Freshdesk history (2024-01) through 2027-03, plus a
-- DEFAULT partition so an insert can never fail on a missing month (the 0169 rule).
CREATE TABLE public.client_events_default PARTITION OF public.client_events DEFAULT;
DO $$
DECLARE
  m date := date '2024-01-01';
BEGIN
  WHILE m < date '2027-04-01' LOOP
    EXECUTE format(
      'CREATE TABLE public.client_events_%s PARTITION OF public.client_events FOR VALUES FROM (%L) TO (%L)',
      to_char(m, 'YYYY_MM'), m, m + interval '1 month');
    m := m + interval '1 month';
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. STORE 5 — client_documents + client_chunks (prose and meaning)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind          text        NOT NULL CHECK (kind IN ('chat_window', 'ticket_thread', 'ticket_note', 'agent_note', 'digest', 'narrative', 'import')),
  source        text        NOT NULL,
  source_ref    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  title         text,
  text          text        NOT NULL,           -- Zone 1: unmasked
  from_at       timestamptz,
  to_at         timestamptz,
  run_id        uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_documents_client ON public.client_documents (client_id, to_at DESC);
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_documents_select ON public.client_documents FOR SELECT TO authenticated USING (client_visible(client_id));

CREATE TABLE public.client_chunks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id    uuid        NOT NULL REFERENCES public.client_documents(id) ON DELETE CASCADE,
  chunk_index    integer     NOT NULL DEFAULT 0,
  kind           text        NOT NULL,
  observed_at    timestamptz,
  masked_text    text        NOT NULL,          -- what left for the embedding API (Zone 2)
  tsv            tsvector    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(masked_text, ''))) STORED,
  embedding      extensions.vector(1024),       -- Jina v4 @ 1024; NULL until embedded
  model_version  text,
  embedded_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX idx_client_chunks_client_time ON public.client_chunks (client_id, observed_at DESC);
CREATE INDEX idx_client_chunks_tsv ON public.client_chunks USING gin (tsv);
CREATE INDEX idx_client_chunks_embedding ON public.client_chunks
  USING hnsw (embedding extensions.vector_cosine_ops) WITH (m = 16, ef_construction = 128);
CREATE INDEX idx_client_chunks_unembedded ON public.client_chunks (created_at) WHERE embedding IS NULL;
ALTER TABLE public.client_chunks ENABLE ROW LEVEL SECURITY;
-- ZERO user policies on chunks: only the worker and the tools read them (plan 5.8).

-- ─────────────────────────────────────────────────────────────────────────────
-- H. STORE 6 — client_snapshot (the twin's face)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_snapshot (
  client_id   uuid        PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  version     integer     NOT NULL DEFAULT 1,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  built_at    timestamptz NOT NULL DEFAULT now(),
  run_id      uuid
);
ALTER TABLE public.client_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_snapshot_select ON public.client_snapshot FOR SELECT TO authenticated USING (client_visible(client_id));
-- Writes: service role (the profiler). Rebuildable; never edited by hand.

-- ─────────────────────────────────────────────────────────────────────────────
-- I. STORE 7 — health policy, health events, anticipations
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_health_policy (
  signal          text        PRIMARY KEY,
  label           text        NOT NULL,
  delta           numeric(5,2) NOT NULL,
  half_life_days  integer     NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.client_health_policy (signal, label, delta, half_life_days) VALUES
  ('complaint',            'Complaint',                    -12, 60),
  ('praise',               'Praise',                        +5, 90),
  ('frustration_tone',     'Frustrated tone',               -4, 30),
  ('sla_breach',           'SLA breached',                  -6, 30),
  ('slow_first_response',  'Slow first response',           -3, 30),
  ('reopened',             'Ticket reopened',               -5, 45),
  ('resolved_on_time',     'Resolved on time',              +2, 60),
  ('resolved_late',        'Resolved late',                 -3, 45),
  ('silence_from_us',      'Left waiting',                  -4, 30),
  ('client_went_quiet',    'Client went quiet',             -2, 60),
  ('renewed',              'Renewed',                       +8, 180),
  ('downgraded',           'Downgraded',                    -8, 180),
  ('escalated_to_founder', 'Escalated to the founder',     -10, 90),
  ('delight_delivered',    'Delight delivered',             +6, 90),
  ('manual_adjust',        'Manual adjustment',              0, 90);
ALTER TABLE public.client_health_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_health_policy_select ON public.client_health_policy FOR SELECT TO authenticated USING (true);
-- Edited from the Sia settings page through the admin client (admin/founder actions).

CREATE TABLE public.client_health_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ticket_ref   jsonb,                                   -- {sia_ticket_id} or {freshdesk_id}
  signal       text        NOT NULL REFERENCES public.client_health_policy(signal),
  delta        numeric(5,2) NOT NULL,                   -- copied from the policy at write time, so a policy change never rewrites history
  evidence     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  observed_at  timestamptz NOT NULL DEFAULT now(),
  run_id       uuid,
  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_health_events_client ON public.client_health_events (client_id, observed_at DESC);
ALTER TABLE public.client_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_health_events_select ON public.client_health_events FOR SELECT TO authenticated USING (client_visible(client_id));
-- Manual adjustments by a human: insert only, own uid, the manual signal.
CREATE POLICY client_health_events_insert_manual ON public.client_health_events
  FOR INSERT TO authenticated
  WITH CHECK (client_visible(client_id) AND created_by = auth.uid() AND signal = 'manual_adjust' AND run_id IS NULL);
-- No UPDATE / DELETE (append only).

CREATE TABLE public.client_anticipations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind             text        NOT NULL CHECK (kind IN ('occasion', 'renewal', 'pattern', 'follow_up', 'trip', 'silence')),
  title            text        NOT NULL,
  due_at           timestamptz NOT NULL,
  suggested_action text,
  evidence         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'surfaced', 'acted', 'dismissed')),
  resolved_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at      timestamptz,
  run_id           uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_anticipations_due ON public.client_anticipations (due_at) WHERE status IN ('pending', 'surfaced');
CREATE INDEX idx_client_anticipations_client ON public.client_anticipations (client_id, due_at);
CREATE TRIGGER client_anticipations_updated_at BEFORE UPDATE ON public.client_anticipations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
ALTER TABLE public.client_anticipations ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_anticipations_select ON public.client_anticipations FOR SELECT TO authenticated USING (client_visible(client_id));
-- Status moves (acted / dismissed) go through a server action on the admin client.

-- ─────────────────────────────────────────────────────────────────────────────
-- J. The audit trail (DPDP) and the model-run ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.client_access_log (
  id          bigserial   PRIMARY KEY,
  client_id   uuid        NOT NULL,          -- soft: the log outlives the record
  actor_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  surface     text        NOT NULL,          -- clients_page | ticket_help | elaya_tool | sia_panel | export
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_access_log_client ON public.client_access_log (client_id, created_at DESC);
CREATE INDEX idx_client_access_log_actor ON public.client_access_log (actor_id, created_at DESC);
ALTER TABLE public.client_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_access_log_insert_own ON public.client_access_log
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());
CREATE POLICY client_access_log_select_admin ON public.client_access_log
  FOR SELECT TO authenticated USING (get_user_role() IN ('admin', 'founder'));
-- No UPDATE / DELETE.

CREATE TABLE sia.extraction_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text        NOT NULL,          -- gate | extract | ticket_creator | narrative | digest | embed | seed
  model           text,
  prompt_version  text,
  input_ref       jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- the window / ticket / document the run read
  client_id       uuid,
  tokens_in       integer,
  tokens_out      integer,
  cost_usd        numeric(10,5),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  ok              boolean,
  error           text,
  output          jsonb       NOT NULL DEFAULT '{}'::jsonb   -- the masked output as returned, for replay and audit
);
CREATE INDEX idx_extraction_runs_client ON sia.extraction_runs (client_id, started_at DESC);
CREATE INDEX idx_extraction_runs_kind ON sia.extraction_runs (kind, started_at DESC);
ALTER TABLE sia.extraction_runs ENABLE ROW LEVEL SECURITY;
-- Service role only (the 0172 posture for sia): no grants to authenticated.
GRANT ALL ON sia.extraction_runs TO service_role;
GRANT ALL ON sia.queendoms TO service_role;

COMMENT ON SCHEMA sia IS
  'The Sia module: the WhatsApp-group archive (wag_ family, service-role only), the queendoms '
  '(readable by signed-in users), the model-run ledger, and — from T1 — the ticketing tables.';

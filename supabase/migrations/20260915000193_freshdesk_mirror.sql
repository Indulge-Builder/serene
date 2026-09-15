-- Migration 0193: the `freshdesk` schema — a faithful mirror of the Freshdesk account.
--
-- Why a mirror, and why its own schema: Freshdesk is the concierge team's ticket system
-- today and stays so until Serene's own ticketing (the Sia module, client-ticket-plan.md)
-- replaces it. Until then Serene learns from it: how a ticket moves, how long each stage
-- takes, which WhatsApp message became which ticket. That needs the data HERE, joinable to
-- public.clients and sia.wag_messages, with a change history Freshdesk itself does not
-- expose. The schema is its own unit (the 0172 `sia` pattern): same database, one backup,
-- joins for free, and a clean table list. When the Sia ticketing schema lands, this mirror
-- is read-only history next to it, never merged into it.
--
-- Three laws this schema encodes:
--   1. MIRROR, NEVER EDIT — every row is what Freshdesk said, plus `raw` (the untouched
--      API object). Serene never writes business fields here; a sync overwrites them.
--   2. CHANGES ARE APPEND-ONLY — `ticket_changes` records every field flip the sync
--      observes (status, agent, group, priority, type, category, custom fields …). This is
--      the movement history the Sia ticketing design learns from. No UPDATE, no DELETE.
--   3. INSERTS NEVER FAIL ON VOCABULARY — status / priority / source are plain integers
--      with labels resolved from `ticket_fields`; no CHECK on any Freshdesk value, because
--      Freshdesk adds statuses and fields without telling us.
--
-- Rate reality (measured 2026-09-15): the account allows 50 API calls a minute, shared
-- with the member app (which reads a member's tickets live by phone). The sync is budgeted
-- (`sync_runs` records every call count and the remaining allowance) and never takes the
-- last calls of a window.
--
-- Access: RLS enabled on every table with ZERO user policies. service_role only: the sync
-- (Trigger.dev + the webhook route) writes, the /freshdesk page reads on the admin client
-- behind an admin/founder page gate (Q-13). Broader read access arrives with the Sia UI as
-- its own migration.

CREATE SCHEMA IF NOT EXISTS freshdesk;
GRANT USAGE ON SCHEMA freshdesk TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reference data (small, refreshed on a schedule)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE freshdesk.groups (
  id               bigint      PRIMARY KEY,           -- Freshdesk's own id
  name             text        NOT NULL,
  description      text,
  business_hour_id bigint,
  group_type       text,
  raw              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fd_created_at    timestamptz,
  fd_updated_at    timestamptz,
  synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE freshdesk.agents (
  id               bigint      PRIMARY KEY,
  name             text        NOT NULL,
  email            text,
  job_title        text,
  agent_type       text,                              -- support_agent | …
  active           boolean     NOT NULL DEFAULT true, -- contact.active
  deactivated      boolean     NOT NULL DEFAULT false,
  available        boolean     NOT NULL DEFAULT false,
  last_active_at   timestamptz,
  -- Soft link to the Serene user this agent is (resolved by email at sync time;
  -- NULL until the concierge staff exist as profiles).
  profile_id       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  raw              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fd_created_at    timestamptz,
  fd_updated_at    timestamptz,
  synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE freshdesk.ticket_fields (
  id                  bigint      PRIMARY KEY,
  name                text        NOT NULL,           -- status, priority, cf_category_of_request …
  label               text        NOT NULL,
  field_type          text        NOT NULL,           -- default_status, custom_dropdown, nested_field …
  is_default          boolean     NOT NULL DEFAULT false,
  required_for_agents boolean     NOT NULL DEFAULT false,
  choices             jsonb,                          -- the choice tree (statuses carry stop_sla_timer)
  dependent_fields    jsonb,                          -- nested_field levels 2 and 3
  raw                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
  synced_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_freshdesk_ticket_fields_name ON freshdesk.ticket_fields (name);

CREATE TABLE freshdesk.sla_policies (
  id             bigint      PRIMARY KEY,
  name           text        NOT NULL,
  active         boolean     NOT NULL DEFAULT true,
  is_default     boolean     NOT NULL DEFAULT false,
  position       integer,
  sla_target     jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- per priority: respond_within / resolve_within seconds
  applicable_to  jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- group_ids + ticket_types
  escalation     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  raw            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fd_created_at  timestamptz,
  fd_updated_at  timestamptz,
  synced_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Contacts (the requesters — one per client human or per concierge-group contact)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE freshdesk.contacts (
  id             bigint      PRIMARY KEY,
  name           text        NOT NULL,
  email          text,
  phone          text,                                -- as Freshdesk holds it
  mobile         text,
  phone_e164     text,                                -- our normalisation of mobile ?? phone; NULL when unparseable
  active         boolean     NOT NULL DEFAULT true,
  company_id     bigint,
  category       text,                                -- custom_fields.category: Kingdom | Queendom
  custom_fields  jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- the 40 preference fields, whole
  tags           text[]      NOT NULL DEFAULT '{}',
  description    text,
  -- Soft link to the client spine, resolved at sync time by freshdesk_contact_id, then phone.
  client_id      uuid        REFERENCES public.clients(id) ON DELETE SET NULL,
  raw            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fd_created_at  timestamptz,
  fd_updated_at  timestamptz,
  synced_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_freshdesk_contacts_phone_e164 ON freshdesk.contacts (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX idx_freshdesk_contacts_client ON freshdesk.contacts (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_freshdesk_contacts_updated ON freshdesk.contacts (fd_updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tickets (the current state of every ticket, as Freshdesk last reported it)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE freshdesk.tickets (
  id                       bigint      PRIMARY KEY,   -- the Freshdesk ticket number (#55054)
  subject                  text        NOT NULL DEFAULT '',
  description_text         text,
  status                   integer     NOT NULL,      -- 2 Open … 9 Invoice Due, 9000 AI Agent; no CHECK (law 3)
  status_label             text,                      -- resolved from ticket_fields at sync time
  priority                 integer     NOT NULL,      -- 1 Low … 4 Urgent
  source                   integer,                   -- 3 Phone, 13 WhatsApp …
  ticket_type              text,                      -- "Travel - Flight" … (the SLA policies key on this)
  category                 text,                      -- custom_fields.cf_category_of_request (level 1)
  sub_category             text,                      -- custom_fields.cf_sub_category (level 2)
  classification           text,                      -- custom_fields.cf_classification (level 3)
  tags                     text[]      NOT NULL DEFAULT '{}',
  group_id                 bigint,                    -- the queendom (soft; groups can be deleted in Freshdesk)
  responder_id             bigint,                    -- the agent
  internal_group_id        bigint,
  internal_agent_id        bigint,
  requester_id             bigint     NOT NULL,       -- the contact (soft)
  company_id               bigint,
  product_id               bigint,
  requester_name           text,                      -- denormalised from include=requester so the list needs no join
  requester_phone_e164     text,
  client_id                uuid        REFERENCES public.clients(id) ON DELETE SET NULL,  -- via the contact
  due_by                   timestamptz,
  fr_due_by                timestamptz,
  is_escalated             boolean     NOT NULL DEFAULT false,
  fr_escalated             boolean     NOT NULL DEFAULT false,
  spam                     boolean     NOT NULL DEFAULT false,
  deleted                  boolean     NOT NULL DEFAULT false,  -- Freshdesk stops returning deleted tickets; a webhook flips this
  -- include=stats
  first_responded_at       timestamptz,
  agent_responded_at       timestamptz,
  requester_responded_at   timestamptz,
  status_updated_at        timestamptz,
  reopened_at              timestamptz,
  pending_since            timestamptz,
  resolved_at              timestamptz,
  closed_at                timestamptz,
  custom_fields            jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- every cf_* field, whole
  raw                      jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- the untouched API object (law 1)
  fd_created_at            timestamptz NOT NULL,
  fd_updated_at            timestamptz NOT NULL,
  first_synced_at          timestamptz NOT NULL DEFAULT now(),
  synced_at                timestamptz NOT NULL DEFAULT now(),
  conversations_synced_at  timestamptz,               -- NULL = the thread has never been pulled
  conversation_count       integer     NOT NULL DEFAULT 0
);
CREATE INDEX idx_freshdesk_tickets_updated   ON freshdesk.tickets (fd_updated_at DESC);
CREATE INDEX idx_freshdesk_tickets_created   ON freshdesk.tickets (fd_created_at DESC);
CREATE INDEX idx_freshdesk_tickets_status    ON freshdesk.tickets (status, fd_updated_at DESC);
CREATE INDEX idx_freshdesk_tickets_group     ON freshdesk.tickets (group_id, fd_created_at DESC);
CREATE INDEX idx_freshdesk_tickets_responder ON freshdesk.tickets (responder_id, fd_created_at DESC);
CREATE INDEX idx_freshdesk_tickets_requester ON freshdesk.tickets (requester_id);
CREATE INDEX idx_freshdesk_tickets_client    ON freshdesk.tickets (client_id, fd_created_at DESC) WHERE client_id IS NOT NULL;
CREATE INDEX idx_freshdesk_tickets_category  ON freshdesk.tickets (category);
-- The thread catch-up queue: tickets whose conversations are missing or stale.
CREATE INDEX idx_freshdesk_tickets_thread_stale ON freshdesk.tickets (fd_updated_at DESC)
  WHERE conversations_synced_at IS NULL OR conversations_synced_at < fd_updated_at;
-- List search: subject + requester, trigram. pg_trgm lives in the `extensions` schema on
-- Supabase, so the operator class is schema-qualified (the 0098 / 0187 pattern).
CREATE INDEX idx_freshdesk_tickets_subject_trgm ON freshdesk.tickets USING gin (subject extensions.gin_trgm_ops);
CREATE INDEX idx_freshdesk_tickets_requester_trgm ON freshdesk.tickets USING gin (requester_name extensions.gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- Conversations (the notes and replies on a ticket)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE freshdesk.conversations (
  id             bigint      PRIMARY KEY,
  ticket_id      bigint      NOT NULL REFERENCES freshdesk.tickets(id) ON DELETE CASCADE,
  user_id        bigint,                              -- agent id or contact id
  incoming       boolean     NOT NULL DEFAULT false,  -- true = from the requester
  private        boolean     NOT NULL DEFAULT false,  -- true = internal note
  source         integer,
  category       integer,
  body_text      text,
  body_html      text,
  from_email     text,
  to_emails      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  attachments    jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- name, content_type, size, attachment_url (expiring)
  raw            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  fd_created_at  timestamptz NOT NULL,
  fd_updated_at  timestamptz,
  synced_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_freshdesk_conversations_ticket ON freshdesk.conversations (ticket_id, fd_created_at ASC);
CREATE INDEX idx_freshdesk_conversations_body_fts ON freshdesk.conversations
  USING gin (to_tsvector('simple', coalesce(body_text, '')));

-- ─────────────────────────────────────────────────────────────────────────────
-- ticket_changes — the movement history (append-only, law 2)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE freshdesk.ticket_changes (
  id             bigserial   PRIMARY KEY,
  ticket_id      bigint      NOT NULL,                -- soft: a change outlives a CASCADE only if we ever purge
  field          text        NOT NULL,                -- status | priority | responder_id | group_id | ticket_type |
                                                      -- category | sub_category | subject | due_by | tags |
                                                      -- is_escalated | deleted | cf.<name>
  old_value      text,
  new_value      text,
  fd_updated_at  timestamptz,                         -- Freshdesk's updated_at on the row that carried the change
  observed_at    timestamptz NOT NULL DEFAULT now(),  -- when OUR sync saw it (resolution = the sync cadence)
  source         text        NOT NULL DEFAULT 'poll'  -- poll | webhook | backfill | manual
);
CREATE INDEX idx_freshdesk_ticket_changes_ticket ON freshdesk.ticket_changes (ticket_id, observed_at ASC);
CREATE INDEX idx_freshdesk_ticket_changes_observed ON freshdesk.ticket_changes (observed_at DESC);
CREATE INDEX idx_freshdesk_ticket_changes_field ON freshdesk.ticket_changes (field, observed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- webhook_events — the raw inbox from Freshdesk automations (append-only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE freshdesk.webhook_events (
  id             bigserial   PRIMARY KEY,
  event          text        NOT NULL,                -- ticket_created | ticket_updated | ticket_deleted | unknown
  ticket_id      bigint,
  payload        jsonb       NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,
  error          text
);
CREATE INDEX idx_freshdesk_webhook_events_received ON freshdesk.webhook_events (received_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- sync_state + sync_runs — the cursors and the audit of every sync step
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE freshdesk.sync_state (
  key         text        PRIMARY KEY,                -- poll | backfill | contacts | reference
  value       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE freshdesk.sync_runs (
  id                     bigserial   PRIMARY KEY,
  kind                   text        NOT NULL,        -- poll | backfill | threads | contacts | reference | webhook | manual
  started_at             timestamptz NOT NULL DEFAULT now(),
  finished_at            timestamptz,
  ok                     boolean,
  api_calls              integer     NOT NULL DEFAULT 0,
  rate_remaining         integer,                     -- X-RateLimit-Remaining after the last call
  tickets_seen           integer     NOT NULL DEFAULT 0,
  tickets_written        integer     NOT NULL DEFAULT 0,
  conversations_written  integer     NOT NULL DEFAULT 0,
  changes_written        integer     NOT NULL DEFAULT 0,
  error                  text,
  detail                 jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_freshdesk_sync_runs_started ON freshdesk.sync_runs (started_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Access
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE freshdesk.groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.agents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.ticket_fields  ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.sla_policies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.ticket_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.sync_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshdesk.sync_runs      ENABLE ROW LEVEL SECURITY;
-- No user policies on purpose: service_role only (the 0172 posture).

GRANT ALL ON ALL TABLES    IN SCHEMA freshdesk TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA freshdesk TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA freshdesk GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA freshdesk GRANT ALL ON SEQUENCES TO service_role;

-- Expose the schema on the REST path (idempotent; keeps sia). Same statement 0172 used.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, sia, freshdesk';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

COMMENT ON SCHEMA freshdesk IS
  'A faithful mirror of the Freshdesk account (tickets, threads, contacts, agents, groups, '
  'fields, SLA policies) plus the append-only ticket_changes movement history. Serene never '
  'edits business fields here; the sync overwrites them. service_role only; migration 0193.';
COMMENT ON TABLE freshdesk.ticket_changes IS
  'Append-only: one row per field change the sync observed on a ticket. The movement '
  'history the Sia ticketing design learns from. observed_at resolution = the sync cadence.';

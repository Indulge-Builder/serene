-- Migration 0195: T1 of the client-ticket plan — Sia's own ticketing (client-ticket-plan.md 7).
--
-- What this creates, and the rule of each piece:
--   sia.tickets                 the spine of the work: current state, updated ONLY through the
--                               two RPCs below (create_ticket / apply_ticket_change), which write
--                               the event in the same transaction
--   sia.ticket_events           the diary, APPEND ONLY, partitioned by month
--   sia.ticket_message_links    which WhatsApp messages belong to which ticket, APPEND ONLY,
--                               soft triple references (the archive law); also links the mirror
--   sia.ticket_sla_policies     first response / update cadence / silence / resolve targets per
--                               (queendom, category, sub_category, priority, tier), most specific
--                               wins; seeded from Freshdesk's numbers; edited in settings later
--   sia.genie_roster            shifts, capacity, specialities, leave — the picker's inputs
--   public.task_ticket_meta     sub-work = a tasks row linked to a ticket (the task_gia_meta pattern)
--   notification CHECKs         six new notification types, five new preference keys
--
-- Access: the ticketing tables are the first `sia` tables signed-in users read directly
-- (SELECT via can_access_client_queendom(queendom_id): the whole queendom, admin, founder).
-- No user WRITE policies anywhere: every write runs through the RPCs on the admin client from
-- the mutation core (the deals posture), so the state machine and the event diary can never be
-- bypassed. The two RPCs are Q-13 revoked tier (service_role only).
--
-- Status vocabulary lives in constants/tickets.ts; the CHECK here mirrors it. Freshdesk's nine
-- statuses map one-to-one (constants/tickets.ts TICKET_STATUSES). Priority is real: the SLA
-- due timestamps are computed by the core from the policy row on every create / status /
-- priority change; the sentinel (T2) evaluates them.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. tickets
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SEQUENCE sia.ticket_no_seq START 1;

CREATE TABLE sia.tickets (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no              text        NOT NULL UNIQUE DEFAULT ('T-' || lpad(nextval('sia.ticket_no_seq')::text, 6, '0')),
  client_id              uuid        NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  queendom_id            uuid        REFERENCES sia.queendoms(id) ON DELETE SET NULL,   -- copied from the client at creation
  origin                 text        NOT NULL CHECK (origin IN ('whatsapp_group', 'app', 'call', 'email', 'manual', 'freshdesk_import')),
  origin_ref             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  group_jid              text,
  category               text        NOT NULL,
  sub_category           text,
  item                   text,
  title                  text        NOT NULL,
  brief                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  checklist              jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{label, done_at, done_by}]
  priority               text        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  priority_approved_at   timestamptz,                                -- the bishop's approval; SLA clocks start here
  priority_approved_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                 text        NOT NULL DEFAULT 'open' CHECK (status IN (
                           'proposed', 'open', 'sourcing', 'awaiting_client', 'awaiting_vendor',
                           'in_delivery', 'payment_due', 'resolved', 'closed', 'dropped')),
  requested_for          timestamptz,
  first_response_due_at  timestamptz,
  next_update_due_at     timestamptz,
  resolve_due_at         timestamptz,
  first_responded_at     timestamptz,
  last_client_update_at  timestamptz,
  assignee_id            uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  bishop_id              uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  handoff_department     text,
  vendor_id              uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
  money                  jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {quote_inr, cost_inr, price_inr, currency, tax_mode, payment_status, zoho_ref, invoice_no}
  summary                text,
  created_by             uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_kind        text        NOT NULL DEFAULT 'human' CHECK (created_by_kind IN ('human', 'elaya', 'intake', 'import')),
  proposed_by_run_id     uuid,
  sentinel_state         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  next_wake_at           timestamptz,
  wake_reason            text,
  closed_at              timestamptz,
  resolution             text        CHECK (resolution IN ('delivered', 'cancelled_by_client', 'could_not_source', 'duplicate', 'not_a_request')),
  satisfaction           smallint    CHECK (satisfaction BETWEEN 1 AND 5),
  freshdesk_id           bigint,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sia_tickets_queendom_status ON sia.tickets (queendom_id, status, updated_at DESC);
CREATE INDEX idx_sia_tickets_client ON sia.tickets (client_id, created_at DESC);
CREATE INDEX idx_sia_tickets_assignee ON sia.tickets (assignee_id, status);
CREATE INDEX idx_sia_tickets_wake ON sia.tickets (next_wake_at) WHERE status NOT IN ('closed', 'dropped');
CREATE INDEX idx_sia_tickets_freshdesk ON sia.tickets (freshdesk_id) WHERE freshdesk_id IS NOT NULL;
CREATE INDEX idx_sia_tickets_title_trgm ON sia.tickets USING gin (title extensions.gin_trgm_ops);
CREATE TRIGGER sia_tickets_updated_at BEFORE UPDATE ON sia.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- B. ticket_events (append only, partitioned by month)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE sia.ticket_events (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  ticket_id    uuid        NOT NULL,                 -- soft (partition parent cannot be an FK target cleanly)
  client_id    uuid        NOT NULL,
  queendom_id  uuid,
  actor_kind   text        NOT NULL CHECK (actor_kind IN ('human', 'sentinel', 'intake', 'elaya', 'system', 'client')),
  actor_id     uuid,
  event_type   text        NOT NULL,                 -- constants/tickets.ts TICKET_EVENT_TYPES; no CHECK (the sentinel will invent kinds)
  body         text,
  meta         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  run_id       uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_sia_ticket_events_ticket ON sia.ticket_events (ticket_id, created_at ASC);
CREATE INDEX idx_sia_ticket_events_queendom ON sia.ticket_events (queendom_id, created_at DESC);
CREATE INDEX idx_sia_ticket_events_body_fts ON sia.ticket_events USING gin (to_tsvector('simple', coalesce(body, '')));
CREATE TABLE sia.ticket_events_default PARTITION OF sia.ticket_events DEFAULT;
DO $$
DECLARE m date := date '2026-09-01';
BEGIN
  WHILE m < date '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE sia.ticket_events_%s PARTITION OF sia.ticket_events FOR VALUES FROM (%L) TO (%L)',
                   to_char(m, 'YYYY_MM'), m, m + interval '1 month');
    m := m + interval '1 month';
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. ticket_message_links (append only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE sia.ticket_message_links (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      uuid        REFERENCES sia.tickets(id) ON DELETE CASCADE,   -- NULL when the link is to a mirrored ticket
  freshdesk_id   bigint,                                                    -- the mirror twin (learning programme 2.3)
  chat_jid       text        NOT NULL,
  wa_message_id  text        NOT NULL,
  sender_jid     text        NOT NULL,
  link_kind      text        NOT NULL CHECK (link_kind IN ('origin', 'update', 'client_reply', 'staff_reply', 'attachment')),
  confidence     numeric(3,2) NOT NULL DEFAULT 1.00,
  run_id         uuid,
  created_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (ticket_id IS NOT NULL OR freshdesk_id IS NOT NULL)
);
CREATE INDEX idx_sia_ticket_links_ticket ON sia.ticket_message_links (ticket_id);
CREATE INDEX idx_sia_ticket_links_message ON sia.ticket_message_links (chat_jid, wa_message_id);
CREATE INDEX idx_sia_ticket_links_freshdesk ON sia.ticket_message_links (freshdesk_id) WHERE freshdesk_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. SLA policies (rows, not code) and the genie roster
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE sia.ticket_sla_policies (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  queendom_id          uuid        REFERENCES sia.queendoms(id) ON DELETE CASCADE,   -- NULL = every queendom
  category             text,                                                       -- NULL = every category
  sub_category         text,
  priority             text        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),  -- NULL = every priority
  tier                 text,
  first_response_min   integer     NOT NULL,
  update_cadence_min   integer     NOT NULL,
  vendor_silence_min   integer     NOT NULL,
  client_silence_min   integer     NOT NULL,
  resolve_target_min   integer     NOT NULL,
  business_hours       boolean     NOT NULL DEFAULT true,
  escalation           jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{after_min, to: 'bishop'|'queen'|'founder'}]
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER sia_ticket_sla_policies_updated_at BEFORE UPDATE ON sia.ticket_sla_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
-- Seed: Freshdesk's numbers today (15 min respond, 8 business hours resolve; 48 h watches and bags),
-- with the update cadence and silences the plan proposed, per priority.
INSERT INTO sia.ticket_sla_policies (priority, first_response_min, update_cadence_min, vendor_silence_min, client_silence_min, resolve_target_min, escalation) VALUES
  ('low',    15, 1440, 240, 1440, 480, '[{"after_min":15,"to":"bishop"},{"after_min":60,"to":"queen"}]'),
  ('medium', 15,  720, 240, 1440, 480, '[{"after_min":15,"to":"bishop"},{"after_min":60,"to":"queen"}]'),
  ('high',   15,  240, 120,  720, 480, '[{"after_min":15,"to":"bishop"},{"after_min":60,"to":"queen"}]'),
  ('urgent', 15,  120,  60,  240, 480, '[{"after_min":10,"to":"bishop"},{"after_min":30,"to":"queen"},{"after_min":120,"to":"founder"}]');
INSERT INTO sia.ticket_sla_policies (category, sub_category, first_response_min, update_cadence_min, vendor_silence_min, client_silence_min, resolve_target_min) VALUES
  ('retail', 'watch', 15, 720, 240, 1440, 2880),
  ('retail', 'bag',   15, 720, 240, 1440, 2880);

CREATE TABLE sia.genie_roster (
  profile_id     uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  queendom_id    uuid        REFERENCES sia.queendoms(id) ON DELETE SET NULL,
  shifts         jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {mon:[["09:00","18:00"]], …} IST
  capacity       integer     NOT NULL DEFAULT 8,
  specialities   jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {travel: 0.8, dining: 0.5, …}
  languages      text[]      NOT NULL DEFAULT '{}',
  is_on_leave    boolean     NOT NULL DEFAULT false,
  leave_until    date,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER sia_genie_roster_updated_at BEFORE UPDATE ON sia.genie_roster
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- E. Sub-work: a task linked to a ticket (the task_gia_meta pattern)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.task_ticket_meta (
  task_id    uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
  ticket_id  uuid NOT NULL REFERENCES sia.tickets(id) ON DELETE CASCADE
);
CREATE INDEX idx_task_ticket_meta_ticket ON public.task_ticket_meta (ticket_id);
ALTER TABLE public.task_ticket_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_ticket_meta_select ON public.task_ticket_meta FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sia.tickets t WHERE t.id = ticket_id AND can_access_client_queendom(t.queendom_id)));

-- ─────────────────────────────────────────────────────────────────────────────
-- F. Access
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sia.tickets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.ticket_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.ticket_message_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.ticket_sla_policies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.genie_roster         ENABLE ROW LEVEL SECURITY;

CREATE POLICY sia_tickets_select ON sia.tickets FOR SELECT TO authenticated USING (can_access_client_queendom(queendom_id));
CREATE POLICY sia_ticket_events_select ON sia.ticket_events FOR SELECT TO authenticated USING (can_access_client_queendom(queendom_id));
CREATE POLICY sia_ticket_links_select ON sia.ticket_message_links FOR SELECT TO authenticated
  USING (ticket_id IS NULL OR EXISTS (SELECT 1 FROM sia.tickets t WHERE t.id = ticket_id AND can_access_client_queendom(t.queendom_id)));
CREATE POLICY sia_ticket_sla_policies_select ON sia.ticket_sla_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY sia_genie_roster_select ON sia.genie_roster FOR SELECT TO authenticated USING (can_access_client_queendom(queendom_id));
-- No user write policies (the deals posture): every write is an RPC on the admin client.

GRANT SELECT ON sia.tickets, sia.ticket_events, sia.ticket_message_links, sia.ticket_sla_policies, sia.genie_roster TO authenticated;
GRANT ALL ON sia.tickets, sia.ticket_events, sia.ticket_message_links, sia.ticket_sla_policies, sia.genie_roster TO service_role;
GRANT USAGE, SELECT ON SEQUENCE sia.ticket_no_seq TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. The two write RPCs (ticket + event in ONE transaction; service_role only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sia.create_ticket(p_ticket jsonb, p_event jsonb)
RETURNS sia.tickets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = sia, public AS $$
DECLARE
  v_row sia.tickets;
BEGIN
  INSERT INTO sia.tickets (
    client_id, queendom_id, origin, origin_ref, group_jid, category, sub_category, item, title, brief, checklist,
    priority, priority_approved_at, priority_approved_by, status, requested_for,
    first_response_due_at, next_update_due_at, resolve_due_at,
    assignee_id, bishop_id, created_by, created_by_kind, proposed_by_run_id, freshdesk_id, next_wake_at, wake_reason
  ) VALUES (
    (p_ticket->>'client_id')::uuid, NULLIF(p_ticket->>'queendom_id', '')::uuid,
    p_ticket->>'origin', COALESCE(p_ticket->'origin_ref', '{}'::jsonb), p_ticket->>'group_jid',
    p_ticket->>'category', p_ticket->>'sub_category', p_ticket->>'item', p_ticket->>'title',
    COALESCE(p_ticket->'brief', '{}'::jsonb), COALESCE(p_ticket->'checklist', '[]'::jsonb),
    COALESCE(p_ticket->>'priority', 'medium'),
    NULLIF(p_ticket->>'priority_approved_at', '')::timestamptz, NULLIF(p_ticket->>'priority_approved_by', '')::uuid,
    COALESCE(p_ticket->>'status', 'open'), NULLIF(p_ticket->>'requested_for', '')::timestamptz,
    NULLIF(p_ticket->>'first_response_due_at', '')::timestamptz, NULLIF(p_ticket->>'next_update_due_at', '')::timestamptz,
    NULLIF(p_ticket->>'resolve_due_at', '')::timestamptz,
    NULLIF(p_ticket->>'assignee_id', '')::uuid, NULLIF(p_ticket->>'bishop_id', '')::uuid,
    NULLIF(p_ticket->>'created_by', '')::uuid, COALESCE(p_ticket->>'created_by_kind', 'human'),
    NULLIF(p_ticket->>'proposed_by_run_id', '')::uuid, NULLIF(p_ticket->>'freshdesk_id', '')::bigint,
    NULLIF(p_ticket->>'next_wake_at', '')::timestamptz, p_ticket->>'wake_reason'
  ) RETURNING * INTO v_row;

  INSERT INTO sia.ticket_events (ticket_id, client_id, queendom_id, actor_kind, actor_id, event_type, body, meta, run_id)
  VALUES (v_row.id, v_row.client_id, v_row.queendom_id,
          COALESCE(p_event->>'actor_kind', 'human'), NULLIF(p_event->>'actor_id', '')::uuid,
          COALESCE(p_event->>'event_type', 'created'), p_event->>'body', COALESCE(p_event->'meta', '{}'::jsonb),
          NULLIF(p_event->>'run_id', '')::uuid);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION sia.apply_ticket_change(p_ticket_id uuid, p_patch jsonb, p_event jsonb)
RETURNS sia.tickets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = sia, public AS $$
DECLARE
  v_row sia.tickets;
BEGIN
  -- A key present in p_patch sets the column (an empty string clears a nullable one);
  -- an absent key leaves it alone.
  UPDATE sia.tickets SET
    status                = COALESCE(p_patch->>'status', status),
    priority              = COALESCE(p_patch->>'priority', priority),
    priority_approved_at  = CASE WHEN p_patch ? 'priority_approved_at' THEN NULLIF(p_patch->>'priority_approved_at', '')::timestamptz ELSE priority_approved_at END,
    priority_approved_by  = CASE WHEN p_patch ? 'priority_approved_by' THEN NULLIF(p_patch->>'priority_approved_by', '')::uuid ELSE priority_approved_by END,
    assignee_id           = CASE WHEN p_patch ? 'assignee_id' THEN NULLIF(p_patch->>'assignee_id', '')::uuid ELSE assignee_id END,
    bishop_id             = CASE WHEN p_patch ? 'bishop_id' THEN NULLIF(p_patch->>'bishop_id', '')::uuid ELSE bishop_id END,
    title                 = COALESCE(p_patch->>'title', title),
    category              = COALESCE(p_patch->>'category', category),
    sub_category          = CASE WHEN p_patch ? 'sub_category' THEN NULLIF(p_patch->>'sub_category', '') ELSE sub_category END,
    item                  = CASE WHEN p_patch ? 'item' THEN NULLIF(p_patch->>'item', '') ELSE item END,
    brief                 = COALESCE(p_patch->'brief', brief),
    checklist             = COALESCE(p_patch->'checklist', checklist),
    money                 = COALESCE(p_patch->'money', money),
    summary               = CASE WHEN p_patch ? 'summary' THEN NULLIF(p_patch->>'summary', '') ELSE summary END,
    requested_for         = CASE WHEN p_patch ? 'requested_for' THEN NULLIF(p_patch->>'requested_for', '')::timestamptz ELSE requested_for END,
    first_response_due_at = CASE WHEN p_patch ? 'first_response_due_at' THEN NULLIF(p_patch->>'first_response_due_at', '')::timestamptz ELSE first_response_due_at END,
    next_update_due_at    = CASE WHEN p_patch ? 'next_update_due_at' THEN NULLIF(p_patch->>'next_update_due_at', '')::timestamptz ELSE next_update_due_at END,
    resolve_due_at        = CASE WHEN p_patch ? 'resolve_due_at' THEN NULLIF(p_patch->>'resolve_due_at', '')::timestamptz ELSE resolve_due_at END,
    first_responded_at    = CASE WHEN p_patch ? 'first_responded_at' THEN NULLIF(p_patch->>'first_responded_at', '')::timestamptz ELSE first_responded_at END,
    last_client_update_at = CASE WHEN p_patch ? 'last_client_update_at' THEN NULLIF(p_patch->>'last_client_update_at', '')::timestamptz ELSE last_client_update_at END,
    handoff_department    = CASE WHEN p_patch ? 'handoff_department' THEN NULLIF(p_patch->>'handoff_department', '') ELSE handoff_department END,
    vendor_id             = CASE WHEN p_patch ? 'vendor_id' THEN NULLIF(p_patch->>'vendor_id', '')::uuid ELSE vendor_id END,
    closed_at             = CASE WHEN p_patch ? 'closed_at' THEN NULLIF(p_patch->>'closed_at', '')::timestamptz ELSE closed_at END,
    resolution            = CASE WHEN p_patch ? 'resolution' THEN NULLIF(p_patch->>'resolution', '') ELSE resolution END,
    satisfaction          = CASE WHEN p_patch ? 'satisfaction' THEN NULLIF(p_patch->>'satisfaction', '')::smallint ELSE satisfaction END,
    sentinel_state        = COALESCE(p_patch->'sentinel_state', sentinel_state),
    next_wake_at          = CASE WHEN p_patch ? 'next_wake_at' THEN NULLIF(p_patch->>'next_wake_at', '')::timestamptz ELSE next_wake_at END,
    wake_reason           = CASE WHEN p_patch ? 'wake_reason' THEN NULLIF(p_patch->>'wake_reason', '') ELSE wake_reason END
  WHERE id = p_ticket_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ticket % not found', p_ticket_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO sia.ticket_events (ticket_id, client_id, queendom_id, actor_kind, actor_id, event_type, body, meta, run_id)
  VALUES (v_row.id, v_row.client_id, v_row.queendom_id,
          COALESCE(p_event->>'actor_kind', 'human'), NULLIF(p_event->>'actor_id', '')::uuid,
          COALESCE(p_event->>'event_type', 'observation'), p_event->>'body', COALESCE(p_event->'meta', '{}'::jsonb),
          NULLIF(p_event->>'run_id', '')::uuid);
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION sia.create_ticket(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sia.apply_ticket_change(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.create_ticket(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION sia.apply_ticket_change(uuid, jsonb, jsonb) TO service_role;

-- A note or a linked message is an event without a ticket change: plain inserts by the
-- service role (ticket_events has no user write policy; the core writes both).

-- ─────────────────────────────────────────────────────────────────────────────
-- H. Notifications: six ticket types, five preference keys (the 0133 / 0162 pattern)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'lead_assigned', 'lead_won', 'task_due', 'task_assigned', 'mention', 'system',
  'sla_breach_agent', 'sla_breach_manager', 'sla_breach_founder', 'task_overdue_manager', 'suggestion_resolved',
  'ticket_assigned', 'ticket_proposed', 'ticket_sla_warning', 'ticket_sla_breach', 'ticket_client_replied', 'ticket_client_unhappy'
));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_notification_key_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_notification_key_check CHECK (notification_key IN (
  'lead_assigned', 'new_lead_founder_alert', 'lead_won', 'deal_created', 'task_assigned', 'task_due',
  'task_overdue_manager', 'sla_breach', 'sla_escalation',
  'ticket_proposed_for_approval', 'ticket_sla_warning', 'ticket_sla_breach_manager', 'ticket_client_unhappy', 'ticket_daily_digest_founder'
));

COMMENT ON TABLE sia.tickets IS
  'Sia''s own tickets (0195). Current state; written ONLY through sia.create_ticket / '
  'sia.apply_ticket_change (service_role), which write the event diary in the same transaction. '
  'Vocabulary: constants/tickets.ts. client-ticket-plan.md section 7.';

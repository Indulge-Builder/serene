-- 0219 — Ticket intake, phase 2 (member-ticket-plan.md 7.8b): Serene reads the member groups
-- and PROPOSES tickets, so the bishop does not have to spot every request.
--
-- A proposal is not a ticket. It is a card: the member's messages, what Serene thinks they are
-- asking for, and a fully drafted ticket form. A human opens it, corrects what is wrong and
-- creates the ticket, or dismisses it with a reason. Nothing here creates work by itself
-- (founder, 2026-09-18: the final call is always a human's).
--
-- Why a table and not `proposed` rows in sia.tickets: this is the training phase. A wrong guess
-- must not take a ticket number, start an SLA clock or land on the board; and every outcome has
-- to be measurable (accepted as drafted / accepted after edits / dismissed and why). Those three
-- numbers are how we find out whether intake is good enough to trust more.
--
--   sia.intake_proposals    the cards, with the draft, the outcome and what the human changed
--   sia.intake_group_state  the bookmark per group (the profiler's pattern, 0215/0218)
--   sia.intake_due_groups   which linked member groups have something new since their bookmark
--   elaya_settings          `ticket_intake_enabled`, seeded false

CREATE TABLE sia.intake_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        uuid NOT NULL REFERENCES member.members(id) ON DELETE CASCADE,
  queendom_id      uuid REFERENCES sia.queendoms(id),
  group_jid        text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('request', 'update')),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'expired')),
  confidence       numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  tone             text CHECK (tone IS NULL OR tone IN ('neutral', 'happy', 'frustrated', 'angry')),
  summary          text NOT NULL,
  -- The drafted ticket, in the shape the New ticket form already fills from (TicketDraft).
  draft            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The messages the proposal rests on, in the shape of the form's selection (names as they are:
  -- this row is read by staff, never by a model).
  messages         jsonb NOT NULL,
  first_message_at timestamptz NOT NULL,
  last_message_at  timestamptz NOT NULL,
  -- kind = update: the open ticket it seems to belong to. status = accepted: the ticket created.
  ticket_id        uuid REFERENCES sia.tickets(id) ON DELETE SET NULL,
  classify_run_id  uuid,
  draft_run_id     uuid,
  resolved_by      uuid REFERENCES public.profiles(id),
  resolved_at      timestamptz,
  dismiss_reason   text CHECK (dismiss_reason IS NULL OR dismiss_reason IN ('not_a_request', 'already_handled', 'duplicate', 'wrong_member', 'other')),
  -- On accept: the drafted fields the human changed before creating. Empty = accepted as drafted.
  fields_changed   text[],
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One burst of messages is proposed once, however many times the sweep sees it.
  CONSTRAINT intake_proposals_one_per_burst UNIQUE (group_jid, first_message_at)
);

CREATE INDEX idx_intake_proposals_open ON sia.intake_proposals (queendom_id, created_at DESC) WHERE status = 'open';
CREATE INDEX idx_intake_proposals_member ON sia.intake_proposals (member_id, created_at DESC);
CREATE INDEX idx_intake_proposals_outcome ON sia.intake_proposals (status, created_at DESC);

CREATE TABLE sia.intake_group_state (
  group_jid       text PRIMARY KEY,
  last_message_at timestamptz,
  bursts_done     integer NOT NULL DEFAULT 0,
  fail_count      integer NOT NULL DEFAULT 0,
  last_error      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER intake_group_state_touch BEFORE UPDATE ON sia.intake_group_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE sia.intake_proposals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.intake_group_state ENABLE ROW LEVEL SECURITY;

-- The whole queendom sees its own proposals (the tickets rule, 0195); admin and founder see all.
-- Writes are service role only: the sweep files them, the action resolves them after its own gate.
CREATE POLICY sia_intake_proposals_select ON sia.intake_proposals FOR SELECT TO authenticated
  USING (public.can_access_member_queendom(queendom_id));

GRANT SELECT ON sia.intake_proposals TO authenticated;
GRANT ALL ON sia.intake_proposals, sia.intake_group_state TO service_role;

-- Which groups have something new. Intake is about NOW: a group never seen before starts at
-- p_since (the sweep passes "a few hours ago"), never at the beginning of its history.
CREATE FUNCTION sia.intake_due_groups(p_limit integer DEFAULT 40, p_statuses text[] DEFAULT ARRAY['Active'], p_since timestamptz DEFAULT now() - interval '6 hours')
RETURNS TABLE (group_jid text, member_id uuid, queendom_id uuid, cursor_at timestamptz, newest_at timestamptz, fail_count integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = sia, pg_temp AS $$
  SELECT g.group_jid, g.member_id, mm.queendom_id, COALESCE(s.last_message_at, p_since), x.newest_at, COALESCE(s.fail_count, 0)
  FROM sia.wag_groups g
  JOIN member.members mm ON mm.id = g.member_id
   AND (p_statuses IS NULL OR mm.membership_status = ANY (p_statuses))
  LEFT JOIN sia.intake_group_state s ON s.group_jid = g.group_jid
  JOIN LATERAL (
    SELECT m.wa_timestamp AS newest_at
    FROM sia.wag_messages m
    WHERE m.chat_jid = g.group_jid
    ORDER BY m.wa_timestamp DESC
    LIMIT 1
  ) x ON x.newest_at > COALESCE(s.last_message_at, p_since)
  WHERE g.member_id IS NOT NULL AND g.group_kind = 'member' AND g.is_active
  ORDER BY x.newest_at ASC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION sia.intake_due_groups(integer, text[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.intake_due_groups(integer, text[], timestamptz) TO service_role;

INSERT INTO public.elaya_settings (key, value) VALUES ('ticket_intake_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

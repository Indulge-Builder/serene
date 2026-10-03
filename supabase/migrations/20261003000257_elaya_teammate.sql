-- 0257 — The operating teammate: Elaya's interventions (2026-10-03).
-- docs/architecture/elaya-behaviour-contract.md "The operating teammate: event-to-outcome": the
-- proactive half of Elaya. A sweep (services/elaya-teammate.ts, every five minutes) turns persisted
-- signals into typed INTERVENTIONS (a last-mile check a ticket still owes, silence after options, a
-- request on no ticket, the occasions ahead), delivers them to the person who owns the next move
-- through the existing routes, waits for an acknowledgement, escalates on a ladder, and resolves
-- them on evidence. One logical issue = one row (dedupe_key), whatever the channel; every transition
-- is an append-only event. Ships in SHADOW mode: rows are written, nothing is sent, until a founder
-- sets elaya_teammate_mode to live and names the queendoms.

CREATE TABLE public.elaya_interventions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  kind              text        NOT NULL CHECK (kind IN ('action_needed', 'watch', 'last_mile', 'recovery', 'opportunity', 'recognition')),
  subject_kind      text        NOT NULL CHECK (subject_kind IN ('ticket', 'member', 'group', 'intake_proposal', 'queendom')),
  subject_id        text        NOT NULL,
  checkpoint        text        NOT NULL,                       -- which rule fired (driver_reached, ticket_issued, silence_after_options, untracked_request, occasions_week)
  dedupe_key        text        NOT NULL UNIQUE,                -- one logical issue, ever
  ticket_id         uuid,
  member_id         uuid,
  group_jid         text,
  queendom_id       uuid,
  priority          smallint    NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),   -- 1 now, 2 soon, 3 digest
  title             text        NOT NULL,
  body              text        NOT NULL,
  observation       text        NOT NULL,                       -- the evidenced fact, in plain words
  next_step         text,                                       -- the one move proposed
  evidence          jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- stable pointers: ticket number, the labels still open, the time, the card id
  state             text        NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'delivered', 'acknowledged', 'snoozed', 'resolved', 'dismissed', 'superseded')),
  delivery_mode     text        NOT NULL DEFAULT 'immediate' CHECK (delivery_mode IN ('immediate', 'digest')),
  recipient_id      uuid,                                       -- who owns the next move right now
  recipient_role    text,                                       -- genie | bishop | queen | founder
  escalation_step   smallint    NOT NULL DEFAULT 0,
  next_check_at     timestamptz,                                -- when the sweep looks at it again (a nudge, an escalation, a snooze end)
  delivery          jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{at, step, recipient_id, channel: whatsapp|pinged|in_app|none|shadow}]
  acknowledged_at   timestamptz,
  acknowledged_by   uuid,
  snoozed_until     timestamptz,
  resolved_at       timestamptz,
  resolution        text,                                       -- evidence | done_by_reply | time_passed | dismissed | superseded
  policy_version    text
);
COMMENT ON TABLE public.elaya_interventions IS
  'One row per logical issue Elaya decided deserves a move (a last-mile check, silence after options, a request on no ticket, the occasions ahead): who owns it, what was said, the ladder, the acknowledgement, how it ended. Written by the teammate sweep; a person changes only the state.';

CREATE INDEX idx_elaya_interventions_live ON public.elaya_interventions (state, next_check_at) WHERE state IN ('proposed', 'delivered', 'acknowledged', 'snoozed');
CREATE INDEX idx_elaya_interventions_recipient ON public.elaya_interventions (recipient_id, created_at DESC) WHERE recipient_id IS NOT NULL;
CREATE INDEX idx_elaya_interventions_ticket ON public.elaya_interventions (ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_elaya_interventions_created ON public.elaya_interventions (created_at DESC);
CREATE TRIGGER trg_elaya_interventions_updated_at BEFORE UPDATE ON public.elaya_interventions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.elaya_interventions ENABLE ROW LEVEL SECURITY;
-- The person it was sent to sees their own; admin and founder see all. Writes are the service role's
-- (the sweep, and the gated action in actions/elaya-teammate.ts).
CREATE POLICY "elaya_interventions_select" ON public.elaya_interventions FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.elaya_interventions TO authenticated;
GRANT ALL ON public.elaya_interventions TO service_role;

-- Every transition, append-only (rule 08): proposed, shadow, delivered, nudged, escalated,
-- acknowledged, snoozed, resolved, dismissed, superseded, digest.
CREATE TABLE public.elaya_intervention_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id  uuid        NOT NULL REFERENCES public.elaya_interventions(id) ON DELETE CASCADE,
  at               timestamptz NOT NULL DEFAULT now(),
  event            text        NOT NULL,
  actor_id         uuid,                                        -- the person, when a person did it
  detail           jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_elaya_intervention_events_intervention ON public.elaya_intervention_events (intervention_id, at);
ALTER TABLE public.elaya_intervention_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "elaya_intervention_events_select" ON public.elaya_intervention_events FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.elaya_intervention_events TO authenticated;
GRANT ALL ON public.elaya_intervention_events TO service_role;
-- No UPDATE / DELETE policies.

-- The switches. mode: off (the sweep does nothing) | shadow (rows written, nothing sent) | live
-- (sent to the queendoms named below). Shadow from the first run, so the founder can read what
-- she would have sent before anything goes out.
INSERT INTO public.elaya_settings (key, value) VALUES ('elaya_teammate_mode', '"shadow"'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.elaya_settings (key, value) VALUES ('elaya_teammate_queendoms', '[]'::jsonb) ON CONFLICT (key) DO NOTHING;

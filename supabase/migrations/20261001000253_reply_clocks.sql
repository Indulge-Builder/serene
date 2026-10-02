-- Migration 0253: the reply clocks. Two timers per member group, kept by the database itself.
--
-- Why: the concierge goal is a reply to a member inside one minute. The alert sweep (0235) reads
-- "who is waiting" every five minutes, which cannot tell a bishop at 60 seconds. And a quick
-- "Noted, checking" stops any reply timer while the member still has no answer (a week of real
-- chats: 1,428 holding replies, a median of 17 minutes to the real answer, 308 over two hours).
-- So, the way support desks do it, two clocks:
--
--   Clock 1, the REPLY clock: starts at the member's first unanswered message, stops at any staff
--     message in the group. Acknowledgements ("ok thanks", an emoji) never start it.
--   Clock 2, the UPDATE clock: starts when a staff reply is a holding reply (a promise such as
--     "will get back to you", or a short "noted" / "sure" / "on it" answering an open request),
--     stops at the next real staff reply. A member who chases meanwhile restarts clock 1.
--
-- A trigger on sia.wag_messages keeps one row per group in sia.reply_clocks (about a millisecond a
-- message, live messages only, never a history import). The alert job (src/trigger/reply-alerts.ts)
-- reads the RUNNING clocks and tells bishops, the queen and the founders by the ladder in
-- constants/reply-clocks.ts. Every closed clock is one row in sia.reply_waits: the score
-- ("% answered under a minute") for later. No model anywhere.
--
-- Safety: the trigger sits on the watcher's write path, so it catches its own errors. A broken
-- clock can never stop a message from being saved.

-- ── 1. The clocks: one row per member group ────────────────────────────────
CREATE TABLE sia.reply_clocks (
  group_jid             text        PRIMARY KEY,
  member_id             uuid,
  -- Clock 1: the member is waiting for any reply.
  wait_started_at       timestamptz,
  wait_msg_id           text,
  wait_text             text,
  wait_steps            text[]      NOT NULL DEFAULT '{}',   -- ladder steps already handled
  -- Clock 2: a holding reply owes the member an answer.
  hold_started_at       timestamptz,
  hold_msg_id           text,
  hold_text             text,
  hold_by               uuid,                                -- the staff profile who promised, when linked
  hold_promised_minutes integer,                             -- "give me 10 mins" = 10; null = no time named
  hold_steps            text[]      NOT NULL DEFAULT '{}',
  last_member_at        timestamptz,
  last_staff_at         timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE sia.reply_clocks IS 'The live reply timers per member group (0253), kept by the trigger on sia.wag_messages. wait_* = the member is waiting for any reply; hold_* = a holding reply ("noted, checking") owes an answer. *_steps = the alert ladder steps already handled for the running clock.';
CREATE INDEX idx_reply_clocks_wait ON sia.reply_clocks (wait_started_at) WHERE wait_started_at IS NOT NULL;
CREATE INDEX idx_reply_clocks_hold ON sia.reply_clocks (hold_started_at) WHERE hold_started_at IS NOT NULL;
ALTER TABLE sia.reply_clocks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON sia.reply_clocks TO service_role;

-- ── 2. The history: one row per closed clock (append-only) ─────────────────
CREATE TABLE sia.reply_waits (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_jid     text        NOT NULL,
  member_id     uuid,
  clock         text        NOT NULL CHECK (clock IN ('reply', 'update')),
  started_at    timestamptz NOT NULL,
  closed_at     timestamptz NOT NULL,
  seconds       integer     NOT NULL,
  opened_msg_id text,
  closed_msg_id text,
  closed_by     uuid,                                         -- the staff profile who answered, when linked
  steps         text[]      NOT NULL DEFAULT '{}',            -- the ladder steps handled before it closed
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE sia.reply_waits IS 'Every closed reply clock (0253): how long a member waited for a reply (clock reply) or for the answer a holding reply promised (clock update), and who answered. Append-only; the source of the reply-time score.';
CREATE INDEX idx_reply_waits_group ON sia.reply_waits (group_jid, closed_at DESC);
CREATE INDEX idx_reply_waits_closed ON sia.reply_waits (clock, closed_at DESC);
ALTER TABLE sia.reply_waits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reply_waits_select" ON sia.reply_waits FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON sia.reply_waits TO authenticated;
GRANT ALL ON sia.reply_waits TO service_role;

-- ── 3. The words: pure, so they can be tested with a plain SELECT ──────────

-- Mirrors isOnlyAcknowledgement + INTAKE_ACK_WORDS (services/ticket-intake.ts, constants/ticket-intake.ts):
-- everything said is a thanks, an ok, a greeting or an emoji. Change both together.
CREATE FUNCTION sia.reply_clock_is_ack(p_text text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_text IS NOT NULL AND btrim(p_text) <> '' AND length(p_text) <= 60 AND p_text !~ '[0-9?]'
     AND coalesce((
       SELECT bool_and(w = ANY (ARRAY['ok','okay','okk','k','kk','thanks','thank','you','thankyou','thx','ty','tysm','great','perfect','noted',
         'cool','nice','super','awesome','lovely','received','got','it','done','good','morning','evening','night',
         'hi','hello','hey','hii','sure','fine','alright','welcome','much','so','very','a','lot','ji','sir','maam','mam','copied']))
       FROM regexp_split_to_table(lower(p_text), '[^[:alpha:]]+') AS w WHERE w <> ''
     ), true);
$$;

-- What a STAFF message is to the clocks: 'hold' (it promises an answer still to come), 'ack' (a
-- bare ok / thanks with nothing open) or 'reply' (a real answer, a file, anything else).
--   strong promise (get back, update you, shortly, give us some time...): hold, at any length to 250
--   soft word (noted, sure, on it, checking, or a bare ok): hold ONLY while the member is waiting
--     (p_wait_open), only when short, and never next to a word that says it is done
--   a message that hands the next step to the member ("let us know", "kindly confirm") never holds
-- Benched on three days of real staff messages, 2026-10-01. Phrase lists are English + Hinglish.
CREATE FUNCTION sia.reply_clock_classify(p_text text, p_wait_open boolean) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  WITH t AS (SELECT coalesce(p_text, '') AS s)
  SELECT CASE
    WHEN s = '' THEN 'reply'
    WHEN s ~* '\m(let us know|let me know|kindly (update|confirm|share|send|let)|please (confirm|share|send|update|let us))\M' THEN
      CASE WHEN sia.reply_clock_is_ack(s) THEN 'ack' ELSE 'reply' END
    WHEN length(s) <= 250 AND s ~* '(\m(get(ting)? back|updat(e|ing) (you|u)|keep (you|u) (posted|updated|informed)|revert|let (you|u) know|shortly|in a (bit|while)|as soon as|try again|looking into|working on (it|this|your)|bata(unga|ungi|enge|te|ti))\M|\m(will|we.?ll|i.?ll) (share|send|call|confirm|arrange|book|check|update|get)\M|\mgive (me|us) (a|some|around|[0-9])|\mallow (me|us)\M)' THEN 'hold'
    WHEN length(s) <= 80
         AND (s ~* '\m(noted|checking|check(ing)? (on|for)|on it|let me (check|see)|sure|surely|certainly|right away|just a (min|minute|moment|sec)|one (min|minute|moment|sec)|ek min|dekh(ta|ti|ke|kar)?|will do)\M' OR sia.reply_clock_is_ack(s))
         AND s !~* '\m(booked|confirmed|reserved|here (is|are)|please find|attached|paid|pnr|voucher|invoice|has been (booked|done|confirmed|shared|sent))\M' THEN
      -- A "noted" with nothing open is a courtesy: it neither promises nor answers.
      CASE WHEN p_wait_open THEN 'hold' ELSE 'ack' END
    WHEN sia.reply_clock_is_ack(s) THEN 'ack'
    ELSE 'reply'
  END FROM t;
$$;

-- "give me 10 mins" = 10, "2 hours" = 120; null when no time is named. Clamped to 5 min .. 24 h.
CREATE FUNCTION sia.reply_clock_promised_minutes(p_text text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_text ~* '\m[0-9]{1,3} ?(m|min|mins|minute|minutes)\M' THEN
      least(greatest((substring(p_text FROM '(?i)\m([0-9]{1,3}) ?(?:m|min|mins|minute|minutes)\M'))::int, 5), 1440)
    WHEN p_text ~* '\m[0-9]{1,2} ?(h|hr|hrs|hour|hours)\M' THEN
      least(greatest((substring(p_text FROM '(?i)\m([0-9]{1,2}) ?(?:h|hr|hrs|hour|hours)\M'))::int * 60, 5), 1440)
    ELSE NULL
  END;
$$;

-- ── 4. The trigger: every live message moves the clocks ────────────────────
CREATE FUNCTION sia.reply_clock_on_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sia, public AS $$
DECLARE
  v_member   uuid;
  v_profile  uuid;
  v_role     text;
  v_name     text;
  v_staff    boolean;
  v_text     text := coalesce(NEW.text, '[' || NEW.type || ']');
  v_clock    sia.reply_clocks%ROWTYPE;
  v_kind     text;
BEGIN
  -- Live messages of the last few minutes only: a history import, a backfill or a late redelivery
  -- must never start a timer.
  IF NEW.source <> 'live' OR NEW.is_revoked OR NEW.type IN ('system', 'reaction', 'protocol')
     OR NEW.wa_timestamp < now() - interval '15 minutes' THEN
    RETURN NULL;
  END IF;

  SELECT member_id INTO v_member FROM wag_groups
   WHERE group_jid = NEW.chat_jid AND group_kind = 'member' AND member_id IS NOT NULL AND is_active;
  IF v_member IS NULL THEN RETURN NULL; END IF;

  -- Staff = the same rule as sia.groups_waiting_for_reply (0224).
  SELECT staff_profile_id, participant_role, push_name INTO v_profile, v_role, v_name
    FROM wag_contacts WHERE jid = NEW.sender_jid;
  v_staff := NEW.from_me OR v_profile IS NOT NULL
          OR coalesce(v_role, '') IN ('genie', 'bishop', 'queen', 'joker', 'founder', 'watcher')
          OR coalesce(v_name, '') ~* '\mindulge\M';

  INSERT INTO reply_clocks (group_jid, member_id) VALUES (NEW.chat_jid, v_member) ON CONFLICT (group_jid) DO NOTHING;
  SELECT * INTO v_clock FROM reply_clocks WHERE group_jid = NEW.chat_jid FOR UPDATE;

  IF NOT v_staff THEN
    -- The member. A thanks or an emoji starts nothing; anything else starts clock 1 if it is not
    -- already running (it counts from the FIRST unanswered message) and nothing from staff is newer.
    IF v_clock.wait_started_at IS NULL AND NOT (NEW.type = 'text' AND reply_clock_is_ack(NEW.text))
       AND (v_clock.last_staff_at IS NULL OR NEW.wa_timestamp >= v_clock.last_staff_at) THEN
      UPDATE reply_clocks SET wait_started_at = NEW.wa_timestamp, wait_msg_id = NEW.wa_message_id,
             wait_text = left(v_text, 300), wait_steps = '{}'
       WHERE group_jid = NEW.chat_jid;
    END IF;
    UPDATE reply_clocks SET member_id = v_member, last_member_at = greatest(last_member_at, NEW.wa_timestamp), updated_at = now()
     WHERE group_jid = NEW.chat_jid;
    RETURN NULL;
  END IF;

  -- Staff. Any message answers clock 1.
  v_kind := reply_clock_classify(CASE WHEN NEW.type = 'text' THEN NEW.text ELSE NULL END,
                                 v_clock.wait_started_at IS NOT NULL);
  IF v_clock.wait_started_at IS NOT NULL AND NEW.wa_timestamp >= v_clock.wait_started_at THEN
    INSERT INTO reply_waits (group_jid, member_id, clock, started_at, closed_at, seconds, opened_msg_id, closed_msg_id, closed_by, steps)
    VALUES (NEW.chat_jid, v_member, 'reply', v_clock.wait_started_at, NEW.wa_timestamp,
            greatest(0, extract(epoch FROM NEW.wa_timestamp - v_clock.wait_started_at))::int,
            v_clock.wait_msg_id, NEW.wa_message_id, v_profile, v_clock.wait_steps);
    UPDATE reply_clocks SET wait_started_at = NULL, wait_msg_id = NULL, wait_text = NULL, wait_steps = '{}'
     WHERE group_jid = NEW.chat_jid;
  END IF;

  IF v_kind = 'hold' THEN
    -- A promise. The first one stands; a second "still checking" does not move the deadline.
    IF v_clock.hold_started_at IS NULL THEN
      UPDATE reply_clocks SET hold_started_at = NEW.wa_timestamp, hold_msg_id = NEW.wa_message_id,
             hold_text = left(v_text, 300), hold_by = v_profile,
             hold_promised_minutes = reply_clock_promised_minutes(NEW.text), hold_steps = '{}'
       WHERE group_jid = NEW.chat_jid;
    END IF;
  ELSIF v_kind = 'reply' AND v_clock.hold_started_at IS NOT NULL AND NEW.wa_timestamp >= v_clock.hold_started_at THEN
    -- The real answer: clock 2 closes.
    INSERT INTO reply_waits (group_jid, member_id, clock, started_at, closed_at, seconds, opened_msg_id, closed_msg_id, closed_by, steps)
    VALUES (NEW.chat_jid, v_member, 'update', v_clock.hold_started_at, NEW.wa_timestamp,
            greatest(0, extract(epoch FROM NEW.wa_timestamp - v_clock.hold_started_at))::int,
            v_clock.hold_msg_id, NEW.wa_message_id, v_profile, v_clock.hold_steps);
    UPDATE reply_clocks SET hold_started_at = NULL, hold_msg_id = NULL, hold_text = NULL, hold_by = NULL,
           hold_promised_minutes = NULL, hold_steps = '{}'
     WHERE group_jid = NEW.chat_jid;
  END IF;

  UPDATE reply_clocks SET member_id = v_member, last_staff_at = greatest(last_staff_at, NEW.wa_timestamp), updated_at = now()
   WHERE group_jid = NEW.chat_jid;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block the watcher: the message is saved, only the clock misses this one.
  RAISE WARNING 'reply clock skipped a message in %: %', NEW.chat_jid, SQLERRM;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION sia.reply_clock_on_message() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_wag_messages_reply_clock
  AFTER INSERT ON sia.wag_messages
  FOR EACH ROW EXECUTE FUNCTION sia.reply_clock_on_message();

-- ── 5. Alert kinds and the switches (both OFF until a founder turns them on) ──
ALTER TABLE public.elaya_alerts DROP CONSTRAINT elaya_alerts_kind_check;
ALTER TABLE public.elaya_alerts ADD CONSTRAINT elaya_alerts_kind_check
  CHECK (kind IN ('unanswered', 'tone', 'ticket_escalated', 'ticket_reopened', 'silent_turn', 'reply_wait', 'update_owed'));

INSERT INTO public.elaya_settings (key, value) VALUES ('reply_alerts_enabled', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.elaya_settings (key, value) VALUES ('update_alerts_enabled', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

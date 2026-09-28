-- 0248 — Jokers: Recommendations & Engagement, step 1 (capture).
--
-- Every day the four jokers open conversations with members in the members' WhatsApp groups:
-- a product or an experience they picked (a Recommendation), or a wish, a check-in, an intro
-- (an Engagement). Until now the only record was a Google Sheet a joker filled by hand. This
-- step captures every OPENING from the mirror, and never the joker's follow-ups (owner,
-- 2026-09-23/24). Step 2 will tie the member's replies to each opening.
--
--   sia.joker_texts     one row per distinct text: a broadcast to 400 groups is labelled ONCE
--                       (title, category, kind) by the model
--   sia.joker_openings  one row per opening per group: the unit every count is made of
--   sia.joker_messages  every joker message in a member group, decided once: an opening, a
--                       piece of one (album photos, a second message a minute later), a
--                       follow-up, undecided (waiting for the model), or unlinked (the group
--                       has no member yet; re-decided the moment it is linked)
--   elaya_settings      `joker_capture_enabled`, seeded false
--
-- Writes are the capture job's only (service role). The page that reads these arrives with
-- step 3 and brings its own SELECT policies then; until then nobody but the service role
-- sees a row.

CREATE TABLE sia.joker_texts (
  template_key         text PRIMARY KEY,   -- the normalised text: greeting line and @mentions removed
  sample_chat_jid      text NOT NULL,      -- where it was first seen (the label call read it there)
  sample_wa_message_id text NOT NULL,
  body                 text NOT NULL,      -- the text as sent, greeting line removed: what a failed label retries on
  label_state          text NOT NULL DEFAULT 'pending' CHECK (label_state IN ('pending', 'labelled', 'failed')),
  kind                 text CHECK (kind IS NULL OR kind IN ('recommendation', 'wish', 'check_in', 'intro', 'other')),
  -- The owner's rule: a recommendation is a Recommendation, every other kind an Engagement.
  tag                  text GENERATED ALWAYS AS (
                         CASE WHEN kind IS NULL THEN NULL WHEN kind = 'recommendation' THEN 'recommendation' ELSE 'engagement' END
                       ) STORED,
  -- The jokers' own categories, from the Type column of their sheet (owner, 2026-09-28;
  -- constants/joker-engagement.ts mirrors this).
  category             text CHECK (category IS NULL OR category IN (
                         'experience', 'event', 'restaurant', 'retail', 'travel', 'news_info')),
  title                text,
  attempts             integer NOT NULL DEFAULT 0,
  last_error           text,
  run_id               uuid,
  prompt_version       text,
  first_seen_at        timestamptz NOT NULL,
  labelled_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_joker_texts_pending ON sia.joker_texts (first_seen_at) WHERE label_state = 'pending';

CREATE TRIGGER joker_texts_touch BEFORE UPDATE ON sia.joker_texts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE sia.joker_openings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_jid             text NOT NULL,
  anchor_wa_message_id text NOT NULL,      -- the message that opened it (for an album: the album)
  member_id            uuid NOT NULL REFERENCES member.members(id) ON DELETE CASCADE,
  queendom_id          uuid REFERENCES sia.queendoms(id),   -- the group's, frozen when captured
  joker_phone          text NOT NULL,      -- E.164, the phone on the Joker's account (the rules' key); the account itself is joker_profile_id (0251)
  sender_jid           text NOT NULL,
  sent_at              timestamptz NOT NULL,
  template_key         text NOT NULL REFERENCES sia.joker_texts(template_key),
  -- Chats that got the same text within a day, as seen when captured. 1 = a personal message.
  broadcast_reach      integer NOT NULL DEFAULT 1,
  decided_by           text NOT NULL CHECK (decided_by IN ('rule', 'model')),
  reason               text NOT NULL,
  rule_version         text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT joker_openings_one_per_anchor UNIQUE (chat_jid, anchor_wa_message_id)
);

CREATE INDEX idx_joker_openings_sent ON sia.joker_openings (sent_at DESC);
CREATE INDEX idx_joker_openings_member ON sia.joker_openings (member_id, sent_at DESC);
CREATE INDEX idx_joker_openings_queendom ON sia.joker_openings (queendom_id, sent_at DESC);
CREATE INDEX idx_joker_openings_joker ON sia.joker_openings (joker_phone, sent_at DESC);
CREATE INDEX idx_joker_openings_template ON sia.joker_openings (template_key);

-- A state table, not a log: `undecided` becomes an opening or a follow-up once the model has
-- read it, and `unlinked` is decided again when its group is linked to a member.
CREATE TABLE sia.joker_messages (
  chat_jid             text NOT NULL,
  wa_message_id        text NOT NULL,
  sender_jid           text NOT NULL,
  joker_phone          text NOT NULL,
  sent_at              timestamptz NOT NULL,
  decision             text NOT NULL CHECK (decision IN ('opening', 'piece', 'follow_up', 'undecided', 'unlinked')),
  reason               text,
  -- A piece's send: the message it belongs to (same chat). Null for everything else.
  anchor_wa_message_id text,
  -- The opening this message is, or is a piece of. Step 2 looks a quoted message up here.
  opening_id           uuid REFERENCES sia.joker_openings(id) ON DELETE CASCADE,
  attempts             integer NOT NULL DEFAULT 0,   -- model reads of an undecided message
  last_error           text,
  rule_version         text NOT NULL,
  decided_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_jid, wa_message_id)
);

CREATE INDEX idx_joker_messages_sender ON sia.joker_messages (sender_jid, sent_at);
CREATE INDEX idx_joker_messages_open ON sia.joker_messages (chat_jid, sent_at) WHERE decision IN ('undecided', 'unlinked');
CREATE INDEX idx_joker_messages_opening ON sia.joker_messages (opening_id) WHERE opening_id IS NOT NULL;
CREATE INDEX idx_joker_messages_anchor ON sia.joker_messages (chat_jid, anchor_wa_message_id) WHERE anchor_wa_message_id IS NOT NULL;

CREATE TRIGGER joker_messages_touch BEFORE UPDATE ON sia.joker_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE sia.joker_texts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.joker_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.joker_messages ENABLE ROW LEVEL SECURITY;

GRANT ALL ON sia.joker_texts, sia.joker_openings, sia.joker_messages TO service_role;

INSERT INTO public.elaya_settings (key, value) VALUES ('joker_capture_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

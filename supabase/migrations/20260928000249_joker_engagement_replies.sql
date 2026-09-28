-- 0249 — Jokers: Recommendations & Engagement, step 2 (threads and replies).
--
-- Step 1 (0248) records every opening a joker makes. This step ties what follows to it:
--   * each joker FOLLOW-UP is tied to the opening it continues (sia.joker_messages.opening_id,
--     which step 1 set only for openings and their pieces), with the reason it was tied;
--   * each MEMBER reply (a message or an emoji) is tied to the opening it answers, and read as
--     Interested, Undecided or Not interested (owner, 2026-09-24: only a clear no is Not interested;
--     a reply that neither says yes nor no is Undecided; the member's latest word wins; a wish,
--     check-in or intro that offered nothing is just Replied);
--   * each opening carries its outcome, starting at Not replied (no "waiting" state).
--
--   sia.joker_replies   one row per member signal the job judged: a message or a reaction. A
--                       reaction row follows the reaction's current state (a change updates it,
--                       a removal withdraws it), so it is state, not an append-only log.

ALTER TABLE sia.joker_openings
  ADD COLUMN reply_status   text NOT NULL DEFAULT 'not_replied'
    CHECK (reply_status IN ('not_replied', 'interested', 'undecided', 'not_interested', 'replied')),
  ADD COLUMN first_reply_at timestamptz,
  ADD COLUMN last_reply_at  timestamptz,
  ADD COLUMN replies        integer NOT NULL DEFAULT 0,
  ADD COLUMN status_reply_id uuid;   -- the reply that set the outcome

CREATE INDEX idx_joker_openings_chat ON sia.joker_openings (chat_jid, sent_at DESC);
CREATE INDEX idx_joker_openings_status ON sia.joker_openings (reply_status, sent_at DESC);

-- Why a follow-up belongs to the opening it is tied to (it quotes the thread, or it continues it).
ALTER TABLE sia.joker_messages ADD COLUMN thread_reason text;

CREATE TABLE sia.joker_replies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_jid        text NOT NULL,
  source          text NOT NULL CHECK (source IN ('message', 'reaction')),
  -- The member's message; for a reaction, the message that was reacted to.
  wa_message_id   text NOT NULL,
  -- Who wrote it, or who reacted. Always the member's side (the member or their household).
  sender_jid      text NOT NULL,
  emoji           text,
  sent_at         timestamptz NOT NULL,
  -- The opening it answers. Null = judged, and it answers none of them (kept so it is not read twice).
  opening_id      uuid REFERENCES sia.joker_openings(id) ON DELETE CASCADE,
  -- How it was tied: a quote of the thread, an emoji on it, the item named, the first hour after
  -- an opening (read by the model), or later typed text (read, but not counted until proven).
  -- quote/reaction = certain; typed = the member's words in one conversation, read by the model
  -- (any time within the window); thanks = the free acknowledgement rule; none = answers no item.
  tier            text NOT NULL CHECK (tier IN ('quote', 'reaction', 'typed', 'thanks', 'none')),
  stance          text CHECK (stance IS NULL OR stance IN ('interested', 'undecided', 'not_interested', 'none')),
  counted         boolean NOT NULL DEFAULT true,
  -- person = the team corrected it (sia.joker_reply_corrections holds the record).
  decided_by      text NOT NULL CHECK (decided_by IN ('rule', 'model', 'pending', 'person')),
  reason          text,
  -- A short reply's words, normalised ("maybe later"): how a team correction finds the same words again.
  text_key        text,
  withdrawn_at    timestamptz,       -- a reaction taken back
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  run_id          uuid,
  rule_version    text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT joker_replies_one_per_signal UNIQUE (chat_jid, source, wa_message_id, sender_jid)
);

CREATE INDEX idx_joker_replies_opening ON sia.joker_replies (opening_id, sent_at DESC) WHERE opening_id IS NOT NULL;
CREATE INDEX idx_joker_replies_chat ON sia.joker_replies (chat_jid, sent_at DESC);
CREATE INDEX idx_joker_replies_pending ON sia.joker_replies (sent_at) WHERE decided_by = 'pending';
CREATE INDEX idx_joker_replies_text_key ON sia.joker_replies (text_key) WHERE text_key IS NOT NULL;

CREATE TRIGGER joker_replies_touch BEFORE UPDATE ON sia.joker_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- A reading the job already paid for is looked up before the model is asked again (a run whose
-- save failed must not buy the same readings twice).
CREATE INDEX idx_extraction_runs_joker_reply ON sia.extraction_runs ((input_ref->>'wa_message_id')) WHERE kind = 'joker_reply';

-- The team's corrections (owner, 2026-09-24): when a person changes how a reply was read, the
-- record is kept here, append-only, and it teaches: the same words get the team's reading from
-- then on without a model, and the latest corrections are shown to the model as examples.
CREATE TABLE sia.joker_reply_corrections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id      uuid REFERENCES sia.joker_replies(id) ON DELETE SET NULL,
  opening_id    uuid REFERENCES sia.joker_openings(id) ON DELETE SET NULL,
  tag           text CHECK (tag IS NULL OR tag IN ('recommendation', 'engagement')),
  text_key      text,              -- the normalised words, for the exact-words memory
  masked_text   text NOT NULL,     -- the member's words with names turned into codes: safe to show a model
  old_stance    text CHECK (old_stance IS NULL OR old_stance IN ('interested', 'undecided', 'not_interested', 'none')),
  new_stance    text NOT NULL CHECK (new_stance IN ('interested', 'undecided', 'not_interested', 'none')),
  corrected_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_joker_reply_corrections_key ON sia.joker_reply_corrections (text_key, created_at DESC) WHERE text_key IS NOT NULL;
CREATE INDEX idx_joker_reply_corrections_recent ON sia.joker_reply_corrections (tag, created_at DESC);

ALTER TABLE sia.joker_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sia.joker_reply_corrections ENABLE ROW LEVEL SECURITY;
GRANT ALL ON sia.joker_replies TO service_role;
GRANT SELECT, INSERT ON sia.joker_reply_corrections TO service_role;  -- append-only (Rule 08)

NOTIFY pgrst, 'reload schema';

-- 0251 — Jokers: the Recommendations & Engagement dashboard's read, and "not a reply" as a fix.
--
--   sia.joker_board(p_days)  the dashboard's one read (compact JSON): every opening the jokers made
--                            in the last p_days India days with its text (kind, tag, category,
--                            title), its client, its queendom as it was on the day, its outcome, and
--                            the words (or emoji) of the reply that set that outcome
--   joker_reply_corrections.not_a_reply  a person's fix "this message is not a reply to this item":
--                            the reply stops counting (counted = false), its words are not copied to
--                            other replies (the same words can answer something else)
--   joker_openings.joker_profile_id  the Joker's Serene account, frozen when the item is captured
--                            (the Jokers are found by their joker / joker_head seats, 2026-09-28): a
--                            company number handed to someone else never moves old items to them
--
-- Service role only; the /jokers pages and actions gate (hasJokersAccess).

ALTER TABLE sia.joker_reply_corrections
  ADD COLUMN not_a_reply boolean NOT NULL DEFAULT false;

ALTER TABLE sia.joker_openings
  ADD COLUMN joker_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX idx_joker_openings_joker_profile ON sia.joker_openings (joker_profile_id, sent_at DESC);

COMMENT ON COLUMN sia.joker_openings.joker_profile_id IS
  'The Joker''s Serene account when the item was captured (0251). joker_phone stays the rules'' key.';

COMMENT ON COLUMN sia.joker_reply_corrections.not_a_reply IS
  'A person said this message is not a reply to this item (0251): the reply stopped counting. new_stance is none.';

CREATE OR REPLACE FUNCTION sia.joker_board(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = sia, pg_temp AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d),
  op AS (
    SELECT o.* FROM sia.joker_openings o
    WHERE o.sent_at >= (((SELECT d FROM today) - p_days + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
  ), said AS (
    SELECT r.id, r.opening_id, r.source, r.tier, r.sent_at,
           left(coalesce(r.emoji, (SELECT m.text FROM sia.wag_messages m WHERE m.chat_jid = r.chat_jid AND m.wa_message_id = r.wa_message_id LIMIT 1)), 300) AS words
    FROM sia.joker_replies r JOIN op ON op.status_reply_id = r.id
  )
  SELECT jsonb_build_object(
    'today', (SELECT d FROM today),
    'texts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('k', t.template_key, 'kind', t.kind, 'tag', t.tag, 'cat', t.category, 'title', t.title))
      FROM sia.joker_texts t WHERE t.template_key IN (SELECT template_key FROM op)), '[]'::jsonb),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object('mid', m.id, 'name', m.full_name))
      FROM member.members m WHERE m.id IN (SELECT member_id FROM op)), '[]'::jsonb),
    -- The Jokers by their accounts: everyone in a joker seat now, and whoever sent an item here.
    'jokers', coalesce((
      SELECT jsonb_agg(jsonb_build_object('pid', p.id, 'name', p.full_name))
      FROM public.profiles p
      WHERE p.id IN (SELECT joker_profile_id FROM op) OR (p.sia_role IN ('joker', 'joker_head') AND p.is_active)), '[]'::jsonb),
    -- [opening, text key, group, member, joker phone, sent at, outcome, first reply at, queendom,
    --  reply id, reply source, reply tier, reply sent at, the reply's words, the Joker's account]
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_array(o.id, o.template_key, o.chat_jid, o.member_id, o.joker_phone, o.sent_at, o.reply_status,
               o.first_reply_at, nullif(regexp_replace(coalesce(q.name, ''), '\s*queendom$', '', 'i'), ''),
               s.id, s.source, s.tier, s.sent_at, s.words, o.joker_profile_id) ORDER BY o.sent_at)
      FROM op o LEFT JOIN said s ON s.opening_id = o.id LEFT JOIN sia.queendoms q ON q.id = o.queendom_id), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION sia.joker_board(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.joker_board(integer) TO service_role;

-- Migration 0224: sia.groups_waiting_for_reply() — the member had the last word.
--
-- Why: the live pulse and the daily briefing need "which members are waiting on us right now".
-- That is the LAST real message of each linked member group: sent by the member's side, older
-- than a grace period, younger than a day. One index probe per group (the 0222 shape), about
-- 0.4 s for 420 groups. Staff = the mapping tool's answer (a linked profile, a staff role) or a
-- name carrying "Indulge" (the founder's guard, plan-sia-intelligence rule 4).
--
-- Service role only: it reads across every queendom, so the caller decides who may see it.

CREATE FUNCTION sia.groups_waiting_for_reply(p_min_minutes int DEFAULT 30, p_max_hours int DEFAULT 24)
RETURNS TABLE (
  group_jid text,
  subject text,
  member_id uuid,
  last_message_at timestamptz,
  last_sender_name text,
  last_text text,
  waiting_minutes int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = sia
AS $$
  SELECT g.group_jid, g.subject, g.member_id, l.wa_timestamp, c.push_name, left(l.text, 200),
         round(extract(epoch FROM (now() - l.wa_timestamp)) / 60)::int
  FROM wag_groups g
  JOIN LATERAL (
    SELECT m.wa_timestamp, m.sender_jid, m.from_me, m.text
    FROM wag_messages m
    WHERE m.chat_jid = g.group_jid
      AND m.type NOT IN ('system', 'reaction', 'protocol')
      AND NOT m.is_revoked
    ORDER BY m.wa_timestamp DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN wag_contacts c ON c.jid = l.sender_jid
  WHERE g.group_kind = 'member' AND g.member_id IS NOT NULL AND g.is_active
    AND l.wa_timestamp > now() - make_interval(hours => greatest(p_max_hours, 1))
    AND l.wa_timestamp < now() - make_interval(mins => greatest(p_min_minutes, 0))
    AND NOT l.from_me
    AND NOT (
      c.staff_profile_id IS NOT NULL
      OR coalesce(c.participant_role, '') IN ('genie', 'bishop', 'queen', 'joker', 'founder', 'watcher')
      OR coalesce(c.push_name, '') ~* '\mindulge\M'
    )
  ORDER BY l.wa_timestamp ASC;
$$;

REVOKE ALL ON FUNCTION sia.groups_waiting_for_reply(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.groups_waiting_for_reply(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';

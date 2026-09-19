-- Migration 0222: sia.wag_group_activity() without the two full scans.
--
-- Why: the 0173 version counted every message AND ran DISTINCT ON over every message row
-- (text included) to find each group's last one. At 160,000 messages that is 1.4 s warm and,
-- when the profiler or the connector is busy, it runs past PostgREST's 8 s statement timeout.
-- getSiaGroups() then falls back to "0 messages, no last activity" for EVERY group: the /sia
-- rail loses its previews and its order, and on 2026-09-19 Elaya told the founder a group with
-- 336 messages had none.
--
-- What changed: the count is one index-only pass over (chat_jid, wa_timestamp), and the last
-- message is ONE index probe per group (LATERAL ... LIMIT 1) instead of a sort of the whole
-- table. Same columns, same rows (every chat that has messages), about 0.1 s. Checked against
-- the old version on production before applying: 516 of 516 rows identical.

CREATE OR REPLACE FUNCTION sia.wag_group_activity()
RETURNS TABLE (
  chat_jid text,
  message_count bigint,
  last_message_at timestamptz,
  last_text text,
  last_type text,
  last_sender_name text,
  last_from_me boolean,
  last_is_revoked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = sia
AS $$
  WITH agg AS (
    SELECT m.chat_jid, count(*) AS message_count
    FROM wag_messages m
    GROUP BY m.chat_jid
  )
  SELECT
    a.chat_jid,
    a.message_count,
    l.wa_timestamp,
    l.text,
    l.type,
    c.push_name,
    l.from_me,
    l.is_revoked
  FROM agg a
  LEFT JOIN LATERAL (
    SELECT m.wa_timestamp, m.text, m.type, m.sender_jid, m.from_me, m.is_revoked
    FROM wag_messages m
    WHERE m.chat_jid = a.chat_jid
    ORDER BY m.wa_timestamp DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN wag_contacts c ON c.jid = l.sender_jid;
$$;

REVOKE ALL ON FUNCTION sia.wag_group_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.wag_group_activity() TO service_role;

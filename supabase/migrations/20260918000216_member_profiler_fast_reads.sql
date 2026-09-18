-- 0216 — The profiler's two helper reads, made cheap.
--
-- Why: 0215's sia.profiler_due_groups counted every unread message in every linked group
-- (a heap read per message across ~150,000 rows) and hit the 8-second statement timeout on
-- its first production call. It never needed the count: "is there anything newer than the
-- cursor" is ONE descent of idx_wag_messages_chat_time per group. And
-- sia.profiler_broad_senders counted distinct groups per sender over the whole message
-- table, when sia.wag_group_members already holds exactly that relation in a few thousand rows.
--
-- The return shape of profiler_due_groups changes (the `pending` count is gone), which needs
-- a DROP; nothing else reads these functions (they shipped an hour ago, the switch is off).

DROP FUNCTION IF EXISTS sia.profiler_due_groups(integer);
CREATE FUNCTION sia.profiler_due_groups(p_limit integer DEFAULT 50)
RETURNS TABLE (group_jid text, member_id uuid, cursor_at timestamptz, newest_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = sia, pg_temp AS $$
  SELECT g.group_jid, g.member_id, s.last_message_at, x.newest_at
  FROM sia.wag_groups g
  LEFT JOIN sia.profiler_group_state s ON s.group_jid = g.group_jid
  JOIN LATERAL (
    SELECT m.wa_timestamp AS newest_at
    FROM sia.wag_messages m
    WHERE m.chat_jid = g.group_jid
    ORDER BY m.wa_timestamp DESC
    LIMIT 1
  ) x ON x.newest_at > COALESCE(s.last_message_at, '-infinity'::timestamptz)
  WHERE g.member_id IS NOT NULL AND g.group_kind = 'member' AND g.is_active
  ORDER BY x.newest_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION sia.profiler_broad_senders(p_min_groups integer DEFAULT 6)
RETURNS TABLE (sender_jid text, groups integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = sia, pg_temp AS $$
  SELECT gm.member_jid, count(DISTINCT gm.group_jid)::integer
  FROM sia.wag_group_members gm
  JOIN sia.wag_groups g ON g.group_jid = gm.group_jid
  WHERE g.member_id IS NOT NULL
  GROUP BY gm.member_jid
  HAVING count(DISTINCT gm.group_jid) >= p_min_groups;
$$;

REVOKE ALL ON FUNCTION sia.profiler_due_groups(integer)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sia.profiler_broad_senders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.profiler_due_groups(integer)    TO service_role;
GRANT EXECUTE ON FUNCTION sia.profiler_broad_senders(integer) TO service_role;

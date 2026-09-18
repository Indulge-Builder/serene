-- 0220 — The profiler reads the longest-waiting group first.
--
-- Why: sia.profiler_due_groups (0216/0218) ordered by newest message, newest first, and the sweep
-- takes the first N. The most recently active groups are exactly the ones already read: their
-- only "unread" chat is a conversation still in progress, which the sweep rightly leaves alone.
-- So as the history read went on, the first N filled with groups that had nothing to give, and
-- the groups that had never been started waited behind them. Measured 2026-09-18 14:30 UTC:
-- 85 groups started, 304 still due, and runs reading 1 to 3 groups where 3 at a time was possible.
--
-- What: order by the bookmark, oldest first, never-started groups before all. A group just read
-- goes to the back; the one that has waited longest is next. Fair during the history read and
-- after it. Same arguments and return shape, so CREATE OR REPLACE is enough.

CREATE OR REPLACE FUNCTION sia.profiler_due_groups(p_limit integer DEFAULT 50, p_statuses text[] DEFAULT ARRAY['Active'])
RETURNS TABLE (group_jid text, member_id uuid, cursor_at timestamptz, newest_at timestamptz, fail_count integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = sia, pg_temp AS $$
  SELECT g.group_jid, g.member_id, s.last_message_at, x.newest_at, COALESCE(s.fail_count, 0)
  FROM sia.wag_groups g
  JOIN member.members mm ON mm.id = g.member_id
   AND (p_statuses IS NULL OR mm.membership_status = ANY (p_statuses))
  LEFT JOIN sia.profiler_group_state s ON s.group_jid = g.group_jid
  JOIN LATERAL (
    SELECT m.wa_timestamp AS newest_at
    FROM sia.wag_messages m
    WHERE m.chat_jid = g.group_jid
    ORDER BY m.wa_timestamp DESC
    LIMIT 1
  ) x ON x.newest_at > COALESCE(s.last_message_at, '-infinity'::timestamptz)
  WHERE g.member_id IS NOT NULL AND g.group_kind = 'member' AND g.is_active
  ORDER BY s.last_message_at ASC NULLS FIRST, x.newest_at DESC
  LIMIT p_limit;
$$;

NOTIFY pgrst, 'reload schema';

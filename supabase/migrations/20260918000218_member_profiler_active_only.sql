-- 0218 — The member profiler reads only the members we are serving, and cannot get stuck.
--
-- Why (1): the founder approved the pilot on 2026-09-18 and asked for the whole history, but
-- for now only for members whose membership is Active. 0216's sia.profiler_due_groups offered
-- every linked group. Measured that day: 401 linked groups, 281 of them Active members
-- (87,313 text messages), 114 Expired, 6 with no status. The status list is a PARAMETER so
-- widening it later (Expired members, a renewal push) is one constant in
-- src/lib/constants/member-profiler.ts and no migration. NULL means every status.
--
-- Why (2): a reading that fails keeps the group's bookmark where it is, which is right for a
-- blip and wrong for a conversation that fails every time: the group would never move again,
-- and because due groups are ordered newest first it would sit at the head of every run.
-- fail_count counts consecutive failed readings of the SAME conversation; the sweep steps over
-- it at PROFILER_MAX_ATTEMPTS and says so in last_error (the failed runs stay in
-- sia.extraction_runs, so a skipped conversation is always findable). A success resets it.
--
-- The function's arguments change, which needs a DROP (a second overload would make the
-- PostgREST call ambiguous). Only the profiler calls it.

ALTER TABLE sia.profiler_group_state
  ADD COLUMN IF NOT EXISTS fail_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN sia.profiler_group_state.fail_count IS
  'Consecutive failed readings of the conversation right after last_message_at. The sweep steps '
  'over that conversation at PROFILER_MAX_ATTEMPTS. Reset to 0 by any successful reading.';

DROP FUNCTION IF EXISTS sia.profiler_due_groups(integer);
CREATE FUNCTION sia.profiler_due_groups(p_limit integer DEFAULT 50, p_statuses text[] DEFAULT ARRAY['Active'])
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
  ORDER BY x.newest_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION sia.profiler_due_groups(integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.profiler_due_groups(integer, text[]) TO service_role;

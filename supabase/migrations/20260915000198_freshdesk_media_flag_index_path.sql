-- 0198 — flag_threads_for_media: start from the backlog index, not from every ticket
--
-- Why: the 0197 body walked tickets newest-first and asked EXISTS per ticket, which read
-- most of the 50k tickets before finding p_limit with a backlog; it hit the statement
-- timeout once an hour into the copy (2026-09-15 10:17 UTC). Starting from the notes that
-- ARE the backlog (idx_freshdesk_conversations_media_backlog, ~60k rows) and joining the
-- tickets is a few milliseconds. Same result, same signature, same grants.

CREATE OR REPLACE FUNCTION freshdesk.flag_threads_for_media(p_limit integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = freshdesk, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  WITH backlog AS (
    SELECT DISTINCT c.ticket_id
    FROM freshdesk.conversations c
    WHERE c.media_synced_at IS NULL AND (c.attachments <> '[]'::jsonb OR c.body_html LIKE '%<img%')
  ),
  todo AS (
    SELECT t.id
    FROM backlog b
    JOIN freshdesk.tickets t ON t.id = b.ticket_id
    WHERE t.conversations_synced_at IS NOT NULL AND t.deleted = false
    ORDER BY t.fd_updated_at DESC
    LIMIT p_limit
  )
  UPDATE freshdesk.tickets t SET conversations_synced_at = NULL
  FROM todo WHERE t.id = todo.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION freshdesk.flag_threads_for_media(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION freshdesk.flag_threads_for_media(integer) TO service_role;

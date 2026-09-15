-- 0197 — Freshdesk attachments: a durable copy of every file and inline image
--
-- Why: Freshdesk keeps files on its own storage and hands the API a link that expires in
-- hours; the account export carried only names. The mirror had 26,814 notes with files and
-- 36,458 with pasted images, none of them openable from Serene. From now on every thread
-- pull copies the files it sees into a PRIVATE bucket (the whatsapp-media 0141 posture) and
-- keeps the storage path beside the file's name; the page signs a one-hour link on read.
--
-- Also: tickets.attachments (ticket-level files + the description's inline images) and
-- conversations.media_synced_at (NULL = this note's files have not been copied yet), plus
-- two service-role functions the laptop loop uses to work the backlog.

INSERT INTO storage.buckets (id, name, public)
VALUES ('freshdesk-attachments', 'freshdesk-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Defence in depth only: the app reads through admin-client signed urls behind the
-- admin/founder page gate. No user INSERT/UPDATE/DELETE, ever — the sync writes.
DROP POLICY IF EXISTS "fd_attachments_read_admin" ON storage.objects;
CREATE POLICY "fd_attachments_read_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'freshdesk-attachments' AND (SELECT get_user_role()) IN ('admin', 'founder'));

ALTER TABLE freshdesk.tickets
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN freshdesk.tickets.attachments IS
  'Ticket-level files and the description''s inline images, each with storage_path once copied into the freshdesk-attachments bucket.';

ALTER TABLE freshdesk.conversations
  ADD COLUMN IF NOT EXISTS media_synced_at timestamptz;
COMMENT ON COLUMN freshdesk.conversations.media_synced_at IS
  'When this note''s files and inline images were copied into the bucket; NULL = not yet (the backlog).';

-- The backlog: notes with something to copy that has not been copied.
CREATE INDEX IF NOT EXISTS idx_freshdesk_conversations_media_backlog
  ON freshdesk.conversations (ticket_id)
  WHERE media_synced_at IS NULL AND (attachments <> '[]'::jsonb OR body_html LIKE '%<img%');

-- How much is left: distinct tickets and notes still to copy.
CREATE OR REPLACE FUNCTION freshdesk.media_backlog()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = freshdesk, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tickets', (SELECT count(DISTINCT ticket_id) FROM freshdesk.conversations
                WHERE media_synced_at IS NULL AND (attachments <> '[]'::jsonb OR body_html LIKE '%<img%')),
    'conversations', (SELECT count(*) FROM freshdesk.conversations
                WHERE media_synced_at IS NULL AND (attachments <> '[]'::jsonb OR body_html LIKE '%<img%'))
  );
$$;

-- Queue up to p_limit tickets from the backlog for the thread catch-up (the thread pull is
-- the moment Freshdesk hands fresh links). Newest tickets first. Returns how many were queued.
CREATE OR REPLACE FUNCTION freshdesk.flag_threads_for_media(p_limit integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = freshdesk, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  WITH todo AS (
    SELECT t.id
    FROM freshdesk.tickets t
    WHERE t.conversations_synced_at IS NOT NULL
      AND t.deleted = false
      AND EXISTS (
        SELECT 1 FROM freshdesk.conversations c
        WHERE c.ticket_id = t.id AND c.media_synced_at IS NULL
          AND (c.attachments <> '[]'::jsonb OR c.body_html LIKE '%<img%')
      )
    ORDER BY t.fd_updated_at DESC
    LIMIT p_limit
  )
  UPDATE freshdesk.tickets t SET conversations_synced_at = NULL
  FROM todo WHERE t.id = todo.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION freshdesk.media_backlog() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION freshdesk.flag_threads_for_media(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION freshdesk.media_backlog() TO service_role;
GRANT EXECUTE ON FUNCTION freshdesk.flag_threads_for_media(integer) TO service_role;

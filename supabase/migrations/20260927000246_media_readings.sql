-- 0246: Elaya's eyes, step 0 (docs/architecture/media-understanding-plan.md).
--
-- One row per file Serene has stored, whatever it came from, holding what a small model read in
-- it: a one-line summary, what the file IS (class), the words in it, a few structured fields, the
-- cost. Understand once at ingestion; after that every reader stays a text reader.
--
-- Access: service role writes (the sweep on Trigger.dev, the on-demand tool). Admin and founder
-- may SELECT (the settings panel). The analyst door gets a narrow view (never the extracted text,
-- never a sensitive row). Everyone else reads a reading only folded into a message they may
-- already see (sia.wag_messages_read below, service-role like the rest of sia).

CREATE TABLE public.media_readings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text        NOT NULL CHECK (source IN ('sia_media', 'freshdesk_attachment', 'lead_whatsapp', 'hands_media', 'elaya_turn')),
  source_ref      text        NOT NULL,                       -- the source row's id (wag_media.id, "<conversation_id>:<n>", whatsapp_messages.id, hands messages.id)
  bucket          text,                                       -- Supabase Storage bucket, or 's3' for the Sia archive
  path            text        NOT NULL,                       -- storage path or s3://bucket/key; never a public url
  mime            text,
  kind            text        NOT NULL CHECK (kind IN ('image', 'pdf', 'document', 'audio', 'video')),
  size_bytes      bigint,
  status          text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'reading', 'done', 'failed', 'skipped', 'dead')),
  attempts        integer     NOT NULL DEFAULT 0,
  last_error      text,
  -- What the reader said. constants/media.ts MEDIA_CLASSES mirrors the CHECK.
  class           text        CHECK (class IN ('bill_receipt', 'booking_confirm', 'ticket_pass', 'itinerary', 'menu_catalog', 'product_photo', 'place_photo', 'person_photo', 'screenshot_chat', 'screenshot_app', 'form_document', 'id_document', 'payment_card', 'bank_statement', 'qr_payment', 'sticker_meme', 'voice_note', 'other')),
  sensitive       boolean     NOT NULL DEFAULT false,         -- id / card / statement: described, never transcribed
  summary         text,                                       -- ONE line, what a teammate would say
  description     text,
  extracted_text  text,                                       -- OCR or transcript; NULL when sensitive
  fields          jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- amount_inr, currency, date, merchant, booking_ref, from, to, people_count ...
  language        text,
  confidence      numeric(3,2),
  model           text,
  prompt_version  text,
  input_tokens    integer,
  output_tokens   integer,
  cost_usd        numeric(10,5),
  duration_ms     integer,
  -- The past: a reading that landed after the profiler already read that conversation is
  -- re-profiled once (the redo pass); reprofiled_at marks it so.
  reprofiled_at   timestamptz,
  -- Where the file sits in a conversation, so the fold and the redo pass need no second lookup.
  context         jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- sia: {group_jid, wa_message_id, member_id, at}; freshdesk: {ticket_id, conversation_id, at}
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz,
  UNIQUE (source, source_ref)
);

CREATE INDEX idx_media_readings_queue ON public.media_readings (created_at DESC) WHERE status = 'queued';
CREATE INDEX idx_media_readings_redo  ON public.media_readings ((context->>'group_jid'), read_at) WHERE status = 'done' AND reprofiled_at IS NULL AND source = 'sia_media';
CREATE INDEX idx_media_readings_spend ON public.media_readings (read_at) WHERE cost_usd IS NOT NULL;

COMMENT ON TABLE public.media_readings IS
  'Elaya''s eyes (0246): one row per stored file, what a small model read in it. Understand once; every reader stays a text reader. sensitive = described never transcribed. Service role writes.';

ALTER TABLE public.media_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_readings_select_admin ON public.media_readings
  FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));
GRANT SELECT ON public.media_readings TO authenticated;
GRANT ALL ON public.media_readings TO service_role;

-- ── The fold, in SQL: a Sia message with its reading as text ────────────────
-- Every text reader of sia.wag_messages (the profiler, the intake, the ticket draft, Elaya's
-- member messages) reads THIS instead. `text` is the caption plus the reading line, or the
-- reading line alone, or NULL when the file has not been read yet (the reader then skips it as it
-- always did, and the redo pass brings it back once the reading lands). Same columns as the table
-- plus reading_id / reading_class / reading_summary, so a select list needs no change.
CREATE VIEW sia.wag_messages_read WITH (security_invoker = true) AS
  SELECT m.*,
         r.id            AS reading_id,
         r.class         AS reading_class,
         r.summary       AS reading_summary,
         CASE
           WHEN r.id IS NULL THEN m.text
           WHEN r.status <> 'done' OR r.summary IS NULL THEN m.text
           ELSE nullif(concat_ws(E'\n',
                  nullif(m.text, ''),
                  '[' || CASE m.type WHEN 'voice' THEN 'voice note' WHEN 'audio' THEN 'audio' WHEN 'video' THEN 'video' WHEN 'document' THEN 'file' WHEN 'sticker' THEN 'sticker' ELSE 'image' END
                      || ': ' || r.summary
                      || CASE WHEN r.sensitive OR r.extracted_text IS NULL OR r.kind IN ('audio', 'video') THEN ''
                              ELSE ' | text: ' || left(regexp_replace(r.extracted_text, '\s+', ' ', 'g'), 600) END
                      || CASE WHEN r.kind IN ('audio', 'video') AND r.extracted_text IS NOT NULL THEN ' | said: ' || left(regexp_replace(r.extracted_text, '\s+', ' ', 'g'), 900) ELSE '' END
                      || ']'), '')
         END AS text_read
  FROM sia.wag_messages m
  LEFT JOIN sia.wag_media md ON md.chat_jid = m.chat_jid AND md.wa_message_id = m.wa_message_id AND md.sender_jid = m.sender_jid
  LEFT JOIN public.media_readings r ON r.source = 'sia_media' AND r.source_ref = md.id::text;
COMMENT ON VIEW sia.wag_messages_read IS
  'wag_messages with the file''s reading folded into text_read (0246). Readers select text_read AS text. Service role, like every sia working table.';
GRANT SELECT ON sia.wag_messages_read TO service_role;

-- ── The analyst door: summaries and fields, never the words in a sensitive file ─
CREATE VIEW elaya_read.media_readings AS
  SELECT id AS reading_id, source, kind, class, sensitive, summary, fields, confidence, language,
         (context->>'group_jid') AS group_jid, nullif(context->>'member_id', '')::uuid AS member_id,
         nullif(context->>'ticket_id', '')::bigint AS freshdesk_ticket_id,
         (context->>'at')::timestamptz AS sent_at, read_at
  FROM public.media_readings
  WHERE status = 'done';
COMMENT ON VIEW elaya_read.media_readings IS
  'What Serene read in each image, file, voice note or video (0246). class: bill_receipt/booking_confirm/ticket_pass/itinerary/menu_catalog/product_photo/place_photo/person_photo/screenshot_chat/screenshot_app/form_document/qr_payment/sticker_meme/voice_note/other (id_document/payment_card/bank_statement are sensitive: summary only). fields: amount_inr, merchant, date, booking_ref... group_jid -> whatsapp_groups, member_id -> members, freshdesk_ticket_id -> freshdesk_tickets. Never the text of a sensitive file.';
GRANT SELECT ON elaya_read.media_readings TO elaya_reader;

-- ── Settings: ship OFF, a daily cap for the backlog ─────────────────────────
INSERT INTO public.elaya_settings (key, value) VALUES ('media_reading_enabled', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.elaya_settings (key, value) VALUES ('media_reading_daily_cap_usd', '15'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.elaya_settings (key, value) VALUES ('media_reading_backlog_enabled', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;

-- ── The bucket for files shown to Elaya in a turn (live eyes, step 4) ───────
INSERT INTO storage.buckets (id, name, public)
VALUES ('elaya-turns', 'elaya-turns', false)
ON CONFLICT (id) DO NOTHING;

-- ── The queue in SQL: find stored files with no reading, claim a batch ───────
-- Enqueueing is an anti-join the database does in one statement; the sweep only calls these.
-- Service role only (the revoked tier, Q-13).

CREATE FUNCTION public.media_enqueue_sia(p_limit integer DEFAULT 500, p_newest_first boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, sia, member AS $$
DECLARE n integer;
BEGIN
  WITH cand AS (
    SELECT md.id, md.mime, md.media_type, md.size_bytes, md.storage_path, md.created_at,
           m.wa_timestamp, m.chat_jid, m.wa_message_id, g.member_id
    FROM sia.wag_media md
    JOIN sia.wag_messages m ON m.chat_jid = md.chat_jid AND m.wa_message_id = md.wa_message_id AND m.sender_jid = md.sender_jid
    JOIN sia.wag_groups g ON g.group_jid = md.chat_jid
    LEFT JOIN public.media_readings r ON r.source = 'sia_media' AND r.source_ref = md.id::text
    WHERE md.download_status = 'done' AND md.storage_path IS NOT NULL
      AND g.group_kind = 'member' AND g.member_id IS NOT NULL
      AND md.media_type IN ('image', 'video', 'audio', 'voice', 'document')
      AND r.id IS NULL
    ORDER BY CASE WHEN p_newest_first THEN m.wa_timestamp END DESC NULLS LAST, m.wa_timestamp ASC
    LIMIT p_limit
  )
  INSERT INTO public.media_readings (source, source_ref, bucket, path, mime, kind, size_bytes, context)
  SELECT 'sia_media', c.id::text, 's3', c.storage_path, c.mime,
         CASE c.media_type WHEN 'image' THEN 'image' WHEN 'video' THEN 'video' WHEN 'audio' THEN 'audio' WHEN 'voice' THEN 'audio'
                           WHEN 'document' THEN CASE WHEN c.mime = 'application/pdf' THEN 'pdf' ELSE 'document' END ELSE 'document' END,
         c.size_bytes,
         jsonb_build_object('group_jid', c.chat_jid, 'wa_message_id', c.wa_message_id, 'member_id', c.member_id, 'at', c.wa_timestamp)
  FROM cand c
  ON CONFLICT (source, source_ref) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION public.media_enqueue_freshdesk(p_limit integer DEFAULT 500, p_newest_first boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, freshdesk AS $$
DECLARE n integer;
BEGIN
  WITH cand AS (
    SELECT c.id AS conversation_id, c.ticket_id, c.fd_created_at, a.ord, a.att
    FROM freshdesk.conversations c
    CROSS JOIN LATERAL jsonb_array_elements(c.attachments) WITH ORDINALITY AS a(att, ord)
    LEFT JOIN public.media_readings r ON r.source = 'freshdesk_attachment' AND r.source_ref = c.id::text || ':' || a.ord::text
    WHERE a.att->>'storage_path' IS NOT NULL
      AND (a.att->>'content_type' LIKE 'image/%' OR a.att->>'content_type' = 'application/pdf'
           OR a.att->>'content_type' LIKE 'audio/%' OR a.att->>'content_type' LIKE 'video/%')
      AND r.id IS NULL
    ORDER BY CASE WHEN p_newest_first THEN c.fd_created_at END DESC NULLS LAST, c.fd_created_at ASC
    LIMIT p_limit
  )
  INSERT INTO public.media_readings (source, source_ref, bucket, path, mime, kind, size_bytes, context)
  SELECT 'freshdesk_attachment', c.conversation_id::text || ':' || c.ord::text, 'freshdesk-attachments', c.att->>'storage_path', c.att->>'content_type',
         CASE WHEN c.att->>'content_type' LIKE 'image/%' THEN 'image' WHEN c.att->>'content_type' = 'application/pdf' THEN 'pdf'
              WHEN c.att->>'content_type' LIKE 'audio/%' THEN 'audio' WHEN c.att->>'content_type' LIKE 'video/%' THEN 'video' ELSE 'document' END,
         nullif(c.att->>'size', '')::bigint,
         jsonb_build_object('ticket_id', c.ticket_id, 'conversation_id', c.conversation_id, 'at', c.fd_created_at)
  FROM cand c
  ON CONFLICT (source, source_ref) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Claim a batch: queued -> reading, atomically, newest file first. p_live_only limits the claim to
-- files sent in the last p_live_hours (the live lane); false claims the backlog (older files).
CREATE FUNCTION public.media_claim(p_limit integer, p_live_only boolean, p_live_hours integer DEFAULT 24)
RETURNS SETOF public.media_readings
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.media_readings r
  SET status = 'reading', attempts = r.attempts + 1
  WHERE r.id IN (
    SELECT id FROM public.media_readings
    WHERE status = 'queued'
      AND (CASE WHEN p_live_only THEN coalesce((context->>'at')::timestamptz, created_at) >= now() - make_interval(hours => p_live_hours)
                ELSE coalesce((context->>'at')::timestamptz, created_at) <  now() - make_interval(hours => p_live_hours) END)
    ORDER BY coalesce((context->>'at')::timestamptz, created_at) DESC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING r.*;
$$;

-- A claim that never finished (the run died) goes back to the queue after an hour.
CREATE FUNCTION public.media_release_stale(p_minutes integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.media_readings SET status = 'queued'
  WHERE status = 'reading' AND coalesce(read_at, created_at) < now() - make_interval(mins => p_minutes)
    AND attempts < 3;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.media_enqueue_sia(integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_enqueue_freshdesk(integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_claim(integer, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_release_stale(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_enqueue_sia(integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.media_enqueue_freshdesk(integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.media_claim(integer, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.media_release_stale(integer) TO service_role;

-- The redo pass: which member conversations gained an informative reading since the profiler read them.
CREATE FUNCTION public.media_redo_groups(p_limit integer DEFAULT 30, p_statuses text[] DEFAULT ARRAY['Active'])
RETURNS TABLE (group_jid text, member_id uuid, first_at timestamptz, last_at timestamptz, readings integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, sia, member AS $$
  SELECT r.context->>'group_jid', (r.context->>'member_id')::uuid,
         min((r.context->>'at')::timestamptz), max((r.context->>'at')::timestamptz), count(*)::integer
  FROM public.media_readings r
  JOIN member.members mm ON mm.id = (r.context->>'member_id')::uuid AND (p_statuses IS NULL OR mm.membership_status = ANY (p_statuses))
  JOIN sia.profiler_group_state s ON s.group_jid = r.context->>'group_jid'
  WHERE r.source = 'sia_media' AND r.status = 'done' AND r.reprofiled_at IS NULL
    AND r.class IN ('bill_receipt', 'booking_confirm', 'ticket_pass', 'itinerary', 'menu_catalog', 'product_photo', 'place_photo', 'screenshot_chat', 'screenshot_app', 'form_document', 'voice_note')
    AND (r.context->>'at')::timestamptz <= s.last_message_at   -- the profiler already passed this moment
  GROUP BY 1, 2
  ORDER BY max(r.read_at) ASC
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.media_redo_groups(integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_redo_groups(integer, text[]) TO service_role;

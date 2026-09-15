-- 0200 — the ticket board, the ticket settings, and tags
--
-- Three small things the team asked for after T1/T2 (founder, 2026-09-15):
--   * a LIVE board: sia.tickets joins the Realtime publication so the board re-reads on any
--     change (RLS still decides who sees a row — the queendom, admin, founder);
--   * SETTINGS the founder edits without a deploy: sia.ticket_settings (key → jsonb): the
--     status labels shown in the app (the state MACHINE stays in code and in the CHECK) and
--     the tag vocabulary. Readable by every signed-in user; written only by the admin-gated
--     action on the service role. ticket_sla_policies already has that posture.
--   * TAGS on a ticket: sia.tickets.tags text[] (+ GIN), settable through apply_ticket_change
--     like every other column, so a tag change is an event in the diary too.

ALTER TABLE sia.tickets ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_sia_tickets_tags ON sia.tickets USING gin (tags);

CREATE TABLE IF NOT EXISTS sia.ticket_settings (
  key         text        PRIMARY KEY,           -- status_labels | tags
  value       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sia.ticket_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sia_ticket_settings_select ON sia.ticket_settings;
CREATE POLICY sia_ticket_settings_select ON sia.ticket_settings FOR SELECT TO authenticated USING (true);
GRANT SELECT ON sia.ticket_settings TO authenticated;
GRANT ALL ON sia.ticket_settings TO service_role;
INSERT INTO sia.ticket_settings (key, value) VALUES
  ('status_labels', '{}'::jsonb),
  ('tags', '["vip", "urgent-client", "vendor-issue", "payment-pending", "gift", "travel", "repeat"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- apply_ticket_change learns `tags` (the 0195 body, one line added; the RPC has never changed
-- behaviour otherwise — same signature, same grants).
CREATE OR REPLACE FUNCTION sia.apply_ticket_change(p_ticket_id uuid, p_patch jsonb, p_event jsonb)
RETURNS sia.tickets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = sia, public AS $$
DECLARE
  v_row sia.tickets;
BEGIN
  UPDATE sia.tickets SET
    status                = COALESCE(p_patch->>'status', status),
    priority              = COALESCE(p_patch->>'priority', priority),
    priority_approved_at  = CASE WHEN p_patch ? 'priority_approved_at' THEN NULLIF(p_patch->>'priority_approved_at', '')::timestamptz ELSE priority_approved_at END,
    priority_approved_by  = CASE WHEN p_patch ? 'priority_approved_by' THEN NULLIF(p_patch->>'priority_approved_by', '')::uuid ELSE priority_approved_by END,
    assignee_id           = CASE WHEN p_patch ? 'assignee_id' THEN NULLIF(p_patch->>'assignee_id', '')::uuid ELSE assignee_id END,
    bishop_id             = CASE WHEN p_patch ? 'bishop_id' THEN NULLIF(p_patch->>'bishop_id', '')::uuid ELSE bishop_id END,
    title                 = COALESCE(p_patch->>'title', title),
    category              = COALESCE(p_patch->>'category', category),
    sub_category          = CASE WHEN p_patch ? 'sub_category' THEN NULLIF(p_patch->>'sub_category', '') ELSE sub_category END,
    item                  = CASE WHEN p_patch ? 'item' THEN NULLIF(p_patch->>'item', '') ELSE item END,
    brief                 = COALESCE(p_patch->'brief', brief),
    checklist             = COALESCE(p_patch->'checklist', checklist),
    money                 = COALESCE(p_patch->'money', money),
    tags                  = CASE WHEN p_patch ? 'tags' THEN COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_patch->'tags') AS x), '{}'::text[]) ELSE tags END,
    summary               = CASE WHEN p_patch ? 'summary' THEN NULLIF(p_patch->>'summary', '') ELSE summary END,
    requested_for         = CASE WHEN p_patch ? 'requested_for' THEN NULLIF(p_patch->>'requested_for', '')::timestamptz ELSE requested_for END,
    first_response_due_at = CASE WHEN p_patch ? 'first_response_due_at' THEN NULLIF(p_patch->>'first_response_due_at', '')::timestamptz ELSE first_response_due_at END,
    next_update_due_at    = CASE WHEN p_patch ? 'next_update_due_at' THEN NULLIF(p_patch->>'next_update_due_at', '')::timestamptz ELSE next_update_due_at END,
    resolve_due_at        = CASE WHEN p_patch ? 'resolve_due_at' THEN NULLIF(p_patch->>'resolve_due_at', '')::timestamptz ELSE resolve_due_at END,
    first_responded_at    = CASE WHEN p_patch ? 'first_responded_at' THEN NULLIF(p_patch->>'first_responded_at', '')::timestamptz ELSE first_responded_at END,
    last_client_update_at = CASE WHEN p_patch ? 'last_client_update_at' THEN NULLIF(p_patch->>'last_client_update_at', '')::timestamptz ELSE last_client_update_at END,
    handoff_department    = CASE WHEN p_patch ? 'handoff_department' THEN NULLIF(p_patch->>'handoff_department', '') ELSE handoff_department END,
    vendor_id             = CASE WHEN p_patch ? 'vendor_id' THEN NULLIF(p_patch->>'vendor_id', '')::uuid ELSE vendor_id END,
    closed_at             = CASE WHEN p_patch ? 'closed_at' THEN NULLIF(p_patch->>'closed_at', '')::timestamptz ELSE closed_at END,
    resolution            = CASE WHEN p_patch ? 'resolution' THEN NULLIF(p_patch->>'resolution', '') ELSE resolution END,
    satisfaction          = CASE WHEN p_patch ? 'satisfaction' THEN NULLIF(p_patch->>'satisfaction', '')::smallint ELSE satisfaction END,
    sentinel_state        = COALESCE(p_patch->'sentinel_state', sentinel_state),
    next_wake_at          = CASE WHEN p_patch ? 'next_wake_at' THEN NULLIF(p_patch->>'next_wake_at', '')::timestamptz ELSE next_wake_at END,
    wake_reason           = CASE WHEN p_patch ? 'wake_reason' THEN NULLIF(p_patch->>'wake_reason', '') ELSE wake_reason END
  WHERE id = p_ticket_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ticket % not found', p_ticket_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO sia.ticket_events (ticket_id, client_id, queendom_id, actor_kind, actor_id, event_type, body, meta, run_id)
  VALUES (v_row.id, v_row.client_id, v_row.queendom_id,
          COALESCE(p_event->>'actor_kind', 'human'), NULLIF(p_event->>'actor_id', '')::uuid,
          COALESCE(p_event->>'event_type', 'observation'), p_event->>'body', COALESCE(p_event->'meta', '{}'::jsonb),
          NULLIF(p_event->>'run_id', '')::uuid);
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION sia.apply_ticket_change(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.apply_ticket_change(uuid, jsonb, jsonb) TO service_role;

-- The live board: tickets on the Realtime publication (the 0159 activity_events guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'sia' AND tablename = 'tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sia.tickets;
  END IF;
END $$;

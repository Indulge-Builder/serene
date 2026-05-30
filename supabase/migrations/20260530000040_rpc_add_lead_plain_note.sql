-- Migration 0040: add_lead_plain_note RPC
-- Wraps manual note insert (no call outcome) in a single transaction.
-- Access control stays in the action layer — this function is SECURITY DEFINER
-- and trusts the caller has already verified access.

CREATE OR REPLACE FUNCTION add_lead_plain_note(
  p_lead_id    uuid,
  p_author_id  uuid,
  p_content    text,
  p_now        timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id  uuid;
BEGIN
  -- Verify lead exists
  IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- Insert note with no call outcome (append-only — A-11)
  INSERT INTO lead_notes (lead_id, author_id, content, call_outcome)
  VALUES (p_lead_id, p_author_id, p_content, NULL)
  RETURNING id INTO v_note_id;

  -- Update last_activity_at on the lead
  UPDATE leads
     SET last_activity_at = p_now
   WHERE id = p_lead_id;

  -- Log note_added activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'note_added',
    jsonb_build_object('manual', true)
  );

  RETURN jsonb_build_object('note_id', v_note_id);
END;
$$;

GRANT EXECUTE ON FUNCTION add_lead_plain_note(uuid, uuid, text, timestamptz) TO authenticated;

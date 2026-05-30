-- Migration 0030: add_lead_call_note RPC
-- Wraps all DB writes for addLeadCallNote in a single transaction.
-- Access control stays in the action layer — this function is SECURITY DEFINER
-- and trusts that the caller has already verified access.
-- Pattern: multi-write actions use SECURITY DEFINER RPCs for atomicity and
-- a single DB round-trip. Never add access-control logic inside this function.

CREATE OR REPLACE FUNCTION add_lead_call_note(
  p_lead_id      uuid,
  p_author_id    uuid,
  p_content      text,
  p_call_outcome text,
  p_now          timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status          text;
  v_call_count      int;
  v_assigned_to     uuid;
  v_domain          text;
  v_new_call_count  int;
  v_auto_advance    boolean;
  v_note_id         uuid;
BEGIN
  -- 1. Fetch current lead state
  SELECT status, call_count, assigned_to, domain
    INTO v_status, v_call_count, v_assigned_to, v_domain
    FROM leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- 2. Insert note (append-only — A-11)
  INSERT INTO lead_notes (lead_id, author_id, content, call_outcome)
  VALUES (p_lead_id, p_author_id, p_content, p_call_outcome)
  RETURNING id INTO v_note_id;

  -- 3. Compute derived values
  v_new_call_count := COALESCE(v_call_count, 0) + 1;
  v_auto_advance   := (v_status = 'new');

  -- 4. Single UPDATE on leads: call_count, last_call_outcome, last_activity_at,
  --    and conditionally status + status_changed_at (all in one statement)
  UPDATE leads
     SET call_count        = v_new_call_count,
         last_call_outcome = p_call_outcome,
         last_activity_at  = p_now,
         status            = CASE WHEN v_auto_advance THEN 'touched' ELSE status END,
         status_changed_at = CASE WHEN v_auto_advance THEN p_now ELSE status_changed_at END
   WHERE id = p_lead_id;

  -- 5. Log call_logged activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'call_logged',
    jsonb_build_object('outcome', p_call_outcome, 'call_count', v_new_call_count)
  );

  -- 6. Log note_added activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'note_added',
    jsonb_build_object('call_outcome', p_call_outcome)
  );

  -- 7. Conditionally log status_changed activity (new → touched only)
  IF v_auto_advance THEN
    INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
    VALUES (
      p_lead_id,
      p_author_id,
      'status_changed',
      jsonb_build_object('old_status', 'new', 'new_status', 'touched')
    );
  END IF;

  -- 8. Return data the action layer needs for SLA side-effects
  RETURN jsonb_build_object(
    'note_id',          v_note_id,
    'new_call_count',   v_new_call_count,
    'did_auto_advance', v_auto_advance,
    'assigned_to',      v_assigned_to,
    'domain',           v_domain,
    'old_status',       v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_lead_call_note(uuid, uuid, text, text, timestamptz) TO authenticated;

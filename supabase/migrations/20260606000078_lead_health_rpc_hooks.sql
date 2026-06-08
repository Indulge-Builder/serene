-- Migration 078: patch the three lead-mutating RPCs to set lead_health on every write.
-- Only the UPDATE leads statement changes in each function — all signatures, params,
-- return shapes, SECURITY DEFINER, search_path, and GRANT are preserved exactly.
--
-- add_lead_call_note  → lead_health = 'healthy'       (a call just happened)
-- add_lead_plain_note → lead_health = 'healthy'       (team activity = healthy)
-- update_lead_status  → NULL when terminal, else 'healthy'

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. add_lead_call_note
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- 4. Single UPDATE on leads — a call just happened, lead is definitively healthy.
  UPDATE leads
     SET call_count        = v_new_call_count,
         last_call_outcome = p_call_outcome,
         last_activity_at  = p_now,
         lead_health       = 'healthy',
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. add_lead_plain_note
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Update last_activity_at and set lead_health to healthy (team activity = healthy)
  UPDATE leads
     SET last_activity_at = p_now,
         lead_health      = 'healthy'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. update_lead_status
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_lead_status(
  p_lead_id  uuid,
  p_actor_id uuid,
  p_status   text,
  p_reason   text        DEFAULT NULL,
  p_now      timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status  text;
  v_assigned_to uuid;
  v_domain      text;
  v_first_name  text;
  v_last_name   text;
  v_task_id     uuid;
  v_details     jsonb;
BEGIN
  -- 1. Fetch current lead state
  SELECT status, assigned_to, domain, first_name, last_name
    INTO v_old_status, v_assigned_to, v_domain, v_first_name, v_last_name
    FROM leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- 2. Early return if status unchanged
  IF v_old_status = p_status THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  -- 3. Update lead: status, status_changed_at, last_activity_at, lead_health.
  --    Terminal statuses (won/lost/junk) → NULL (health is meaningless for closed leads).
  --    Active status transitions → 'healthy' (status just changed = agent is engaged).
  UPDATE leads
     SET status            = p_status,
         status_changed_at = p_now,
         last_activity_at  = p_now,
         resolution_reason = CASE
                               WHEN p_status IN ('junk', 'lost') THEN p_reason
                               WHEN p_status = 'in_discussion'   THEN NULL  -- revive clears reason
                               ELSE resolution_reason
                             END,
         lead_health       = CASE
                               WHEN p_status IN ('won', 'lost', 'junk') THEN NULL
                               ELSE 'healthy'
                             END
   WHERE id = p_lead_id;

  -- 4. Build activity details (include reason if provided)
  v_details := jsonb_build_object('old_status', v_old_status, 'new_status', p_status);
  IF p_reason IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('reason', p_reason);
  END IF;

  -- 5. Log status_changed activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (p_lead_id, p_actor_id, 'status_changed', v_details);

  -- 6. Nurturing: auto-create follow-up task + task_gia_meta (3 months out)
  IF p_status = 'nurturing' THEN
    INSERT INTO tasks (
      assigned_to,
      created_by,
      module,
      task_type,
      status,
      due_at,
      title,
      task_category
    )
    VALUES (
      COALESCE(v_assigned_to, p_actor_id),
      p_actor_id,
      'gia',
      'other',
      'to_do',
      p_now + INTERVAL '3 months',
      'Nurturing follow-up',
      'gia_followup'
    )
    RETURNING id INTO v_task_id;

    INSERT INTO task_gia_meta (task_id, lead_id, call_outcome)
    VALUES (v_task_id, p_lead_id, NULL);
  END IF;

  -- 7. Return data the action layer needs for notifications and SLA side-effects
  RETURN jsonb_build_object(
    'changed',      true,
    'old_status',   v_old_status,
    'new_status',   p_status,
    'assigned_to',  v_assigned_to,
    'domain',       v_domain,
    'first_name',   v_first_name,
    'last_name',    v_last_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_lead_status(uuid, uuid, text, text, timestamptz) TO authenticated;

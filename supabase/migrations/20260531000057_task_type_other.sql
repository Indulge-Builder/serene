-- Migration 0057: task_type vocabulary — retire email + general_follow_up in favour of other
-- Backfills existing rows; nurturing auto-task in update_lead_status uses 'other'.

UPDATE tasks
   SET task_type = 'other'
 WHERE task_type IN ('email', 'general_follow_up');

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
  SELECT status, assigned_to, domain, first_name, last_name
    INTO v_old_status, v_assigned_to, v_domain, v_first_name, v_last_name
    FROM leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  IF v_old_status = p_status THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  UPDATE leads
     SET status            = p_status,
         status_changed_at = p_now,
         last_activity_at  = p_now
   WHERE id = p_lead_id;

  v_details := jsonb_build_object('old_status', v_old_status, 'new_status', p_status);
  IF p_reason IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('reason', p_reason);
  END IF;

  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (p_lead_id, p_actor_id, 'status_changed', v_details);

  IF p_status = 'nurturing' THEN
    INSERT INTO tasks (
      title,
      assigned_to,
      created_by,
      module,
      task_type,
      task_category,
      status,
      due_at
    )
    VALUES (
      'Nurturing follow-up',
      COALESCE(v_assigned_to, p_actor_id),
      p_actor_id,
      'gia',
      'other',
      'gia_followup',
      'to_do',
      p_now + INTERVAL '3 months'
    )
    RETURNING id INTO v_task_id;

    INSERT INTO task_gia_meta (task_id, lead_id, call_outcome)
    VALUES (v_task_id, p_lead_id, NULL);
  END IF;

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

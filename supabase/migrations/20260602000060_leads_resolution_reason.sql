-- Migration 0060: leads.resolution_reason column + updated update_lead_status RPC
-- Adds a resolution_reason text column to leads.
-- Updates the update_lead_status RPC to persist p_reason into the column.
-- Revive path (in_discussion): sets resolution_reason = NULL.
-- Note: p_reason was already passed to lead_activities.details — this adds column persistence.
-- Access control stays in the action layer. Surgical RPC addition only — no restructuring.

-- 1. Add column (nullable — existing rows default to NULL)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS resolution_reason TEXT;

-- 2. Partial index for junk/lost lookups (archived leads excluded)
CREATE INDEX IF NOT EXISTS idx_leads_resolution_reason
  ON leads(resolution_reason)
  WHERE status IN ('junk', 'lost') AND archived_at IS NULL;

-- 3. Update the RPC — surgical addition: persist p_reason to column after the status UPDATE.
--    Revive (in_discussion) clears the column. All other logic is unchanged.
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

  -- 3. Update lead: status, status_changed_at, last_activity_at
  UPDATE leads
     SET status            = p_status,
         status_changed_at = p_now,
         last_activity_at  = p_now
   WHERE id = p_lead_id;

  -- 4. Persist resolution_reason to column:
  --    - junk/lost with a reason → write the reason
  --    - in_discussion (revive from junk) → clear it
  --    - p_reason IS NULL and not a revive → no-op (column unchanged)
  IF p_reason IS NOT NULL THEN
    UPDATE leads SET resolution_reason = p_reason WHERE id = p_lead_id;
  ELSIF p_status = 'in_discussion' THEN
    UPDATE leads SET resolution_reason = NULL WHERE id = p_lead_id;
  END IF;

  -- 5. Build activity details (include reason if provided)
  v_details := jsonb_build_object('old_status', v_old_status, 'new_status', p_status);
  IF p_reason IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('reason', p_reason);
  END IF;

  -- 6. Log status_changed activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (p_lead_id, p_actor_id, 'status_changed', v_details);

  -- 7. Nurturing: auto-create follow-up task + task_gia_meta (3 months out)
  --    title is NOT NULL (migration 0017) and task_category must be 'gia_followup'
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

  -- 8. Return data the action layer needs for notifications and SLA side-effects
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

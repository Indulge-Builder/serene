-- Migration 0054: create_lead_gia_task RPC
-- Atomically creates a gia_followup task + task_gia_meta row in one transaction.
-- An orphaned tasks row with no task_gia_meta is invisible on every Gia surface
-- (dashboard widget, lead dossier). This RPC prevents that by wrapping both
-- INSERTs in one transaction.
-- Access control (Zod validation, auth, lead access check) stays in the action layer.
-- Pattern: mirrors add_lead_call_note (migration 0030) two-INSERT-one-transaction shape.

CREATE OR REPLACE FUNCTION create_lead_gia_task(
  p_lead_id      uuid,
  p_assigned_to  uuid,
  p_created_by   uuid,
  p_task_type    text,
  p_title        text,
  p_description  text    DEFAULT NULL,
  p_priority     text    DEFAULT 'normal',
  p_due_at       timestamptz DEFAULT NULL
)
RETURNS SETOF tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  -- 1. Insert the task row
  INSERT INTO tasks (
    assigned_to,
    created_by,
    module,
    task_type,
    title,
    description,
    priority,
    due_at,
    status,
    task_category
  )
  VALUES (
    p_assigned_to,
    p_created_by,
    'gia',
    p_task_type,
    p_title,
    p_description,
    p_priority,
    p_due_at,
    'to_do',
    'gia_followup'
  )
  RETURNING id INTO v_task_id;

  -- 2. Insert the companion task_gia_meta row (same transaction)
  --    A tasks row without a task_gia_meta row is invisible on all Gia surfaces.
  INSERT INTO task_gia_meta (task_id, lead_id)
  VALUES (v_task_id, p_lead_id);

  -- 3. Return the full tasks row so the action can wire up the Trigger.dev reminder
  RETURN QUERY SELECT * FROM tasks WHERE id = v_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_lead_gia_task(uuid, uuid, uuid, text, text, text, text, timestamptz)
  TO authenticated;

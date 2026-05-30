-- Migration 0035: add_task_remark_with_status RPC
-- Collapses the 6 sequential awaits in addTaskRemarkAction (when statusChange
-- is present) into a single DB round-trip.
--
-- SECURITY DEFINER trade-off: the function runs as the function owner (postgres),
-- not the calling user, so RLS on task_remarks and tasks does NOT fire for these
-- writes. The caller's access check (assigned_to / created_by / manager+) is
-- performed explicitly inside this function using auth.uid() — which resolves
-- correctly to the calling session's JWT even under SECURITY DEFINER.
--
-- Access control stays partly in the action layer (Zod validation, getCurrentProfile).
-- The inline auth check here is the second layer (A-09 belt-and-braces), matching
-- the application-layer check that existed in addTaskRemarkAction before this RPC.
--
-- The log_task_changes() trigger fires AFTER UPDATE on tasks — this is correct
-- behaviour. Status changes made through this RPC are still audited.
--
-- task_remarks is append-only (Rule A-11). This function only INSERTs into it.
-- No UPDATE or DELETE on task_remarks ever.
--
-- p_content must already be sanitized before being passed in (sanitizeText() is
-- applied in the action layer). Do NOT add sanitization here — two sanitization
-- points with different behaviour create subtle divergence.

CREATE OR REPLACE FUNCTION add_task_remark_with_status(
  p_task_id      uuid,
  p_author_id    uuid,
  p_content      text,
  p_status_change text DEFAULT NULL
)
RETURNS task_remarks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task         record;
  v_remark       task_remarks;
  v_caller_id    uuid;
  v_has_access   boolean;
BEGIN
  -- 1. Resolve the calling user from the JWT (auth.uid() works under SECURITY DEFINER)
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 2. Fetch task for access check
  SELECT id, assigned_to, created_by, group_id, status
    INTO v_task
    FROM tasks
   WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;

  -- 3. Access check: caller must be assigned_to, created_by, or manager/admin/founder
  --    Mirrors the application-layer check in addTaskRemarkAction (A-09 layer 2).
  SELECT (
    v_task.assigned_to = v_caller_id
    OR v_task.created_by = v_caller_id
    OR (SELECT role FROM profiles WHERE id = v_caller_id) IN ('manager', 'admin', 'founder')
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 4. If a status change is requested, update the task.
  --    completed_at is set only when transitioning to 'completed'.
  --    The log_task_changes() trigger fires on this UPDATE — audit is preserved.
  IF p_status_change IS NOT NULL AND v_task.status != p_status_change THEN
    UPDATE tasks
       SET status       = p_status_change,
           completed_at = CASE
                            WHEN p_status_change = 'completed' THEN now()
                            ELSE NULL
                          END,
           updated_at   = now()
     WHERE id = p_task_id;
  END IF;

  -- 5. Insert remark (append-only — A-11). Returns full row.
  INSERT INTO task_remarks (task_id, author_id, content, status_change)
  VALUES (p_task_id, p_author_id, p_content, p_status_change)
  RETURNING * INTO v_remark;

  RETURN v_remark;
END;
$$;

GRANT EXECUTE ON FUNCTION add_task_remark_with_status(uuid, uuid, text, text) TO authenticated;

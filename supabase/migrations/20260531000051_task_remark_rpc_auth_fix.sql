-- Fix task remark posting: add_task_remark_with_status was called via service-role
-- (createAdminClient), so auth.uid() was always NULL and every insert raised unauthorized.
-- Rule: if you can SELECT the parent task, you can read/post remarks (same visibility).
-- RPC trusts addTaskRemarkAction, which gates on a user-scoped tasks SELECT (RLS).

-- ─────────────────────────────────────────────────────────────
-- tasks SELECT — agents see assignee OR creator rows
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks_agent_select" ON tasks;

CREATE POLICY "tasks_agent_select"
  ON tasks FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND (
      assigned_to = auth.uid()
      OR created_by = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- RPC — trust action-layer auth; no auth.uid() gate
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_task_remark_with_status(
  p_task_id       uuid,
  p_author_id     uuid,
  p_content       text,
  p_status_change text DEFAULT NULL
)
RETURNS task_remarks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task   record;
  v_remark task_remarks;
BEGIN
  SELECT id, status
    INTO v_task
    FROM tasks
   WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;

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

  INSERT INTO task_remarks (task_id, author_id, content, status_change)
  VALUES (p_task_id, p_author_id, p_content, p_status_change)
  RETURNING * INTO v_remark;

  RETURN v_remark;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- task_remarks — mirror tasks visibility (view = post)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "task_remarks_select" ON task_remarks;
DROP POLICY IF EXISTS "task_remarks_insert" ON task_remarks;

CREATE POLICY "task_remarks_select"
  ON task_remarks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_remarks.task_id
        AND (
          t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()
          OR get_user_role() IN ('manager', 'admin', 'founder')
        )
    )
  );

CREATE POLICY "task_remarks_insert"
  ON task_remarks FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_remarks.task_id
        AND (
          t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()
          OR get_user_role() IN ('manager', 'admin', 'founder')
        )
    )
  );

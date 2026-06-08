-- Migration 0094 — explicit tasks INSERT/DELETE policies; document deals write-via-RPC-only intent
--
-- TASKS:
-- Personal tasks may be inserted directly by authenticated users for themselves only.
-- Gia followup and group subtasks are created only via SECURITY DEFINER RPCs
-- (create_lead_gia_task, update_lead_status, add_task_remark_with_status) or
-- service-role adminClient in server actions — no direct INSERT policy for those categories.

-- Personal tasks can be inserted by any authenticated user for themselves only
CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND assigned_to = auth.uid()
    AND task_category = 'personal'
  );

-- Gia followup and group subtasks are created only via SECURITY DEFINER RPCs.
-- No direct INSERT policy for those categories — they are blocked by default.

-- Agents may delete only their own personal tasks (non-terminal status)
CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (
    task_category = 'personal'
    AND created_by = auth.uid()
    AND assigned_to = auth.uid()
    AND status IN ('to_do', 'in_progress')
  );

-- Managers/admin/founder may delete any task
CREATE POLICY tasks_delete_privileged ON public.tasks
  FOR DELETE TO authenticated
  USING (
    (SELECT public.get_user_role()) = ANY (
      ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]
    )
  );

-- DEALS:
-- All deal mutations go through SECURITY DEFINER RPCs (service role / admin client).
-- No direct INSERT/DELETE policies are added for deals — the absence is intentional.
COMMENT ON TABLE public.deals IS
  'All writes via SECURITY DEFINER RPCs only. Direct INSERT/DELETE blocked by
   RLS policy gap — this is intentional. See supabase/migrations/0094.';

-- Migration 0091: leads_update RLS — require archived_at IS NULL
-- Archived leads are immutable via direct UPDATE; un-archive must use SECURITY DEFINER.

DROP POLICY IF EXISTS leads_update ON public.leads;

CREATE POLICY leads_update ON public.leads
  FOR UPDATE
  USING (
    archived_at IS NULL
    AND (
      ((SELECT public.get_user_role()) = 'agent'::public.user_role
        AND assigned_to = auth.uid())
      OR ((SELECT public.get_user_role()) = 'manager'::public.user_role
        AND domain = (SELECT public.get_user_domain()))
      OR (SELECT public.get_user_role()) = ANY (
        ARRAY['admin'::public.user_role, 'founder'::public.user_role]
      )
    )
  );

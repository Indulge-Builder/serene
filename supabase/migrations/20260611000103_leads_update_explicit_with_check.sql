-- Migration 0103 (security audit §1 note): explicit WITH CHECK on leads_update.
--
-- The policy had a USING clause only. PostgreSQL applies USING to the NEW row
-- when WITH CHECK is omitted, so the behaviour was already safe — a manager's
-- new row must still satisfy domain = get_user_domain() (cannot move a lead
-- out of their domain), an agent's new row must still satisfy
-- assigned_to = auth.uid() (cannot reassign away from themselves), and
-- archived rows stay immutable — but only IMPLICITLY. This makes the new-row
-- contract explicit so it self-documents and survives a future edit that adds
-- a column-specific WITH CHECK.
--
-- Body is identical to the USING clause shipped in 0091 (InitPlan-hoist form
-- preserved). Zero behaviour change; DROP + CREATE run in one transaction.

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
  )
  WITH CHECK (
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

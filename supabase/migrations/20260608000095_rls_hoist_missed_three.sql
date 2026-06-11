-- Migration 0095: Complete RLS InitPlan hoist for three policies missed by 0088.
-- Wrap bare public.get_user_role() calls in scalar (SELECT ...) subqueries.

-- 1. wa_notif_logs_admin_founder_select
DROP POLICY IF EXISTS wa_notif_logs_admin_founder_select
  ON public.whatsapp_notification_logs;
CREATE POLICY wa_notif_logs_admin_founder_select
  ON public.whatsapp_notification_logs FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (
      ARRAY['admin'::public.user_role, 'founder'::public.user_role]
    )
  );

-- 2. routing_config_update
DROP POLICY IF EXISTS routing_config_update ON public.agent_routing_config;
CREATE POLICY routing_config_update ON public.agent_routing_config
  FOR UPDATE
  USING (
    (SELECT public.get_user_role()) = ANY (
      ARRAY['manager'::public.user_role, 'admin'::public.user_role,
            'founder'::public.user_role]
    )
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = ANY (
      ARRAY['manager'::public.user_role, 'admin'::public.user_role,
            'founder'::public.user_role]
    )
  );

-- 3. profiles_update — profiles_1 self-join in WITH CHECK unchanged (not a helper call)
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  USING (
    (auth.uid() = id)
    OR (SELECT public.get_user_role()) = ANY (
      ARRAY['admin'::public.user_role, 'founder'::public.user_role]
    )
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = ANY (
      ARRAY['admin'::public.user_role, 'founder'::public.user_role]
    )
    OR (
      auth.uid() = id
      AND role = (
        SELECT profiles_1.role FROM public.profiles profiles_1
        WHERE profiles_1.id = auth.uid()
      )
      AND domain = (
        SELECT profiles_1.domain FROM public.profiles profiles_1
        WHERE profiles_1.id = auth.uid()
      )
    )
  );

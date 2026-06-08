-- Migration 0088: Hoist get_user_role() / get_user_domain() into InitPlan scalar
-- subqueries across RLS policies. STABLE functions wrapped in uncorrelated
-- (SELECT ...) are evaluated once per statement instead of per row.

-- ── leads ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS leads_admin_founder_select ON public.leads;
CREATE POLICY leads_admin_founder_select ON public.leads
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))
    AND (archived_at IS NULL)
  );

DROP POLICY IF EXISTS leads_agent_select ON public.leads;
CREATE POLICY leads_agent_select ON public.leads
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'agent'::public.user_role)
    AND (assigned_to = auth.uid())
    AND (archived_at IS NULL)
  );

DROP POLICY IF EXISTS leads_manager_select ON public.leads;
CREATE POLICY leads_manager_select ON public.leads
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'manager'::public.user_role)
    AND (domain = (SELECT public.get_user_domain()))
    AND (archived_at IS NULL)
  );

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
  FOR UPDATE
  USING (
    (
      ((SELECT public.get_user_role()) = 'agent'::public.user_role)
      AND (assigned_to = auth.uid())
    )
    OR (
      ((SELECT public.get_user_role()) = 'manager'::public.user_role)
      AND (domain = (SELECT public.get_user_domain()))
    )
    OR ((SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))
  );

-- ── lead_notes ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lead_notes_select ON public.lead_notes;
CREATE POLICY lead_notes_select ON public.lead_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_notes.lead_id
        AND (
          (
            ((SELECT public.get_user_role()) = 'agent'::public.user_role)
            AND (l.assigned_to = auth.uid())
          )
          OR (
            ((SELECT public.get_user_role()) = 'manager'::public.user_role)
            AND (l.domain = (SELECT public.get_user_domain()))
          )
          OR ((SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))
        )
        AND (l.archived_at IS NULL)
    )
  );

-- ── lead_activities ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lead_activities_select ON public.lead_activities;
CREATE POLICY lead_activities_select ON public.lead_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_activities.lead_id
        AND (
          (
            ((SELECT public.get_user_role()) = 'agent'::public.user_role)
            AND (l.assigned_to = auth.uid())
          )
          OR (
            ((SELECT public.get_user_role()) = 'manager'::public.user_role)
            AND (l.domain = (SELECT public.get_user_domain()))
          )
          OR ((SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))
        )
        AND (l.archived_at IS NULL)
    )
  );

-- ── lead_sla_timers ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lead_sla_timers_admin_founder_select ON public.lead_sla_timers;
CREATE POLICY lead_sla_timers_admin_founder_select ON public.lead_sla_timers
  FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

DROP POLICY IF EXISTS lead_sla_timers_agent_select ON public.lead_sla_timers;
CREATE POLICY lead_sla_timers_agent_select ON public.lead_sla_timers
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'agent'::public.user_role)
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_sla_timers.lead_id
        AND (l.assigned_to = auth.uid())
        AND (l.archived_at IS NULL)
    )
  );

DROP POLICY IF EXISTS lead_sla_timers_manager_select ON public.lead_sla_timers;
CREATE POLICY lead_sla_timers_manager_select ON public.lead_sla_timers
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'manager'::public.user_role)
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_sla_timers.lead_id
        AND (l.domain = (SELECT public.get_user_domain()))
        AND (l.archived_at IS NULL)
    )
  );

-- ── deals ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS deals_admin_select ON public.deals;
CREATE POLICY deals_admin_select ON public.deals
  FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

DROP POLICY IF EXISTS deals_agent_select ON public.deals;
CREATE POLICY deals_agent_select ON public.deals
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'agent'::public.user_role)
    AND (assigned_to = auth.uid())
  );

DROP POLICY IF EXISTS deals_manager_select ON public.deals;
CREATE POLICY deals_manager_select ON public.deals
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'manager'::public.user_role)
    AND (domain = (SELECT public.get_user_domain()))
  );

-- ── tasks ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tasks_agent_select ON public.tasks;
CREATE POLICY tasks_agent_select ON public.tasks
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'agent'::public.user_role)
    AND ((assigned_to = auth.uid()) OR (created_by = auth.uid()))
  );

DROP POLICY IF EXISTS tasks_manager_admin_founder_select ON public.tasks;
CREATE POLICY tasks_manager_admin_founder_select ON public.tasks
  FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role])
  );

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE
  USING (
    (
      ((SELECT public.get_user_role()) = 'agent'::public.user_role)
      AND (assigned_to = auth.uid())
    )
    OR ((SELECT public.get_user_role()) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))
  );

-- ── task_gia_meta ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS task_gia_meta_select ON public.task_gia_meta;
CREATE POLICY task_gia_meta_select ON public.task_gia_meta
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_gia_meta.task_id
        AND (
          (
            ((SELECT public.get_user_role()) = 'agent'::public.user_role)
            AND (t.assigned_to = auth.uid())
          )
          OR ((SELECT public.get_user_role()) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))
        )
    )
  );

-- ── task_remarks ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS task_remarks_insert ON public.task_remarks;
CREATE POLICY task_remarks_insert ON public.task_remarks
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL)
    AND (author_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_remarks.task_id
        AND (
          (t.assigned_to = auth.uid())
          OR (t.created_by = auth.uid())
          OR ((SELECT public.get_user_role()) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))
        )
    )
  );

DROP POLICY IF EXISTS task_remarks_select ON public.task_remarks;
CREATE POLICY task_remarks_select ON public.task_remarks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_remarks.task_id
        AND (
          (t.assigned_to = auth.uid())
          OR (t.created_by = auth.uid())
          OR ((SELECT public.get_user_role()) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))
        )
    )
  );

DROP POLICY IF EXISTS task_remarks_suppression_update ON public.task_remarks;
CREATE POLICY task_remarks_suppression_update ON public.task_remarks
  FOR UPDATE
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

-- ── whatsapp_conversations ───────────────────────────────────────────────────

DROP POLICY IF EXISTS wa_conversations_admin_founder_select ON public.whatsapp_conversations;
CREATE POLICY wa_conversations_admin_founder_select ON public.whatsapp_conversations
  FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

DROP POLICY IF EXISTS wa_conversations_agent_select ON public.whatsapp_conversations;
CREATE POLICY wa_conversations_agent_select ON public.whatsapp_conversations
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'agent'::public.user_role)
    AND public.can_access_wa_conversation(lead_id)
  );

DROP POLICY IF EXISTS wa_conversations_manager_select ON public.whatsapp_conversations;
CREATE POLICY wa_conversations_manager_select ON public.whatsapp_conversations
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'manager'::public.user_role)
    AND public.can_access_wa_conversation(lead_id)
  );

DROP POLICY IF EXISTS wa_conversations_update ON public.whatsapp_conversations;
CREATE POLICY wa_conversations_update ON public.whatsapp_conversations
  FOR UPDATE
  USING (
    (
      ((SELECT public.get_user_role()) = 'agent'::public.user_role)
      AND public.can_access_wa_conversation(lead_id)
    )
    OR (
      ((SELECT public.get_user_role()) = 'manager'::public.user_role)
      AND public.can_access_wa_conversation(lead_id)
    )
    OR ((SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))
  );

-- ── whatsapp_messages ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS wa_messages_admin_founder_select ON public.whatsapp_messages;
CREATE POLICY wa_messages_admin_founder_select ON public.whatsapp_messages
  FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

DROP POLICY IF EXISTS wa_messages_agent_select ON public.whatsapp_messages;
CREATE POLICY wa_messages_agent_select ON public.whatsapp_messages
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'agent'::public.user_role)
    AND public.can_access_wa_conversation(lead_id)
  );

DROP POLICY IF EXISTS wa_messages_manager_select ON public.whatsapp_messages;
CREATE POLICY wa_messages_manager_select ON public.whatsapp_messages
  FOR SELECT
  USING (
    ((SELECT public.get_user_role()) = 'manager'::public.user_role)
    AND public.can_access_wa_conversation(lead_id)
  );

DROP POLICY IF EXISTS wa_messages_outbound_insert ON public.whatsapp_messages;
CREATE POLICY wa_messages_outbound_insert ON public.whatsapp_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (direction = 'outbound'::text)
    AND (sender_type = 'agent'::text)
    AND (sender_id = auth.uid())
    AND public.can_access_wa_conversation(lead_id)
    AND ((SELECT public.get_user_role()) = ANY (ARRAY['agent'::public.user_role, 'manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))
  );

-- ── profile_audit_log ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS audit_log_select ON public.profile_audit_log;
CREATE POLICY audit_log_select ON public.profile_audit_log
  FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

-- ── task_audit_log ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS task_audit_log_select ON public.task_audit_log;
CREATE POLICY task_audit_log_select ON public.task_audit_log
  FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role])
  );

-- ── lead_raw_payloads ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS lead_raw_payloads_admin_founder_select ON public.lead_raw_payloads;
CREATE POLICY lead_raw_payloads_admin_founder_select ON public.lead_raw_payloads
  FOR SELECT
  USING (
    (SELECT public.get_user_role()) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

-- Migration 0041: Normalize lead/task_groups/whatsapp domains to app_domain enum
--
-- Context: leads.domain was written with 'indulge_*' prefixed strings and bare
-- 'concierge' values that do not match agent profiles. The settled model is:
-- leads.domain must always equal profiles.domain of the handling team.
-- Concierge leads → domain = 'onboarding' (the onboarding sales team).
--
-- PostgreSQL will not ALTER a column's type while any RLS policy references it.
-- The pattern here is: drop domain-referencing policies → ALTER → recreate them.
-- Policies on lead_activities and lead_notes use a sub-SELECT on leads.domain,
-- so they are also included in the drop/recreate cycle.
--
-- Order is critical: the concierge → onboarding UPDATE must complete before any
-- ALTER COLUMN TYPE cast. Everything runs in a single transaction.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1 — Fix agent profiles (concierge → onboarding for agents only)
--
-- Managers and founders with domain = 'concierge' are Sia staff. Do not touch.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE profiles
SET domain = 'onboarding'
WHERE domain = 'concierge'
  AND role = 'agent';

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2 — Fix leads data
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE leads SET domain = 'onboarding' WHERE domain = 'concierge';
UPDATE leads SET domain = 'onboarding' WHERE domain = 'indulge_concierge';
UPDATE leads SET domain = 'shop'       WHERE domain = 'indulge_shop';
UPDATE leads SET domain = 'legacy'     WHERE domain = 'indulge_legacy';
UPDATE leads SET domain = 'house'      WHERE domain = 'indulge_house';
UPDATE leads SET domain = 'b2b'        WHERE domain = 'indulge_b2b';

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3 — Fix whatsapp_notification_logs
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE whatsapp_notification_logs
SET domain = 'onboarding'
WHERE domain = 'concierge';

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4 — Audit check before any type cast
--
-- RAISE WARNING logs any unexpected value and remaps it to 'onboarding'.
-- The ALTERs below will throw if any non-enum value survives this block.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_lead_domain text;
  bad_wa_domain   text;
BEGIN
  FOR bad_lead_domain IN
    SELECT DISTINCT domain FROM leads
    WHERE domain NOT IN (
      'onboarding', 'concierge', 'shop', 'legacy', 'house',
      'b2b', 'finance', 'marketing', 'tech'
    )
  LOOP
    RAISE WARNING 'normalize_lead_domain: unexpected leads.domain "%" — setting to onboarding', bad_lead_domain;
    UPDATE leads SET domain = 'onboarding' WHERE domain = bad_lead_domain;
  END LOOP;

  FOR bad_wa_domain IN
    SELECT DISTINCT domain FROM whatsapp_notification_logs
    WHERE domain IS NOT NULL
      AND domain NOT IN (
        'onboarding', 'concierge', 'shop', 'legacy', 'house',
        'b2b', 'finance', 'marketing', 'tech'
      )
  LOOP
    RAISE WARNING 'normalize_lead_domain: unexpected whatsapp_notification_logs.domain "%" — setting to onboarding', bad_wa_domain;
    UPDATE whatsapp_notification_logs SET domain = 'onboarding' WHERE domain = bad_wa_domain;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5 — Drop all RLS policies that reference leads.domain or task_groups.domain
--
-- PostgreSQL raises 0A000 if any policy references the column being retyped.
-- Policies on lead_activities and lead_notes do a sub-SELECT on leads.domain,
-- so they are also included.
-- ─────────────────────────────────────────────────────────────────────────────

-- leads table policies
DROP POLICY IF EXISTS "leads_manager_select"         ON leads;
DROP POLICY IF EXISTS "leads_update"                 ON leads;

-- lead_activities and lead_notes reference leads.domain via sub-SELECT
DROP POLICY IF EXISTS "lead_activities_select"       ON lead_activities;
DROP POLICY IF EXISTS "lead_notes_select"            ON lead_notes;

-- task_groups policies (domain is text in 0017, typed here)
DROP POLICY IF EXISTS "task_groups_select"           ON task_groups;
DROP POLICY IF EXISTS "task_groups_update"           ON task_groups;

-- lead_sla_timers: manager policy sub-SELECTs leads.domain
DROP POLICY IF EXISTS "lead_sla_timers_manager_select" ON lead_sla_timers;
DROP POLICY IF EXISTS "lead_sla_timers_agent_select"   ON lead_sla_timers;

-- can_access_wa_conversation() is a SECURITY DEFINER function that references
-- l.domain = get_user_domain()::text. All policies that call it on
-- whatsapp_conversations and whatsapp_messages must also be dropped so the
-- function can be replaced after the ALTER.
DROP POLICY IF EXISTS "wa_conversations_agent_select"        ON whatsapp_conversations;
DROP POLICY IF EXISTS "wa_conversations_manager_select"      ON whatsapp_conversations;
DROP POLICY IF EXISTS "wa_conversations_admin_founder_select" ON whatsapp_conversations;
DROP POLICY IF EXISTS "wa_conversations_update"              ON whatsapp_conversations;
DROP POLICY IF EXISTS "wa_messages_agent_select"             ON whatsapp_messages;
DROP POLICY IF EXISTS "wa_messages_manager_select"           ON whatsapp_messages;
DROP POLICY IF EXISTS "wa_messages_admin_founder_select"     ON whatsapp_messages;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6 — Change column types to app_domain enum
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE leads
  ALTER COLUMN domain TYPE app_domain
  USING domain::app_domain;

ALTER TABLE task_groups
  ALTER COLUMN domain TYPE app_domain
  USING domain::app_domain;

ALTER TABLE whatsapp_notification_logs
  ALTER COLUMN domain TYPE app_domain
  USING domain::app_domain;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7 — Recreate all dropped policies
--
-- Now that leads.domain and task_groups.domain are app_domain, the ::text casts
-- on get_user_domain() are removed — both sides of the comparison are app_domain.
-- ─────────────────────────────────────────────────────────────────────────────

-- leads: manager SELECT
CREATE POLICY "leads_manager_select"
  ON leads FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND domain = get_user_domain()
    AND archived_at IS NULL
  );

-- leads: UPDATE (agents, managers, admin, founder)
CREATE POLICY "leads_update"
  ON leads FOR UPDATE
  USING (
    (get_user_role() = 'agent'   AND assigned_to = auth.uid())
    OR (get_user_role() = 'manager' AND domain = get_user_domain())
    OR get_user_role() IN ('admin', 'founder')
  );

-- lead_activities: SELECT (mirrors lead access via sub-SELECT)
CREATE POLICY "lead_activities_select"
  ON lead_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_activities.lead_id
        AND (
          (get_user_role() = 'agent'   AND l.assigned_to = auth.uid())
          OR (get_user_role() = 'manager' AND l.domain = get_user_domain())
          OR get_user_role() IN ('admin', 'founder')
        )
        AND l.archived_at IS NULL
    )
  );

-- lead_notes: SELECT (mirrors lead access via sub-SELECT)
CREATE POLICY "lead_notes_select"
  ON lead_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_notes.lead_id
        AND (
          (get_user_role() = 'agent'   AND l.assigned_to = auth.uid())
          OR (get_user_role() = 'manager' AND l.domain = get_user_domain())
          OR get_user_role() IN ('admin', 'founder')
        )
        AND l.archived_at IS NULL
    )
  );

-- task_groups: SELECT
CREATE POLICY "task_groups_select"
  ON task_groups FOR SELECT
  USING (
    created_by = auth.uid()
    OR get_user_role() IN ('admin', 'founder')
    OR (get_user_role() = 'manager' AND get_user_domain() = domain)
  );

-- task_groups: UPDATE
CREATE POLICY "task_groups_update"
  ON task_groups FOR UPDATE
  USING (
    created_by = auth.uid()
    OR get_user_role() IN ('admin', 'founder')
    OR (get_user_role() = 'manager' AND get_user_domain() = domain)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR get_user_role() IN ('admin', 'founder')
    OR (get_user_role() = 'manager' AND get_user_domain() = domain)
  );

-- lead_sla_timers: agent SELECT (no domain reference — recreate for completeness)
CREATE POLICY "lead_sla_timers_agent_select"
  ON lead_sla_timers FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_sla_timers.lead_id
        AND l.assigned_to = auth.uid()
        AND l.archived_at IS NULL
    )
  );

-- lead_sla_timers: manager SELECT (l.domain is now app_domain — cast removed)
CREATE POLICY "lead_sla_timers_manager_select"
  ON lead_sla_timers FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_sla_timers.lead_id
        AND l.domain = get_user_domain()
        AND l.archived_at IS NULL
    )
  );

-- Recreate can_access_wa_conversation() with cast removed (both sides app_domain now)
CREATE OR REPLACE FUNCTION can_access_wa_conversation(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM leads l
    WHERE l.id = p_lead_id
      AND l.archived_at IS NULL
      AND (
        (get_user_role() = 'agent'   AND l.assigned_to = auth.uid())
        OR (get_user_role() = 'manager' AND l.domain = get_user_domain())
        OR get_user_role() IN ('admin', 'founder')
      )
  );
$$;

-- whatsapp_conversations policies (all delegate to can_access_wa_conversation)
CREATE POLICY "wa_conversations_agent_select"
  ON whatsapp_conversations FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND can_access_wa_conversation(lead_id)
  );

CREATE POLICY "wa_conversations_manager_select"
  ON whatsapp_conversations FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND can_access_wa_conversation(lead_id)
  );

CREATE POLICY "wa_conversations_admin_founder_select"
  ON whatsapp_conversations FOR SELECT
  USING (
    get_user_role() IN ('admin', 'founder')
  );

CREATE POLICY "wa_conversations_update"
  ON whatsapp_conversations FOR UPDATE
  USING (
    (get_user_role() = 'agent'   AND can_access_wa_conversation(lead_id))
    OR (get_user_role() = 'manager' AND can_access_wa_conversation(lead_id))
    OR get_user_role() IN ('admin', 'founder')
  );

-- whatsapp_messages policies
CREATE POLICY "wa_messages_agent_select"
  ON whatsapp_messages FOR SELECT
  USING (
    get_user_role() = 'agent'
    AND can_access_wa_conversation(lead_id)
  );

CREATE POLICY "wa_messages_manager_select"
  ON whatsapp_messages FOR SELECT
  USING (
    get_user_role() = 'manager'
    AND can_access_wa_conversation(lead_id)
  );

CREATE POLICY "wa_messages_admin_founder_select"
  ON whatsapp_messages FOR SELECT
  USING (
    get_user_role() IN ('admin', 'founder')
  );

COMMIT;

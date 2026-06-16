-- Migration 0130: fix get_agent_recent_activity aggregate (42803)
--
-- The 0063 body applied `ORDER BY la.created_at DESC LIMIT 25` to the aggregate
-- `SELECT jsonb_agg(...) INTO v_result` query. That query returns ONE row (the
-- aggregate), so ordering/limiting it by the non-grouped column `la.created_at`
-- is invalid — Postgres 17 rejects it with:
--   42803: column "la.created_at" must appear in the GROUP BY clause or be
--          used in an aggregate function
--
-- This never surfaced while the function was only called on the client refresh
-- path (the widget swallowed the error in its .catch). The global-domain work
-- (2026-06-17) added a SERVER-SIDE call in the dashboard page's Promise.all
-- (scoped activity seed for a founder/admin with a domain selected), so the
-- throw now fails the whole dashboard seed → empty fallback.
--
-- Fix: select + order + LIMIT the rows in a CTE first (the same shape the
-- get_dashboard_summary `activity_rows` CTE already uses), THEN jsonb_agg over
-- the bounded set. Behaviour is otherwise identical: 25 most recent activities
-- DESC, role-scoped (admin/founder all, manager by domain, agent by actor_id).
--
-- Signature, GRANT/REVOKE posture (0102 — admin client only), STABLE SECURITY
-- DEFINER, and search_path are all unchanged.

CREATE OR REPLACE FUNCTION get_agent_recent_activity(
  p_role    text,
  p_domain  app_domain,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH activity_rows AS (
    SELECT
      la.id,
      la.action_type,
      la.details,
      la.created_at,
      la.lead_id,
      la.actor_id,
      CASE
        WHEN l.first_name IS NOT NULL
        THEN TRIM(l.first_name || ' ' || COALESCE(l.last_name, ''))
        ELSE NULL
      END AS lead_name
    FROM lead_activities la
    LEFT JOIN leads l ON l.id = la.lead_id
    WHERE
      CASE
        WHEN p_role IN ('admin', 'founder') THEN TRUE
        WHEN p_role = 'manager'             THEN l.domain = p_domain
        ELSE                                     la.actor_id = p_user_id
      END
    ORDER BY la.created_at DESC
    LIMIT 25
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          r.id,
        'action_type', r.action_type,
        'details',     r.details,
        'created_at',  r.created_at,
        'lead_id',     r.lead_id,
        'actor_id',    r.actor_id,
        'lead_name',   r.lead_name
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM activity_rows r;

  RETURN v_result;
END;
$$;

-- EXECUTE stays revoked from clients (0102 / F-1 — admin client only).
REVOKE EXECUTE ON FUNCTION get_agent_recent_activity(text, app_domain, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_agent_recent_activity(text, app_domain, uuid)
  TO service_role;

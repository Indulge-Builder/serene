-- Migration 0063: get_agent_recent_activity RPC
--
-- Replaces the two-step Node.js pattern in getAgentRecentActivity():
--   OLD: SELECT id FROM leads WHERE domain = p_domain LIMIT 1000 → .in('lead_id', ids)
--   NEW: single SQL query with CASE-based role filter + LEFT JOIN for lead name.
--
-- Role scoping:
--   admin/founder → all activities (no filter)
--   manager       → activities on leads where leads.domain = p_domain
--   agent         → activities where actor_id = p_user_id
--
-- Returns jsonb array of 25 most recent activities (desc).

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
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          la.id,
        'action_type', la.action_type,
        'details',     la.details,
        'created_at',  la.created_at,
        'lead_id',     la.lead_id,
        'actor_id',    la.actor_id,
        'lead_name',   CASE
                         WHEN l.first_name IS NOT NULL
                         THEN TRIM(l.first_name || ' ' || COALESCE(l.last_name, ''))
                         ELSE NULL
                       END
      )
      ORDER BY la.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM lead_activities la
  LEFT JOIN leads l ON l.id = la.lead_id
  WHERE
    CASE
      WHEN p_role IN ('admin', 'founder') THEN TRUE
      WHEN p_role = 'manager'             THEN l.domain = p_domain
      ELSE                                     la.actor_id = p_user_id
    END
  ORDER BY la.created_at DESC
  LIMIT 25;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_agent_recent_activity(text, app_domain, uuid) TO authenticated;

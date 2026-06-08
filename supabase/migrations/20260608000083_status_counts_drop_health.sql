-- Migration 083: remove the lead_health filter from get_leads_status_counts.
-- The lead_health feature was reverted entirely in migration 0082 (column dropped).
-- Migration 0080 still defined get_leads_status_counts with a p_health parameter and an
-- `l.lead_health::text = p_health` predicate — both now reference a column that no longer
-- exists. This migration drops that overload and recreates the function without p_health.
--
-- Matches the application call site: getLeadsByRole / getLeadsForExport in leads-service.ts
-- now call the RPC with 8 params (no p_health).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the old 9-parameter overload (the one that included p_health)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_leads_status_counts(
  uuid, timestamptz, timestamptz, text, text, text, text, text[], text[]
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Recreate without p_health / lead_health
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_leads_status_counts(
  p_agent_id   uuid        DEFAULT NULL,
  p_date_from  timestamptz DEFAULT NULL,
  p_date_to    timestamptz DEFAULT NULL,
  p_campaign   text        DEFAULT NULL,
  p_search     text        DEFAULT NULL,
  p_source     text        DEFAULT NULL,
  p_outcomes   text[]      DEFAULT NULL,
  p_statuses   text[]      DEFAULT NULL
)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role   text := get_user_role();
  v_domain app_domain := get_user_domain();
BEGIN
  RETURN QUERY
  SELECT
    l.status::text,
    COUNT(*)::bigint
  FROM leads l
  WHERE
    l.archived_at IS NULL

    -- Role/domain constraints — mirrors RLS SELECT policies exactly
    AND CASE
      WHEN v_role = 'agent'   THEN l.assigned_to = auth.uid()
      WHEN v_role = 'manager' THEN l.domain = v_domain
      ELSE TRUE  -- admin / founder: no domain restriction
    END

    -- Optional: agent_id filter (manager/admin/founder only — agent role constraint already wins)
    AND (p_agent_id IS NULL OR l.assigned_to = p_agent_id)

    -- Optional: date range
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <  p_date_to)

    -- Optional: campaign
    AND (p_campaign IS NULL OR l.utm_campaign = p_campaign)

    -- Optional: search — parameterised LIKE via CONCAT (never string concatenation)
    AND (
      p_search IS NULL
      OR l.first_name ILIKE '%' || p_search || '%'
      OR l.last_name  ILIKE '%' || p_search || '%'
      OR l.phone      ILIKE '%' || p_search || '%'
    )

    -- Optional: source
    AND (p_source IS NULL OR l.source = p_source)

    -- Optional: last_call_outcome — treat empty array as "no filter"
    AND (
      p_outcomes IS NULL
      OR array_length(p_outcomes, 1) IS NULL
      OR array_length(p_outcomes, 1) = 0
      OR l.last_call_outcome::text = ANY(p_outcomes)
    )

    -- Optional: status filter — treat empty array as "no filter"
    AND (
      p_statuses IS NULL
      OR array_length(p_statuses, 1) IS NULL
      OR array_length(p_statuses, 1) = 0
      OR l.status::text = ANY(p_statuses)
    )

  GROUP BY l.status;
END;
$$;

-- GRANT must follow the function body — never before (stripped on CREATE OR REPLACE)
GRANT EXECUTE ON FUNCTION get_leads_status_counts(
  uuid, timestamptz, timestamptz, text, text, text, text[], text[]
) TO authenticated;

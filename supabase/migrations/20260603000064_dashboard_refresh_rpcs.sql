-- Migration 0064: Dashboard refresh RPCs
--
-- Two lightweight RPCs used by the per-widget refresh buttons.
-- Identical CTE logic to migration 0050/0062's lead_status and campaigns sections.
-- Node-side aggregation is eliminated — the DB returns the final jsonb shape.
--
-- RPC 1: get_lead_pipeline_refresh
--   Domain scoping: manager → p_domain; admin/founder → no filter.
--   Return shape matches DashboardLeadStatusSummary exactly:
--     { totals: [{status, count}], byAgent: [{agent_id, agent_name, counts, total}] }
--
-- RPC 2: get_campaign_pipeline_refresh
--   Same domain scoping. Returns top 12 campaigns by total leads.
--   Return shape matches DashboardCampaignStatusMix[]:
--     [{campaign, total, mix}]

-- ─────────────────────────────────────────────────────────────────
-- RPC 1: get_lead_pipeline_refresh
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_lead_pipeline_refresh(
  p_role   text,
  p_domain app_domain
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
  WITH lead_rows AS (
    SELECT
      l.status,
      l.assigned_to,
      pr.full_name AS agent_name
    FROM leads l
    LEFT JOIN profiles pr ON pr.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND (
        CASE
          WHEN p_role = 'manager' THEN l.domain = p_domain
          ELSE TRUE  -- admin/founder: no domain filter
        END
      )
  ),
  status_totals AS (
    SELECT
      status,
      COUNT(*)::int AS cnt
    FROM lead_rows
    GROUP BY status
  ),
  agent_counts AS (
    SELECT
      assigned_to,
      MAX(agent_name) AS agent_name,
      COUNT(*)::int AS total,
      jsonb_object_agg(status, cnt) AS counts
    FROM (
      SELECT assigned_to, agent_name, status, COUNT(*)::int AS cnt
      FROM lead_rows
      WHERE assigned_to IS NOT NULL
      GROUP BY assigned_to, agent_name, status
    ) sub
    GROUP BY assigned_to
  )
  SELECT jsonb_build_object(
    'totals', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt) ORDER BY
        CASE status
          WHEN 'new'           THEN 1
          WHEN 'touched'       THEN 2
          WHEN 'in_discussion' THEN 3
          WHEN 'nurturing'     THEN 4
          WHEN 'won'           THEN 5
          WHEN 'lost'          THEN 6
          WHEN 'junk'          THEN 7
          ELSE 8
        END
      ) FROM status_totals WHERE cnt > 0),
      '[]'::jsonb
    ),
    'byAgent', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'agent_id',   assigned_to,
          'agent_name', agent_name,
          'counts',     counts,
          'total',      total
        )
        ORDER BY total DESC
      ) FROM agent_counts),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_lead_pipeline_refresh(text, app_domain) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- RPC 2: get_campaign_pipeline_refresh
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_campaign_pipeline_refresh(
  p_role   text,
  p_domain app_domain
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
  WITH campaign_rows AS (
    SELECT
      utm_campaign AS campaign,
      status
    FROM leads
    WHERE archived_at IS NULL
      AND utm_campaign IS NOT NULL
      AND (
        CASE
          WHEN p_role = 'manager' THEN domain = p_domain
          ELSE TRUE  -- admin/founder: no domain filter
        END
      )
  ),
  campaign_agg AS (
    SELECT
      campaign,
      COUNT(*)::int AS total,
      jsonb_object_agg(status, cnt) AS mix
    FROM (
      SELECT campaign, status, COUNT(*)::int AS cnt
      FROM campaign_rows
      GROUP BY campaign, status
    ) sub
    GROUP BY campaign
    ORDER BY total DESC
    LIMIT 12
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'campaign', campaign,
        'total',    total,
        'mix',      mix
      )
      ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM campaign_agg;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_campaign_pipeline_refresh(text, app_domain) TO authenticated;

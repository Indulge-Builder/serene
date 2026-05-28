-- Campaign detail metrics: two new RPCs for the [id] detail page.
-- Neither recomputes what get_campaign_metrics already covers.

-- ─────────────────────────────────────────────────────────────────────────────
-- get_campaign_detail_metrics
--
-- Returns a SINGLE row for one campaign with:
--   - All status / outcome counts (same conditionals as list-page RPC)
--   - avg_hours_to_first_touch: average hours from lead.created_at to the
--     earliest lead_activities row with action_type='status_changed' and
--     details->>'to'='touched', per lead. Lateral join — one scan.
--
-- Called only from the detail page, never from the list page.
-- SECURITY DEFINER so admin/founder can call it without RLS blocking
-- cross-domain reads on lead_activities.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_campaign_detail_metrics(
  p_campaign  text,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  campaign_name          text,
  total_leads            bigint,
  status_new             bigint,
  status_touched         bigint,
  status_in_discussion   bigint,
  status_won             bigint,
  status_nurturing       bigint,
  status_lost            bigint,
  status_junk            bigint,
  outcome_rnr            bigint,
  outcome_switched_off   bigint,
  outcome_converted      bigint,
  avg_hours_to_first_touch double precision
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    l.utm_campaign                                                       AS campaign_name,
    COUNT(*)                                                             AS total_leads,
    COUNT(*) FILTER (WHERE l.status = 'new')                            AS status_new,
    COUNT(*) FILTER (WHERE l.status = 'touched')                        AS status_touched,
    COUNT(*) FILTER (WHERE l.status = 'in_discussion')                  AS status_in_discussion,
    COUNT(*) FILTER (WHERE l.status = 'won')                            AS status_won,
    COUNT(*) FILTER (WHERE l.status = 'nurturing')                      AS status_nurturing,
    COUNT(*) FILTER (WHERE l.status = 'lost')                           AS status_lost,
    COUNT(*) FILTER (WHERE l.status = 'junk')                           AS status_junk,
    COUNT(*) FILTER (WHERE l.last_call_outcome = 'rnr')                 AS outcome_rnr,
    COUNT(*) FILTER (WHERE l.last_call_outcome = 'switched_off')        AS outcome_switched_off,
    COUNT(*) FILTER (WHERE l.last_call_outcome = 'converted')           AS outcome_converted,
    AVG(
      EXTRACT(EPOCH FROM (ft.first_touched_at - l.created_at)) / 3600.0
    )                                                                    AS avg_hours_to_first_touch
  FROM leads l
  LEFT JOIN LATERAL (
    SELECT MIN(la.created_at) AS first_touched_at
    FROM lead_activities la
    WHERE la.lead_id = l.id
      AND la.action_type = 'status_changed'
      AND la.details->>'to' = 'touched'
  ) ft ON true
  WHERE l.archived_at IS NULL
    AND l.utm_campaign = p_campaign
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <= p_date_to)
  GROUP BY l.utm_campaign;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_campaign_agent_distribution
--
-- Returns one row per assigned agent for a single campaign.
-- Single GROUP BY — never one query per agent (N+1 is a bug).
-- Joins leads → profiles on assigned_to to resolve full_name in-DB.
-- Unassigned leads (assigned_to IS NULL) are excluded.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_campaign_agent_distribution(
  p_campaign  text,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  agent_id   uuid,
  full_name  text,
  lead_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    l.assigned_to                  AS agent_id,
    p.full_name                    AS full_name,
    COUNT(*)                       AS lead_count
  FROM leads l
  JOIN profiles p ON p.id = l.assigned_to
  WHERE l.archived_at IS NULL
    AND l.utm_campaign = p_campaign
    AND l.assigned_to IS NOT NULL
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <= p_date_to)
  GROUP BY l.assigned_to, p.full_name
  ORDER BY lead_count DESC;
$$;

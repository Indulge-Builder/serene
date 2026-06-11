-- Extend get_domain_health_metrics with total_deals: COUNT(*) from public.deals
-- (archived_at IS NULL) filtered by won_at — same source + date field as the
-- existing total_revenue column (0076). Drives the domain-card "Deals Closed"
-- stat and the deals-vs-target radial meter (domain_targets, migration 0105).
-- All other CTEs unchanged.
--
-- The function was REVOKEd from clients in migration 0102 (scope-param tier);
-- DROP + recreate loses grants, so the revoke + service_role grant are
-- re-applied at the bottom.

DROP FUNCTION IF EXISTS get_domain_health_metrics(app_domain[], timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION get_domain_health_metrics(
  p_domains   app_domain[],
  p_date_from timestamptz,
  p_date_to   timestamptz
)
RETURNS TABLE (
  domain            app_domain,
  total_leads       bigint,
  leads_won         bigint,
  leads_lost        bigint,
  calls_logged      bigint,
  in_discussion     bigint,
  nurturing         bigint,
  total_calls_made  bigint,
  total_revenue     numeric,
  total_deals       bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH

  domains AS (
    SELECT UNNEST(p_domains) AS d
  ),

  cohort AS (
    SELECT leads.domain, COUNT(*) AS total_leads
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  leads.domain = ANY(p_domains)
    GROUP  BY leads.domain
  ),

  closures AS (
    SELECT
      leads.domain,
      COUNT(*) FILTER (WHERE status = 'won')  AS leads_won,
      COUNT(*) FILTER (WHERE status = 'lost') AS leads_lost
    FROM   leads
    WHERE  archived_at IS NULL
      AND  status IN ('won', 'lost')
      AND  status_changed_at >= p_date_from
      AND  status_changed_at <= p_date_to
      AND  leads.domain = ANY(p_domains)
    GROUP  BY leads.domain
  ),

  -- revenue + deal count: from public.deals filtered by won_at (deals system)
  revenue AS (
    SELECT
      deals.domain,
      COALESCE(SUM(deal_amount), 0) AS total_revenue,
      COUNT(*)                      AS total_deals
    FROM   deals
    WHERE  archived_at IS NULL
      AND  won_at >= p_date_from
      AND  won_at <= p_date_to
      AND  deals.domain = ANY(p_domains)
    GROUP  BY deals.domain
  ),

  pipeline AS (
    SELECT
      leads.domain,
      COUNT(*) FILTER (WHERE status = 'in_discussion') AS in_discussion,
      COUNT(*) FILTER (WHERE status = 'nurturing')     AS nurturing
    FROM   leads
    WHERE  archived_at IS NULL
      AND  status IN ('in_discussion', 'nurturing')
      AND  leads.domain = ANY(p_domains)
    GROUP  BY leads.domain
  ),

  calls AS (
    SELECT
      l.domain,
      COUNT(*) AS calls_logged
    FROM   lead_notes ln
    JOIN   leads      l  ON l.id = ln.lead_id
    WHERE  l.archived_at   IS NULL
      AND  ln.call_outcome IS NOT NULL
      AND  ln.created_at   >= p_date_from
      AND  ln.created_at   <= p_date_to
      AND  l.domain = ANY(p_domains)
    GROUP  BY l.domain
  ),

  calls_made AS (
    SELECT
      leads.domain,
      COALESCE(SUM(call_count), 0) AS total_calls_made
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  leads.domain = ANY(p_domains)
    GROUP  BY leads.domain
  )

  SELECT
    domains.d                                    AS domain,
    COALESCE(cohort.total_leads,          0)     AS total_leads,
    COALESCE(closures.leads_won,          0)     AS leads_won,
    COALESCE(closures.leads_lost,         0)     AS leads_lost,
    COALESCE(calls.calls_logged,          0)     AS calls_logged,
    COALESCE(pipeline.in_discussion,      0)     AS in_discussion,
    COALESCE(pipeline.nurturing,          0)     AS nurturing,
    COALESCE(calls_made.total_calls_made, 0)     AS total_calls_made,
    COALESCE(revenue.total_revenue,       0)     AS total_revenue,
    COALESCE(revenue.total_deals,         0)     AS total_deals
  FROM    domains
  LEFT JOIN cohort      ON cohort.domain      = domains.d
  LEFT JOIN closures    ON closures.domain    = domains.d
  LEFT JOIN revenue     ON revenue.domain     = domains.d
  LEFT JOIN pipeline    ON pipeline.domain    = domains.d
  LEFT JOIN calls       ON calls.domain       = domains.d
  LEFT JOIN calls_made  ON calls_made.domain  = domains.d;
$$;

-- Preserve the 0102 access posture (scope-param tier — admin-client only)
REVOKE EXECUTE ON FUNCTION get_domain_health_metrics(app_domain[], timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_domain_health_metrics(app_domain[], timestamptz, timestamptz)
  TO service_role;

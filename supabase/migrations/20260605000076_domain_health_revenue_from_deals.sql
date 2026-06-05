-- Migration 0076 — Repoint get_domain_health_metrics revenue to public.deals
--
-- total_revenue previously: SUM(leads.deal_amount) WHERE status='won' filtered by status_changed_at.
-- total_revenue now:        SUM(deals.deal_amount) WHERE archived_at IS NULL filtered by won_at.
--
-- All other CTEs (cohort, closures win/loss count, pipeline, calls, calls_made) are unchanged —
-- they remain on public.leads because they measure the lead lifecycle, not deal revenue.
-- Only the revenue column moves.

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
  total_revenue     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH

  -- driving row source: one row per requested domain
  domains AS (
    SELECT UNNEST(p_domains) AS d
  ),

  -- cohort: leads created in range (touch rate denominator, lead lifecycle metric)
  cohort AS (
    SELECT domain, COUNT(*) AS total_leads
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- closures: won/lost counts filtered by status_changed_at (lead lifecycle metric)
  -- revenue is no longer here — it comes from public.deals below
  closures AS (
    SELECT
      domain,
      COUNT(*) FILTER (WHERE status = 'won')  AS leads_won,
      COUNT(*) FILTER (WHERE status = 'lost') AS leads_lost
    FROM   leads
    WHERE  archived_at IS NULL
      AND  status IN ('won', 'lost')
      AND  status_changed_at >= p_date_from
      AND  status_changed_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- revenue: from public.deals filtered by won_at (deals system)
  revenue AS (
    SELECT
      domain,
      COALESCE(SUM(deal_amount), 0) AS total_revenue
    FROM   deals
    WHERE  archived_at IS NULL
      AND  won_at >= p_date_from
      AND  won_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- pipeline: live snapshot — no date filter
  pipeline AS (
    SELECT
      domain,
      COUNT(*) FILTER (WHERE status = 'in_discussion') AS in_discussion,
      COUNT(*) FILTER (WHERE status = 'nurturing')     AS nurturing
    FROM   leads
    WHERE  archived_at IS NULL
      AND  status IN ('in_discussion', 'nurturing')
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- calls: lead_notes with call_outcome set, joined to leads for domain
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

  -- total_calls_made: SUM(call_count) on cohort leads (created_at in range)
  calls_made AS (
    SELECT
      domain,
      COALESCE(SUM(call_count), 0) AS total_calls_made
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
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
    COALESCE(revenue.total_revenue,       0)     AS total_revenue
  FROM    domains
  LEFT JOIN cohort      ON cohort.domain      = domains.d
  LEFT JOIN closures    ON closures.domain    = domains.d
  LEFT JOIN revenue     ON revenue.domain     = domains.d
  LEFT JOIN pipeline    ON pipeline.domain    = domains.d
  LEFT JOIN calls       ON calls.domain       = domains.d
  LEFT JOIN calls_made  ON calls_made.domain  = domains.d;
$$;

GRANT EXECUTE ON FUNCTION get_domain_health_metrics(app_domain[], timestamptz, timestamptz) TO authenticated;

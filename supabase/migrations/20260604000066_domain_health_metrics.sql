-- Domain health metrics RPC
-- Returns one row per requested domain (always, even with zero leads).
-- Five CTEs: cohort, closures, pipeline, calls; all scoped to archived_at IS NULL.
-- Pipeline is a live snapshot (no date filter). All others use p_date_from / p_date_to.

CREATE OR REPLACE FUNCTION get_domain_health_metrics(
  p_domains   app_domain[],
  p_date_from timestamptz,
  p_date_to   timestamptz
)
RETURNS TABLE (
  domain        app_domain,
  total_leads   bigint,
  leads_won     bigint,
  leads_lost    bigint,
  calls_logged  bigint,
  in_discussion bigint,
  nurturing     bigint
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

  -- cohort: leads created in range
  cohort AS (
    SELECT domain, COUNT(*) AS total_leads
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- closures: won/lost leads filtered by status_changed_at
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
  )

  SELECT
    domains.d                          AS domain,
    COALESCE(cohort.total_leads,   0)  AS total_leads,
    COALESCE(closures.leads_won,   0)  AS leads_won,
    COALESCE(closures.leads_lost,  0)  AS leads_lost,
    COALESCE(calls.calls_logged,   0)  AS calls_logged,
    COALESCE(pipeline.in_discussion, 0) AS in_discussion,
    COALESCE(pipeline.nurturing,   0)  AS nurturing
  FROM    domains
  LEFT JOIN cohort   ON cohort.domain   = domains.d
  LEFT JOIN closures ON closures.domain = domains.d
  LEFT JOIN pipeline ON pipeline.domain = domains.d
  LEFT JOIN calls    ON calls.domain    = domains.d;
$$;

GRANT EXECUTE ON FUNCTION get_domain_health_metrics(app_domain[], timestamptz, timestamptz) TO authenticated;

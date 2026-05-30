-- Fix get_campaign_metrics: migration 0041 changed leads.domain to app_domain
-- but p_domain parameter was still text, causing operator type mismatch (42883).
-- Same fix pattern as migration 0043 (get_dashboard_summary).

CREATE OR REPLACE FUNCTION get_campaign_metrics(
  p_domain    app_domain  DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  campaign_name          text,
  domain                 text,
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
  outcome_converted      bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    utm_campaign                                                    AS campaign_name,
    domain::text                                                    AS domain,
    COUNT(*)                                                        AS total_leads,
    COUNT(*) FILTER (WHERE status = 'new')                         AS status_new,
    COUNT(*) FILTER (WHERE status = 'touched')                     AS status_touched,
    COUNT(*) FILTER (WHERE status = 'in_discussion')               AS status_in_discussion,
    COUNT(*) FILTER (WHERE status = 'won')                         AS status_won,
    COUNT(*) FILTER (WHERE status = 'nurturing')                   AS status_nurturing,
    COUNT(*) FILTER (WHERE status = 'lost')                        AS status_lost,
    COUNT(*) FILTER (WHERE status = 'junk')                        AS status_junk,
    COUNT(*) FILTER (WHERE last_call_outcome = 'rnr')              AS outcome_rnr,
    COUNT(*) FILTER (WHERE last_call_outcome = 'switched_off')     AS outcome_switched_off,
    COUNT(*) FILTER (WHERE last_call_outcome = 'converted')        AS outcome_converted
  FROM leads
  WHERE archived_at IS NULL
    AND utm_campaign IS NOT NULL
    AND (p_domain IS NULL OR domain = p_domain)
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to   IS NULL OR created_at <= p_date_to)
  GROUP BY utm_campaign, domain
  ORDER BY total_leads DESC;
$$;

-- Drop the old text overload if it still exists (avoids ambiguous function call)
DROP FUNCTION IF EXISTS get_campaign_metrics(text, timestamptz, timestamptz);

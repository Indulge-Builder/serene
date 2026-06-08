-- Fix avg_hours_to_first_touch: lateral join used details->>'to' but
-- update_lead_status writes jsonb_build_object('old_status', ..., 'new_status', p_status).

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
      AND la.details->>'new_status' = 'touched'
  ) ft ON true
  WHERE l.archived_at IS NULL
    AND l.utm_campaign = p_campaign
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <= p_date_to)
  GROUP BY l.utm_campaign;
$$;

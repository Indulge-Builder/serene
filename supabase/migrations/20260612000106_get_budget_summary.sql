-- get_budget_summary: one row per campaign with spend in the period, LEFT-joined
-- to lead counts (cohort by created_at) and deals (count + revenue by won_at,
-- attributed through deals.lead_id → leads.utm_campaign).
--
-- Join key: lower(trim(leads.utm_campaign)) = ad_spend_daily.campaign_key — the
-- single campaign-key normalisation shared with ad_creatives (migration 0012).
--
-- spend_date is a calendar date in IST (Meta ad account timezone); the
-- timestamptz period bounds are converted to IST dates for the spend filter so
-- the spend window and the lead/deal windows describe the same IST days.
--
-- Scope-param tier (Q-13 / audit F-1): the function returns whatever range it
-- is asked for and has no internal role gate, so EXECUTE is REVOKEd from
-- clients — the service calls it via the admin client and the /budget page +
-- action role-gate (manager+ read) are the trust boundary.

CREATE OR REPLACE FUNCTION get_budget_summary(
  p_date_from timestamptz,
  p_date_to   timestamptz
)
RETURNS TABLE (
  campaign_key      text,
  total_spend       numeric,
  total_results     bigint,
  total_impressions bigint,
  total_reach       bigint,
  total_link_clicks bigint,
  lead_count        bigint,
  deal_count        bigint,
  deal_revenue      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH spend AS (
    SELECT
      s.campaign_key,
      SUM(s.spend)                    AS total_spend,
      SUM(s.results)::bigint          AS total_results,
      SUM(s.impressions)::bigint      AS total_impressions,
      SUM(s.reach)::bigint            AS total_reach,
      SUM(s.link_clicks)::bigint      AS total_link_clicks
    FROM ad_spend_daily s
    WHERE s.spend_date >= (p_date_from AT TIME ZONE 'Asia/Kolkata')::date
      AND s.spend_date <= (p_date_to   AT TIME ZONE 'Asia/Kolkata')::date
    GROUP BY s.campaign_key
  ),

  -- cohort: leads created in the period, grouped on the normalised key
  campaign_leads AS (
    SELECT
      lower(trim(l.utm_campaign)) AS campaign_key,
      COUNT(*)                    AS lead_count
    FROM leads l
    WHERE l.archived_at IS NULL
      AND l.utm_campaign IS NOT NULL
      AND l.created_at >= p_date_from
      AND l.created_at <= p_date_to
    GROUP BY lower(trim(l.utm_campaign))
  ),

  -- deals attributed through their lead's campaign, closed in the period (won_at)
  campaign_deals AS (
    SELECT
      lower(trim(l.utm_campaign))     AS campaign_key,
      COUNT(*)                        AS deal_count,
      COALESCE(SUM(d.deal_amount), 0) AS deal_revenue
    FROM deals d
    JOIN leads l ON l.id = d.lead_id
    WHERE d.archived_at IS NULL
      AND l.utm_campaign IS NOT NULL
      AND d.won_at >= p_date_from
      AND d.won_at <= p_date_to
    GROUP BY lower(trim(l.utm_campaign))
  )

  SELECT
    spend.campaign_key,
    spend.total_spend,
    spend.total_results,
    spend.total_impressions,
    spend.total_reach,
    spend.total_link_clicks,
    COALESCE(campaign_leads.lead_count, 0)   AS lead_count,
    COALESCE(campaign_deals.deal_count, 0)   AS deal_count,
    COALESCE(campaign_deals.deal_revenue, 0) AS deal_revenue
  FROM spend
  LEFT JOIN campaign_leads ON campaign_leads.campaign_key = spend.campaign_key
  LEFT JOIN campaign_deals ON campaign_deals.campaign_key = spend.campaign_key
  ORDER BY spend.total_spend DESC;
$$;

REVOKE EXECUTE ON FUNCTION get_budget_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_budget_summary(timestamptz, timestamptz)
  TO service_role;

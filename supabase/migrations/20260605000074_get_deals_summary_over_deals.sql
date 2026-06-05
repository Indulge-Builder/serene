-- Migration 0074 — Rewrite get_deals_summary to query public.deals
-- Source table is now public.deals (not leads).
-- Structural WHERE collapses to archived_at IS NULL — every row IS a deal.
-- Date filters apply to won_at (was status_changed_at on leads).
-- Two-domain parameter split preserved exactly from migration 0053.

CREATE OR REPLACE FUNCTION public.get_deals_summary(
  p_role          text,
  p_caller_domain text,
  p_filter_domain text    DEFAULT NULL,
  p_agent_id      uuid    DEFAULT NULL,
  p_deal_type     text    DEFAULT NULL,
  p_date_from     timestamptz DEFAULT NULL,
  p_date_to       timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_deals      int,
  total_revenue    numeric,
  membership_count int,
  retail_count     int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::int                                                  AS total_deals,
    COALESCE(SUM(d.deal_amount), 0)                               AS total_revenue,
    COUNT(*) FILTER (WHERE d.deal_type = 'membership')::int       AS membership_count,
    COUNT(*) FILTER (WHERE d.deal_type = 'retail')::int           AS retail_count
  FROM public.deals d
  WHERE d.archived_at IS NULL
    -- ── Role-level gates (A-09 / Q-13: manager gate uses p_caller_domain only) ──
    AND CASE
          WHEN p_role = 'agent'   THEN d.assigned_to = p_agent_id
          WHEN p_role = 'manager' THEN d.domain = p_caller_domain::app_domain
          ELSE TRUE                   -- admin / founder: optional slice below
        END
    -- ── Admin/founder optional domain slice (p_filter_domain — user-supplied) ──
    -- This branch is NEVER reached for manager (already gated above).
    AND (
      p_role IN ('admin', 'founder') IS FALSE
      OR p_filter_domain IS NULL
      OR d.domain = p_filter_domain::app_domain
    )
    -- ── Admin/founder optional agent slice ──
    AND (
      p_role IN ('admin', 'founder') IS FALSE
      OR p_agent_id IS NULL
      OR d.assigned_to = p_agent_id
    )
    -- ── Optional deal-type filter ──
    AND (p_deal_type IS NULL OR d.deal_type = p_deal_type)
    -- ── Date range — applied to won_at ──
    AND (p_date_from IS NULL OR d.won_at >= p_date_from)
    AND (p_date_to   IS NULL OR d.won_at <= p_date_to);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_deals_summary(text, text, text, uuid, text, timestamptz, timestamptz)
  TO authenticated;

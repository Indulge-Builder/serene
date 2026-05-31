-- ─────────────────────────────────────────────────────────────────────────────
-- get_deals_summary(p_role, p_domain, p_agent_id, p_deal_type, p_date_from, p_date_to)
--
-- Returns one aggregate row for the Deals page summary strip.
-- Applies the same role-gate + filter constraints as getDealsByRole in the service layer.
-- Structural constraints: status = 'won' AND deal_amount IS NOT NULL — always applied.
--
-- SECURITY DEFINER — bypasses RLS. Role scoping is enforced explicitly via the WHERE clause.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_deals_summary(
  p_role       text,
  p_domain     text,
  p_agent_id   uuid    DEFAULT NULL,
  p_deal_type  text    DEFAULT NULL,
  p_date_from  timestamptz DEFAULT NULL,
  p_date_to    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_deals      int,
  total_revenue    numeric,
  membership_count int,
  retail_count     int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::int                                                    AS total_deals,
    COALESCE(SUM(l.deal_amount), 0)                                  AS total_revenue,
    COUNT(*) FILTER (WHERE l.deal_type = 'membership')::int          AS membership_count,
    COUNT(*) FILTER (WHERE l.deal_type = 'retail')::int              AS retail_count
  FROM leads l
  WHERE
    l.archived_at IS NULL
    AND l.status        = 'won'
    AND l.deal_amount   IS NOT NULL

    -- Role-level constraints (mirror getDealsByRole in deals-service.ts)
    AND CASE
      WHEN p_role = 'agent'   THEN l.assigned_to = p_agent_id
      WHEN p_role = 'manager' THEN l.domain      = p_domain
      ELSE                         TRUE           -- admin / founder
    END

    -- Optional: domain slice for admin/founder
    AND (
      p_role IN ('agent', 'manager')
      OR p_domain IS NULL
      OR l.domain = p_domain
    )

    -- Optional: agent filter (manager/admin/founder only — agent role pre-constrained above)
    AND (
      p_role = 'agent'
      OR p_agent_id IS NULL
      OR l.assigned_to = p_agent_id
    )

    -- Optional: deal type filter
    AND (p_deal_type IS NULL OR l.deal_type = p_deal_type)

    -- Optional: date range (applied to status_changed_at — when deal was won)
    AND (p_date_from IS NULL OR l.status_changed_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.status_changed_at <= p_date_to);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_deals_summary(text, text, uuid, text, timestamptz, timestamptz) TO authenticated;

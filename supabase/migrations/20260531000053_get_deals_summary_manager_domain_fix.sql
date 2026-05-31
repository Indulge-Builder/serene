-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: split p_domain into p_caller_domain + p_filter_domain
--
-- The original get_deals_summary used a single p_domain parameter for two
-- distinct purposes:
--   1. Manager role-gate: WHERE l.domain = p_domain  (must = server-verified callerDomain)
--   2. Admin/founder slice: WHERE l.domain = p_domain (user-supplied filter)
--
-- If a future caller ever passed a tampered value as p_domain for a manager call,
-- the manager domain gate would silently honour it. The fix splits these into
-- two named parameters so the manager gate can never be satisfied by a filter input:
--
--   p_caller_domain — the caller's verified domain from their profile (server-resolved).
--                     Used for the manager role-gate: l.domain = p_caller_domain.
--                     Always set by the service; ignored for agent/admin/founder role-gate.
--
--   p_filter_domain — the domain slice chosen by the user (admin/founder only).
--                     Ignored when p_role = 'manager' — managers cannot narrow to
--                     a different domain via the filter input.
--                     NULL means no domain slice.
--
-- The service (getDealsSummary) is updated alongside this migration to pass
-- the right value for each parameter.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old overload first so the new signature does not conflict
DROP FUNCTION IF EXISTS public.get_deals_summary(text, text, uuid, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_deals_summary(
  p_role           text,
  p_caller_domain  text,           -- server-verified profile domain (used for manager gate)
  p_filter_domain  text DEFAULT NULL,  -- user-supplied domain slice (admin/founder only)
  p_agent_id       uuid DEFAULT NULL,
  p_deal_type      text DEFAULT NULL,
  p_date_from      timestamptz DEFAULT NULL,
  p_date_to        timestamptz DEFAULT NULL
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
    AND l.status      = 'won'
    AND l.deal_amount IS NOT NULL

    -- Role-level constraints
    -- manager: always gates on p_caller_domain (server-verified profile domain).
    --          p_filter_domain is intentionally NOT used here — a tampered filter
    --          input cannot widen or redirect a manager's domain scope.
    AND CASE
      WHEN p_role = 'agent'   THEN l.assigned_to = p_agent_id
      WHEN p_role = 'manager' THEN l.domain      = p_caller_domain::app_domain
      ELSE                         TRUE           -- admin / founder: no mandatory domain gate
    END

    -- Optional domain slice — admin/founder only.
    -- Ignored for manager (already constrained above) and agent (constrained above).
    AND (
      p_role IN ('agent', 'manager')
      OR p_filter_domain IS NULL
      OR l.domain = p_filter_domain::app_domain
    )

    -- Optional agent filter (manager/admin/founder; agent role pre-constrained above)
    AND (
      p_role = 'agent'
      OR p_agent_id IS NULL
      OR l.assigned_to = p_agent_id
    )

    -- Optional deal-type filter
    AND (p_deal_type IS NULL OR l.deal_type = p_deal_type)

    -- Date range applied to status_changed_at (timestamp of the won transition).
    -- Note: if a lead is ever re-won (e.g. junk-revival path), status_changed_at
    -- reflects the most recent won transition, not the original. Acceptable today
    -- because won is terminal. See CLAUDE.md § "status_changed_at caveat".
    AND (p_date_from IS NULL OR l.status_changed_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.status_changed_at <= p_date_to);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_deals_summary(text, text, text, uuid, text, timestamptz, timestamptz) TO authenticated;

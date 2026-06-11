-- Migration 099 (perf audit C-1): get_leads_status_counts becomes the single
-- predicate scan for the leads list — totalCount is derived in the service as
-- the sum of the per-status counts, and the main paginated query drops
-- { count: 'exact' } (which forced a second full scan of the matching set on
-- every page/filter change).
--
-- This recreate also fixes three predicate-parity bugs between the RPC and
-- the paginated query in getLeadsByRole (the counts MUST match the table for
-- the totalCount fold to be sound):
--
--   1. LIVE BUG — the service has passed p_going_cold since the going-cold
--      preset shipped, but no overload ever had that parameter. PostgREST
--      answers PGRST202 (no matching function) on EVERY list load, the
--      service swallows the error, and the status pills render empty.
--      p_going_cold now exists.
--   2. Admin/founder domain slice (?domain= Gia filter) narrowed the table
--      but not the counts — the RPC had no p_domain. Added; applied only on
--      the admin/founder branch (agent/manager scoping stays self-derived
--      from get_user_role()/get_user_domain() — never caller-supplied).
--   3. Search counted over 3 columns (first_name/last_name/phone) while the
--      table searched 5 (+ email, city). Both now use leads.search_text
--      (migration 0098) — one definition, indexed, cannot drift.
--
-- Also aligned: p_date_to is now inclusive (<=) matching the query's .lte();
-- the service passes identical pre-transformed IST date bounds to both paths.
--
-- Deploy order: run this migration BEFORE deploying the service change. The
-- new signature is a superset with defaults, so the currently-deployed call
-- (9 named args incl. p_going_cold) matches it immediately — the empty-pills
-- bug heals on migration alone.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the old 8-parameter overload (PostgREST overload ambiguity + the
--    deployed call site never matched it anyway — see bug 1 above)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_leads_status_counts(
  uuid, timestamptz, timestamptz, text, text, text, text[], text[]
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Recreate with p_domain + p_going_cold, search over leads.search_text
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_leads_status_counts(
  p_agent_id   uuid        DEFAULT NULL,
  p_date_from  timestamptz DEFAULT NULL,
  p_date_to    timestamptz DEFAULT NULL,
  p_campaign   text        DEFAULT NULL,
  p_search     text        DEFAULT NULL,
  p_source     text        DEFAULT NULL,
  p_outcomes   text[]      DEFAULT NULL,
  p_statuses   text[]      DEFAULT NULL,
  p_domain     app_domain  DEFAULT NULL,
  p_going_cold timestamptz DEFAULT NULL
)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role   text := get_user_role();
  v_domain app_domain := get_user_domain();
BEGIN
  RETURN QUERY
  SELECT
    l.status::text,
    COUNT(*)::bigint
  FROM leads l
  WHERE
    l.archived_at IS NULL

    -- Role/domain constraints — mirrors RLS SELECT policies exactly.
    -- p_domain is honoured ONLY for admin/founder (the Gia domain slice);
    -- agent/manager scoping is always self-derived, never caller-supplied.
    AND CASE
      WHEN v_role = 'agent'   THEN l.assigned_to = auth.uid()
      WHEN v_role = 'manager' THEN l.domain = v_domain
      ELSE (p_domain IS NULL OR l.domain = p_domain)
    END

    -- Optional: agent_id filter (manager/admin/founder only — agent role constraint already wins)
    AND (p_agent_id IS NULL OR l.assigned_to = p_agent_id)

    -- Optional: date range — inclusive both ends, matching .gte()/.lte() in getLeadsByRole
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <= p_date_to)

    -- Optional: campaign
    AND (p_campaign IS NULL OR l.utm_campaign = p_campaign)

    -- Optional: search — same generated column as every other search path
    -- (migration 0098); parameterised LIKE via concatenation of the pattern only
    AND (p_search IS NULL OR l.search_text ILIKE '%' || p_search || '%')

    -- Optional: source
    AND (p_source IS NULL OR l.source = p_source)

    -- Optional: going-cold preset — last activity older than the threshold,
    -- non-terminal statuses only. NULL last_activity_at rows are excluded by
    -- the < comparison, matching the .lt() behaviour (those are SLA-01A's
    -- never-contacted leads, not going-cold ones).
    AND (
      p_going_cold IS NULL
      OR (
        l.last_activity_at < p_going_cold
        AND l.status NOT IN ('won', 'lost', 'junk')
      )
    )

    -- Optional: last_call_outcome — treat empty array as "no filter"
    AND (
      p_outcomes IS NULL
      OR array_length(p_outcomes, 1) IS NULL
      OR array_length(p_outcomes, 1) = 0
      OR l.last_call_outcome::text = ANY(p_outcomes)
    )

    -- Optional: status filter — treat empty array as "no filter"
    AND (
      p_statuses IS NULL
      OR array_length(p_statuses, 1) IS NULL
      OR array_length(p_statuses, 1) = 0
      OR l.status::text = ANY(p_statuses)
    )

  GROUP BY l.status;
END;
$$;

-- GRANT must follow the function body — never before (stripped on CREATE OR REPLACE)
GRANT EXECUTE ON FUNCTION get_leads_status_counts(
  uuid, timestamptz, timestamptz, text, text, text, text[], text[], app_domain, timestamptz
) TO authenticated;

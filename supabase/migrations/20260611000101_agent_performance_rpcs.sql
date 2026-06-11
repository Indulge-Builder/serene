-- Migration 101 (perf audit D-2): SQL aggregates for the performance page.
--
-- Before this migration the agent self-view fanned out to ~17 queries per
-- load (core-four ×4 + previous period ×4 + effort ×4 + outcomes ×1 +
-- benchmarks ×4), several of which shipped EVERY cohort lead row to Node and
-- aggregated with .filter().length — transfer scaled with lead count, not
-- answer size. The manager/founder roster shipped every lead/deal/activity
-- row for every agent and aggregated in JS the same way.
--
-- After: one RPC per view, COUNT(*) FILTER / AVG aggregates in SQL, one row
-- (or one row per agent) over the wire. Mirrors the get_dashboard_summary
-- pattern (migration 0029).
--
-- Benchmarks correctness fix (deliberate): getTeamBenchmarks previously ran
-- under the caller's session client, so for an AGENT caller the leads RLS
-- (assigned_to = auth.uid()) silently reduced the "team benchmark" to the
-- agent's own rows — the UI said "across N agents" while averaging one.
-- SECURITY DEFINER computes the true domain-wide averages the feature always
-- claimed. Only aggregate averages are exposed to agents — never per-agent
-- rows (those stay behind the manager+ role gate in the roster RPC).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Internal helper: one agent's core-four raw aggregates for one date range.
--    Called twice by get_agent_performance (current + previous period).
--    NOT callable by clients — EXECUTE revoked below; only the SECURITY
--    DEFINER wrapper reaches it. Rate math (touched/total, won/closed) stays
--    in the service layer so null-vs-zero semantics live in one place.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _agent_core_metrics(
  p_agent uuid,
  p_from  timestamptz,
  p_to    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_leads_won bigint;
  v_total     bigint;
  v_touched   bigint;
  v_won       bigint;
  v_lost      bigint;
  v_avg_resp  numeric;
BEGIN
  -- leadsWon — when the lead became won (status_changed_at), not when created
  SELECT count(*) INTO v_leads_won
  FROM leads l
  WHERE l.assigned_to = p_agent
    AND l.status = 'won'
    AND l.archived_at IS NULL
    AND l.status_changed_at >= p_from AND l.status_changed_at <= p_to;

  -- touch rate cohort — leads created in the period; touched = moved past 'new'
  SELECT count(*), count(*) FILTER (WHERE l.status <> 'new')
    INTO v_total, v_touched
  FROM leads l
  WHERE l.assigned_to = p_agent
    AND l.archived_at IS NULL
    AND l.created_at >= p_from AND l.created_at <= p_to;

  -- conversion cohort — won+lost closed in the period (status_changed_at)
  SELECT count(*) FILTER (WHERE l.status = 'won'),
         count(*) FILTER (WHERE l.status = 'lost')
    INTO v_won, v_lost
  FROM leads l
  WHERE l.assigned_to = p_agent
    AND l.archived_at IS NULL
    AND l.status IN ('won', 'lost')
    AND l.status_changed_at >= p_from AND l.status_changed_at <= p_to;

  -- avg first-touch response — minutes between lead creation and the
  -- status_changed→touched activity; negative diffs excluded (la >= l guard),
  -- NULL when the agent touched nothing in the period
  SELECT AVG(EXTRACT(EPOCH FROM (la.created_at - l.created_at)) / 60.0)
    INTO v_avg_resp
  FROM lead_activities la
  JOIN leads l ON l.id = la.lead_id
  WHERE la.actor_id = p_agent
    AND la.action_type = 'status_changed'
    AND la.details->>'new_status' = 'touched'
    AND la.created_at >= p_from AND la.created_at <= p_to
    AND la.created_at >= l.created_at;

  RETURN jsonb_build_object(
    'leads_won',            v_leads_won,
    'touch_total',          v_total,
    'touch_touched',        v_touched,
    'won_count',            v_won,
    'lost_count',           v_lost,
    'avg_response_minutes', v_avg_resp
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION _agent_core_metrics(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_agent_performance — the entire agent self-view in one round trip.
--    SELF-SCOPED: the agent is always auth.uid(), the benchmark domain is
--    always get_user_domain(). No caller-supplied identity or domain params —
--    an agent can never read another agent's metrics through this function.
--    p_prev_from/p_prev_to NULL (all_time/custom periods) → previous: null.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_agent_performance(
  p_date_from timestamptz,
  p_date_to   timestamptz,
  p_prev_from timestamptz DEFAULT NULL,
  p_prev_to   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_agent       uuid := auth.uid();
  v_domain      app_domain := get_user_domain();
  v_effort      jsonb;
  v_outcomes    jsonb;
  v_bench       jsonb;
  v_prev        jsonb := NULL;
  v_agent_count int;
BEGIN
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'get_agent_performance: no authenticated user';
  END IF;

  -- Effort — calls/notes are period-scoped; in_discussion/nurturing are LIVE
  -- pipeline counts (deliberately no period filter, matching the page contract)
  SELECT jsonb_build_object(
    'calls_logged', (
      SELECT count(*) FROM lead_notes n
      WHERE n.author_id = v_agent AND n.call_outcome IS NOT NULL
        AND n.created_at >= p_date_from AND n.created_at <= p_date_to
    ),
    'notes_written', (
      SELECT count(*) FROM lead_notes n
      WHERE n.author_id = v_agent
        AND n.created_at >= p_date_from AND n.created_at <= p_date_to
    ),
    'in_discussion', (
      SELECT count(*) FROM leads l
      WHERE l.assigned_to = v_agent AND l.status = 'in_discussion' AND l.archived_at IS NULL
    ),
    'nurturing', (
      SELECT count(*) FROM leads l
      WHERE l.assigned_to = v_agent AND l.status = 'nurturing' AND l.archived_at IS NULL
    )
  ) INTO v_effort;

  -- Call outcome breakdown — notes with an outcome, grouped (display order is
  -- the UI's concern; CallOutcomeBar sorts into canonical order)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('outcome', o.call_outcome, 'count', o.cnt) ORDER BY o.cnt DESC),
    '[]'::jsonb
  )
  INTO v_outcomes
  FROM (
    SELECT n.call_outcome, count(*) AS cnt
    FROM lead_notes n
    WHERE n.author_id = v_agent AND n.call_outcome IS NOT NULL
      AND n.created_at >= p_date_from AND n.created_at <= p_date_to
    GROUP BY n.call_outcome
  ) o;

  -- Team benchmarks — unweighted mean of per-agent means over the caller's
  -- domain roster (each agent counts once regardless of lead volume; this is
  -- a documented design choice, not pool-wide averaging). agent_count is the
  -- roster count; the service applies the agent_count < 2 null guard.
  SELECT count(*) INTO v_agent_count
  FROM profiles pr
  WHERE pr.domain = v_domain AND pr.role = 'agent' AND pr.is_active = true;

  WITH peers AS (
    SELECT pr.id FROM profiles pr
    WHERE pr.domain = v_domain AND pr.role = 'agent' AND pr.is_active = true
  ),
  touch AS (
    SELECT l.assigned_to, count(*) AS total,
           count(*) FILTER (WHERE l.status <> 'new') AS touched
    FROM leads l JOIN peers p ON p.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND l.created_at >= p_date_from AND l.created_at <= p_date_to
    GROUP BY l.assigned_to
  ),
  closed AS (
    SELECT l.assigned_to,
           count(*) FILTER (WHERE l.status = 'won')  AS won,
           count(*) FILTER (WHERE l.status = 'lost') AS lost
    FROM leads l JOIN peers p ON p.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND l.status IN ('won', 'lost')
      AND l.status_changed_at >= p_date_from AND l.status_changed_at <= p_date_to
    GROUP BY l.assigned_to
  ),
  response AS (
    SELECT la.actor_id,
           AVG(EXTRACT(EPOCH FROM (la.created_at - l.created_at)) / 60.0) AS avg_min
    FROM lead_activities la
    JOIN peers p ON p.id = la.actor_id
    JOIN leads l ON l.id = la.lead_id
    WHERE la.action_type = 'status_changed'
      AND la.details->>'new_status' = 'touched'
      AND la.created_at >= p_date_from AND la.created_at <= p_date_to
      AND la.created_at >= l.created_at
    GROUP BY la.actor_id
  )
  SELECT jsonb_build_object(
    'agent_count',          v_agent_count,
    'avg_touch_rate',       (SELECT AVG(t.touched::numeric / t.total * 100) FROM touch t WHERE t.total > 0),
    'avg_conversion_rate',  (SELECT AVG(c.won::numeric / (c.won + c.lost) * 100) FROM closed c WHERE (c.won + c.lost) > 0),
    'avg_response_minutes', (SELECT AVG(r.avg_min) FROM response r)
  ) INTO v_bench;

  IF p_prev_from IS NOT NULL AND p_prev_to IS NOT NULL THEN
    v_prev := _agent_core_metrics(v_agent, p_prev_from, p_prev_to);
  END IF;

  RETURN jsonb_build_object(
    'core',       _agent_core_metrics(v_agent, p_date_from, p_date_to),
    'previous',   v_prev,
    'effort',     v_effort,
    'outcomes',   v_outcomes,
    'benchmarks', v_bench
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_agent_performance(timestamptz, timestamptz, timestamptz, timestamptz)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_agent_roster_performance — one row per active agent with SQL
--    aggregates (manager team view + founder/admin all-domains view).
--    Role-gated: per-agent performance rows are manager/admin/founder only.
--    Manager is ALWAYS pinned to their own domain — p_domain is honoured only
--    for admin/founder (NULL = all domains). Zero-activity agents still get a
--    row (LEFT JOINs), matching the previous JS seeding behaviour.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_agent_roster_performance(
  p_date_from timestamptz,
  p_date_to   timestamptz,
  p_domain    app_domain DEFAULT NULL
)
RETURNS TABLE(
  agent_id             uuid,
  agent_name           text,
  agent_avatar_url     text,
  agent_domain         app_domain,
  total_leads          bigint,
  won_count            bigint,
  lost_count           bigint,
  total_deal_amount    numeric,
  avg_response_minutes numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role   text := get_user_role();
  v_domain app_domain;
BEGIN
  IF v_role NOT IN ('manager', 'admin', 'founder') THEN
    RETURN; -- agents/guests get no roster rows
  END IF;

  IF v_role = 'manager' THEN
    v_domain := get_user_domain(); -- never caller-supplied for managers
  ELSE
    v_domain := p_domain; -- admin/founder: NULL = all domains
  END IF;

  RETURN QUERY
  WITH roster AS (
    SELECT pr.id, pr.full_name, pr.avatar_url, pr.domain
    FROM profiles pr
    WHERE pr.role = 'agent'
      AND pr.is_active = true
      AND (v_domain IS NULL OR pr.domain = v_domain)
  ),
  cohort AS (
    -- touch-rate denominator: leads created in the period
    SELECT l.assigned_to, count(*) AS total
    FROM leads l JOIN roster r ON r.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND l.created_at >= p_date_from AND l.created_at <= p_date_to
    GROUP BY l.assigned_to
  ),
  closed AS (
    -- conversion: won/lost closed in the period (status_changed_at)
    SELECT l.assigned_to,
           count(*) FILTER (WHERE l.status = 'won')  AS won,
           count(*) FILTER (WHERE l.status = 'lost') AS lost
    FROM leads l JOIN roster r ON r.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND l.status IN ('won', 'lost')
      AND l.status_changed_at >= p_date_from AND l.status_changed_at <= p_date_to
    GROUP BY l.assigned_to
  ),
  revenue AS (
    -- deal revenue lives on public.deals, filtered by won_at (not leads)
    SELECT d.assigned_to, SUM(d.deal_amount) AS amount
    FROM deals d JOIN roster r ON r.id = d.assigned_to
    WHERE d.archived_at IS NULL
      AND d.won_at >= p_date_from AND d.won_at <= p_date_to
    GROUP BY d.assigned_to
  ),
  response AS (
    SELECT la.actor_id,
           AVG(EXTRACT(EPOCH FROM (la.created_at - l.created_at)) / 60.0) AS avg_min
    FROM lead_activities la
    JOIN roster r ON r.id = la.actor_id
    JOIN leads  l ON l.id = la.lead_id
    WHERE la.action_type = 'status_changed'
      AND la.details->>'new_status' = 'touched'
      AND la.created_at >= p_date_from AND la.created_at <= p_date_to
      AND la.created_at >= l.created_at
    GROUP BY la.actor_id
  )
  SELECT
    r.id,
    r.full_name,
    r.avatar_url,
    r.domain,
    COALESCE(c.total, 0)::bigint,
    COALESCE(cl.won, 0)::bigint,
    COALESCE(cl.lost, 0)::bigint,
    COALESCE(rv.amount, 0)::numeric,
    rs.avg_min
  FROM roster r
  LEFT JOIN cohort   c  ON c.assigned_to  = r.id
  LEFT JOIN closed   cl ON cl.assigned_to = r.id
  LEFT JOIN revenue  rv ON rv.assigned_to = r.id
  LEFT JOIN response rs ON rs.actor_id    = r.id
  ORDER BY r.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_agent_roster_performance(timestamptz, timestamptz, app_domain)
  TO authenticated;

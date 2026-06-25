-- Migration 0146 (agent performance — real daily trend for the lean self-scorecard).
--
-- The agent /performance redesign (docs/audits/2026-06-25-agent-performance-
-- scorecard-redesign.md) replaces the fabricated CoreFourGrid sparklines
-- (makeSpark interpolated a 6-point curve from two numbers) with REAL trend
-- data, and replaces the fixed 14-day call chart with a period-scoped
-- Calls/Notes/Won trend.
--
-- get_agent_performance_trend — SELF-SCOPED (the agent is always auth.uid(),
-- no identity/scope params), so it keeps the client-callable GRANT to
-- authenticated (the get_agent_today_pulse 0108 pattern, NOT the Q-13 revoked
-- tier). Additive — touches no existing function.
--
-- Returns one bucket per IST calendar day in [p_date_from, p_date_to], oldest
-- first, zero-filled:
--   leads_won : leads won (status_changed_at) that day  — the 0101 "won when" def
--   calls     : call notes (call_outcome IS NOT NULL)    — the 0101/0108 "a call" def
--   notes     : ALL notes the agent authored that day    — superset of calls
-- Day bucketing is IST via AT TIME ZONE 'Asia/Kolkata' (same convention as the
-- 0108/0122 14-day trend). The period range bounds arrive IST-correct from the
-- service (getPeriodDateRange → lib/utils/ist). Rate metrics are deliberately
-- absent: a daily conversion/touch/response off 0-2 closes is noise, not trend.

CREATE OR REPLACE FUNCTION get_agent_performance_trend(
  p_date_from timestamptz,
  p_date_to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_agent  uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'get_agent_performance_trend: no authenticated user';
  END IF;

  WITH days AS (
    SELECT generate_series(
      date_trunc('day', p_date_from AT TIME ZONE 'Asia/Kolkata'),
      date_trunc('day', p_date_to   AT TIME ZONE 'Asia/Kolkata'),
      interval '1 day'
    )::date AS d
  ),
  won AS (
    SELECT (l.status_changed_at AT TIME ZONE 'Asia/Kolkata')::date AS d, count(*) AS c
    FROM leads l
    WHERE l.assigned_to = v_agent
      AND l.status = 'won'
      AND l.archived_at IS NULL
      AND l.status_changed_at >= p_date_from
      AND l.status_changed_at <= p_date_to
    GROUP BY 1
  ),
  calls AS (
    SELECT (n.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, count(*) AS c
    FROM lead_notes n
    WHERE n.author_id = v_agent
      AND n.call_outcome IS NOT NULL
      AND n.created_at >= p_date_from
      AND n.created_at <= p_date_to
    GROUP BY 1
  ),
  notes AS (
    SELECT (n.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, count(*) AS c
    FROM lead_notes n
    WHERE n.author_id = v_agent
      AND n.created_at >= p_date_from
      AND n.created_at <= p_date_to
    GROUP BY 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'day',       to_char(days.d, 'YYYY-MM-DD'),
        'leads_won', COALESCE(w.c,  0),
        'calls',     COALESCE(c.c,  0),
        'notes',     COALESCE(nt.c, 0)
      )
      ORDER BY days.d
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM days
  LEFT JOIN won   w  ON w.d  = days.d
  LEFT JOIN calls c  ON c.d  = days.d
  LEFT JOIN notes nt ON nt.d = days.d;

  RETURN v_result;
END;
$$;

-- Self-scoped → safe to keep client-callable (0101/0108 pattern)
GRANT EXECUTE ON FUNCTION get_agent_performance_trend(timestamptz, timestamptz)
  TO authenticated;

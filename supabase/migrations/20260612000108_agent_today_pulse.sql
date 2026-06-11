-- get_agent_today_pulse: the agent Today-view extras in one round trip.
-- SELF-SCOPED like get_agent_performance (0101): the agent is always auth.uid()
-- — no identity params, so an agent can never read another agent's pulse.
--
--   calls_today : call notes (lead_notes with call_outcome) since p_today_start,
--                 split new-vs-old by whether the LEAD was created today
--                 (l.created_at >= p_today_start). new + old always equals total
--                 — the two filters partition the same row set.
--   call_trend  : daily call-note counts for the last 14 IST days. The IST day
--                 boundary arrives as p_today_start (computed via lib/utils/ist
--                 in the service — never re-fork IST math in SQL); buckets are
--                 fixed 24h offsets from it (IST has no DST).
--   deals       : count + revenue from public.deals (won_at in p_date_from..to).
--
-- "Calls" everywhere = lead_notes rows with call_outcome IS NOT NULL — the same
-- definition as get_agent_performance's calls_logged (0101).

CREATE OR REPLACE FUNCTION get_agent_today_pulse(
  p_today_start timestamptz,
  p_date_from   timestamptz,
  p_date_to     timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_agent       uuid := auth.uid();
  v_calls_today jsonb;
  v_trend       jsonb;
  v_deals       jsonb;
BEGIN
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'get_agent_today_pulse: no authenticated user';
  END IF;

  -- Calls today, split by lead age (new = lead created today IST)
  SELECT jsonb_build_object(
    'total',     count(*),
    'new_leads', count(*) FILTER (WHERE l.created_at >= p_today_start),
    'old_leads', count(*) FILTER (WHERE l.created_at <  p_today_start)
  )
  INTO v_calls_today
  FROM lead_notes n
  JOIN leads l ON l.id = n.lead_id
  WHERE n.author_id = v_agent
    AND n.call_outcome IS NOT NULL
    AND n.created_at >= p_today_start;

  -- 14-day call trend — one bucket per IST day, oldest first, zero-filled
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'day',   to_char(d.day_start AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
        'count', COALESCE(c.cnt, 0)
      )
      ORDER BY d.day_start
    ),
    '[]'::jsonb
  )
  INTO v_trend
  FROM (
    SELECT p_today_start - make_interval(days => s.i) AS day_start
    FROM generate_series(13, 0, -1) AS s(i)
  ) d
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM lead_notes n
    WHERE n.author_id = v_agent
      AND n.call_outcome IS NOT NULL
      AND n.created_at >= d.day_start
      AND n.created_at <  d.day_start + interval '1 day'
  ) c ON true;

  -- Deals closed in the active period — public.deals by won_at (never leads)
  SELECT jsonb_build_object(
    'deal_count', count(*),
    'revenue',    COALESCE(SUM(d.deal_amount), 0)
  )
  INTO v_deals
  FROM deals d
  WHERE d.assigned_to = v_agent
    AND d.archived_at IS NULL
    AND d.won_at >= p_date_from
    AND d.won_at <= p_date_to;

  RETURN jsonb_build_object(
    'calls_today', v_calls_today,
    'call_trend',  v_trend,
    'deals',       v_deals
  );
END;
$$;

-- Self-scoped → safe to keep client-callable (0101 pattern)
GRANT EXECUTE ON FUNCTION get_agent_today_pulse(timestamptz, timestamptz, timestamptz)
  TO authenticated;

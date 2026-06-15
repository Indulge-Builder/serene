-- get_agent_today_pulse v2: add notes_today — the genuine since-IST-midnight
-- count of notes the agent has written today, mirroring calls_today's window.
-- CREATE OR REPLACE over 0108 (never edit a migration that has run, A-14).
--
-- WHY: the agent Overview "Today" strip shows Calls / Notes / Won "since
-- midnight IST". Calls and Won already came from this RPC's since-midnight
-- window; Notes was the only value still read from the period-scoped effort
-- field, which is wrong under the "since midnight IST" label whenever the
-- selected period ≠ today. notes_today closes that gap with a true
-- since-p_today_start count over lead_notes the agent authored.
--
--   notes_today : ALL lead_notes the agent authored since p_today_start —
--                 plain notes AND call notes (every note is "a note added
--                 today"). This is intentionally a SUPERSET of calls_today
--                 (which filters call_outcome IS NOT NULL); the strip shows
--                 them side by side and they answer different questions.
--
-- Everything else (calls_today partition, 14-day trend, period deals) is
-- byte-identical to 0108. Self-scoped, client-callable (0101 pattern).

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
  v_notes_today integer;
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

  -- Notes today — ALL notes the agent authored since IST midnight (plain +
  -- call notes). Deliberately NOT filtered on call_outcome, so it is a
  -- superset of calls_today.total.
  SELECT count(*)
  INTO v_notes_today
  FROM lead_notes n
  WHERE n.author_id = v_agent
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
    'notes_today', v_notes_today,
    'call_trend',  v_trend,
    'deals',       v_deals
  );
END;
$$;

-- Self-scoped → safe to keep client-callable (0101 pattern)
GRANT EXECUTE ON FUNCTION get_agent_today_pulse(timestamptz, timestamptz, timestamptz)
  TO authenticated;

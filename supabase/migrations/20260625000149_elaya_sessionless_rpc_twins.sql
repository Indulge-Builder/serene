-- Elaya sessionless RPC twins — channel parity for the 3 self-scoped reads (Phase 1).
--
-- The Elaya data layer (src/lib/elaya/elaya-data.ts) works on BOTH in-app and WhatsApp
-- because it passes the verified principal's identity explicitly and uses the admin
-- client. Three reads could not follow that contract because their existing RPCs derive
-- scope from auth.uid()/get_user_role()/get_user_domain() INSIDE the SQL — which is NULL
-- in the sessionless WhatsApp webhook, so they returned empty there. This migration adds
-- explicit-param twins so Elaya can fetch them with principal-derived identity on either
-- channel. Each twin is a byte-faithful copy of its original body with the auth.uid()/
-- get_user_*() reads replaced by parameters.
--
-- Q-13 (revoked tier): every twin takes caller-supplied scope params, so EXECUTE is
-- REVOKEd from PUBLIC/anon/authenticated and GRANTed to service_role ONLY. The Elaya
-- tool layer (admin client, principal-derived args) is the trust boundary — exactly the
-- 0102 / 0123 / 0144 posture. The ORIGINAL self-scoped functions are untouched and keep
-- their authenticated GRANT for the in-app UI pages that still call them directly.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_group_task_summaries_for_user — explicit-param twin of the auth.uid()
--    flat-visibility group summary (0058). p_user_id replaces auth.uid() in BOTH
--    visibility branches (creator OR subtask assignee). Body otherwise identical.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_group_task_summaries_for_user(
  p_user_id  uuid,
  p_status   text[] DEFAULT NULL,
  p_priority text[] DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  title             text,
  description       text,
  priority          text,
  status            text,
  due_at            timestamptz,
  created_by        uuid,
  domain            text,
  created_at        timestamptz,
  updated_at        timestamptz,
  subtask_total     bigint,
  subtask_completed bigint,
  assignee_ids      uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    tg.id,
    tg.title,
    tg.description,
    tg.priority,
    tg.status,
    tg.due_at,
    tg.created_by,
    tg.domain::text,
    tg.created_at,
    tg.updated_at,
    COUNT(t.id)                                                                  AS subtask_total,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')                           AS subtask_completed,
    array_agg(DISTINCT t.assigned_to) FILTER (WHERE t.assigned_to IS NOT NULL)  AS assignee_ids
  FROM task_groups tg
  LEFT JOIN tasks t
    ON t.group_id = tg.id
   AND t.task_category = 'group_subtask'
  WHERE
    -- Flat visibility: creator OR subtask assignee — p_user_id (principal-derived)
    -- replaces auth.uid(); the Elaya tool layer is the trust boundary (Q-13).
    (
      tg.created_by = p_user_id
      OR EXISTS (
        SELECT 1 FROM tasks sub
        WHERE sub.group_id = tg.id
          AND sub.assigned_to = p_user_id
          AND sub.task_category = 'group_subtask'
      )
    )
    AND (p_status   IS NULL OR tg.status   = ANY(p_status))
    AND (p_priority IS NULL OR tg.priority = ANY(p_priority))
  GROUP BY
    tg.id, tg.title, tg.description, tg.priority, tg.status,
    tg.due_at, tg.created_by, tg.domain, tg.created_at, tg.updated_at
  ORDER BY tg.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION get_group_task_summaries_for_user(uuid, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_group_task_summaries_for_user(uuid, text[], text[]) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_agent_today_pulse_for_user — explicit-param twin of the auth.uid() pulse
--    (0108). p_agent replaces auth.uid(); body otherwise byte-identical.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_agent_today_pulse_for_user(
  p_agent       uuid,
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
  v_agent       uuid := p_agent;
  v_calls_today jsonb;
  v_trend       jsonb;
  v_deals       jsonb;
BEGIN
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'get_agent_today_pulse_for_user: no agent id';
  END IF;

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

REVOKE EXECUTE ON FUNCTION get_agent_today_pulse_for_user(uuid, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_agent_today_pulse_for_user(uuid, timestamptz, timestamptz, timestamptz) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_agent_roster_performance_for_elaya — explicit-param twin of the roster
--    (0101). The original derives v_role/v_domain from auth.uid() ONLY to clamp a
--    manager to their own domain; the Elaya layer already passes the correctly
--    clamped p_domain (manager→own domain, admin/founder→NULL=all), so the twin
--    TRUSTS p_domain (Q-13: the tool layer is the trust boundary). The CTE bodies
--    are byte-identical to the original.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_agent_roster_performance_for_elaya(
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
  v_domain app_domain := p_domain; -- trusted: Elaya passed the clamped scope
BEGIN
  RETURN QUERY
  WITH roster AS (
    SELECT pr.id, pr.full_name, pr.avatar_url, pr.domain
    FROM profiles pr
    WHERE pr.role = 'agent'
      AND pr.is_active = true
      AND (v_domain IS NULL OR pr.domain = v_domain)
  ),
  cohort AS (
    SELECT l.assigned_to, count(*) AS total
    FROM leads l JOIN roster r ON r.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND l.created_at >= p_date_from AND l.created_at <= p_date_to
    GROUP BY l.assigned_to
  ),
  closed AS (
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

REVOKE EXECUTE ON FUNCTION get_agent_roster_performance_for_elaya(timestamptz, timestamptz, app_domain) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_agent_roster_performance_for_elaya(timestamptz, timestamptz, app_domain) TO service_role;

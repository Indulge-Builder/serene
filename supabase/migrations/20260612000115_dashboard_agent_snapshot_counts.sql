-- Migration 0115: Add pending_calls_count + new_leads_count to get_dashboard_summary
--
-- Agent dashboard redesign: two pipeline-snapshot counts seeded on first paint
-- (no per-widget POST — perf-01; extends the one summary RPC instead of fanning out).
--
--   pending_calls_count → open Gia follow-up tasks assigned to the caller
--                         (task_category = 'gia_followup', non-terminal status)
--   new_leads_count     → caller's own non-archived leads still at status 'new'
--
-- Both are LIVE pipeline snapshots (Going Cold class): the dashboard date
-- filter (p_date_from / p_date_to) intentionally does NOT apply — they take
-- zero date inputs. Computed only in the agent branch (the widgets are
-- agent-only); manager/admin/founder receive 0 stubs.
--
-- Signature unchanged (6-param) — no DROP needed. The 0102 revoke posture is
-- re-stated after CREATE OR REPLACE (admin-client-only, Q-13), mirroring 0107.

CREATE OR REPLACE FUNCTION get_dashboard_summary(
  p_role           text,
  p_domain         app_domain,
  p_user_id        uuid,
  p_initial_domain app_domain  DEFAULT NULL,
  p_date_from      timestamptz DEFAULT NULL,
  p_date_to        timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now              timestamptz := now();
  v_result           jsonb;
  v_agent_tasks      jsonb;
  v_activity         jsonb;
  v_lead_status      jsonb;
  v_campaigns        jsonb;
  v_cold_leads_count int;
  v_pending_calls    int;
  v_new_leads        int;
BEGIN

  -- ─────────────────────────────────────────────────────────────────
  -- 1. Agent Tasks — all categories, active statuses only
  --    ALWAYS computed; date filter does NOT apply.
  -- ─────────────────────────────────────────────────────────────────
  WITH task_rows AS (
    SELECT
      t.id,
      t.title,
      t.task_category,
      t.task_type,
      t.priority,
      t.status,
      t.due_at,
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < v_now THEN true ELSE false END AS is_overdue,
      CASE
        WHEN t.task_category = 'gia_followup' THEN
          TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, ''))
        WHEN t.task_category = 'group_subtask' THEN
          tg.title
        ELSE
          NULL
      END AS context_label,
      CASE
        WHEN t.task_category = 'gia_followup' THEN tgm.lead_id::text
        ELSE NULL
      END AS lead_id
    FROM tasks t
    LEFT JOIN task_gia_meta tgm ON tgm.task_id = t.id AND t.task_category = 'gia_followup'
    LEFT JOIN leads l            ON l.id = tgm.lead_id
    LEFT JOIN task_groups tg     ON tg.id = t.group_id AND t.task_category = 'group_subtask'
    WHERE t.assigned_to = p_user_id
      AND t.status IN ('to_do', 'in_progress', 'in_review')
    ORDER BY
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < v_now THEN 0 ELSE 1 END ASC,
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END ASC,
      t.due_at ASC NULLS LAST
    LIMIT 30
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',            r.id,
        'title',         r.title,
        'task_category', r.task_category,
        'task_type',     r.task_type,
        'priority',      r.priority,
        'status',        r.status,
        'due_at',        r.due_at,
        'is_overdue',    r.is_overdue,
        'context_label', r.context_label,
        'lead_id',       r.lead_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_agent_tasks
  FROM task_rows r;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Live Lead Activity — role-scoped
  --    ALWAYS computed; date filter does NOT apply.
  -- ─────────────────────────────────────────────────────────────────
  WITH activity_rows AS (
    SELECT
      la.id,
      la.action_type,
      la.details,
      la.created_at,
      la.lead_id,
      la.actor_id,
      l.first_name,
      l.last_name
    FROM lead_activities la
    LEFT JOIN leads l ON l.id = la.lead_id
    WHERE
      CASE
        WHEN p_role IN ('admin', 'founder') THEN true
        WHEN p_role = 'manager'             THEN l.domain = p_domain
        ELSE                                     la.actor_id = p_user_id
      END
    ORDER BY la.created_at DESC
    LIMIT 25
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          r.id,
        'action_type', r.action_type,
        'details',     r.details,
        'created_at',  r.created_at,
        'lead_id',     r.lead_id,
        'actor_id',    r.actor_id,
        'lead_name',   CASE
                         WHEN r.first_name IS NOT NULL
                         THEN TRIM(r.first_name || ' ' || COALESCE(r.last_name, ''))
                         ELSE NULL
                       END
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_activity
  FROM activity_rows r;

  -- ─────────────────────────────────────────────────────────────────
  -- Role branch: agents skip pipeline/campaign/cold-leads CTEs but get
  -- the two snapshot counts. NO date filter on either count — they are
  -- live pipeline states, not cohort metrics.
  -- ─────────────────────────────────────────────────────────────────
  IF p_role = 'agent' THEN
    SELECT COUNT(*)::int
    INTO v_pending_calls
    FROM tasks t
    WHERE t.assigned_to = p_user_id
      AND t.task_category = 'gia_followup'
      AND t.status IN ('to_do', 'in_progress', 'in_review');

    SELECT COUNT(*)::int
    INTO v_new_leads
    FROM leads l
    WHERE l.assigned_to = p_user_id
      AND l.status = 'new'
      AND l.archived_at IS NULL;

    RETURN jsonb_build_object(
      'agent_tasks',         v_agent_tasks,
      'agent_activity',      v_activity,
      'lead_status',         jsonb_build_object('totals', '[]'::jsonb, 'byAgent', '[]'::jsonb),
      'campaigns',           '[]'::jsonb,
      'cold_leads_count',    0,
      'pending_calls_count', v_pending_calls,
      'new_leads_count',     v_new_leads
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- 3. Lead Status Summary — date filter applied to created_at
  -- ─────────────────────────────────────────────────────────────────
  WITH lead_rows AS (
    SELECT
      l.status,
      l.assigned_to,
      pr.full_name AS agent_name
    FROM leads l
    LEFT JOIN profiles pr ON pr.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND (
        CASE
          WHEN p_role = 'manager'
            THEN l.domain = p_domain
          WHEN p_initial_domain IS NOT NULL
            THEN l.domain = p_initial_domain
          ELSE
            TRUE
        END
      )
      AND (p_date_from IS NULL OR l.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR l.created_at <  p_date_to)
  ),
  status_totals AS (
    SELECT
      status,
      COUNT(*)::int AS cnt
    FROM lead_rows
    GROUP BY status
  ),
  agent_counts AS (
    SELECT
      assigned_to,
      MAX(agent_name) AS agent_name,
      SUM(cnt)::int AS total,
      jsonb_object_agg(status, cnt) AS counts
    FROM (
      SELECT assigned_to, agent_name, status, COUNT(*)::int AS cnt
      FROM lead_rows
      WHERE assigned_to IS NOT NULL
      GROUP BY assigned_to, agent_name, status
    ) sub
    GROUP BY assigned_to
  )
  SELECT jsonb_build_object(
    'totals', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt) ORDER BY
        CASE status
          WHEN 'new'           THEN 1
          WHEN 'touched'       THEN 2
          WHEN 'in_discussion' THEN 3
          WHEN 'nurturing'     THEN 4
          WHEN 'won'           THEN 5
          WHEN 'lost'          THEN 6
          WHEN 'junk'          THEN 7
          ELSE 8
        END
      ) FROM status_totals WHERE cnt > 0),
      '[]'::jsonb
    ),
    'byAgent', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'agent_id',   assigned_to,
          'agent_name', agent_name,
          'counts',     counts,
          'total',      total
        )
        ORDER BY total DESC
      ) FROM agent_counts),
      '[]'::jsonb
    )
  )
  INTO v_lead_status;

  -- ─────────────────────────────────────────────────────────────────
  -- 4. Campaigns — date filter applied to created_at
  -- ─────────────────────────────────────────────────────────────────
  WITH campaign_rows AS (
    SELECT
      utm_campaign AS campaign,
      status
    FROM leads
    WHERE archived_at IS NULL
      AND utm_campaign IS NOT NULL
      AND (
        CASE
          WHEN p_role = 'manager'
            THEN domain = p_domain
          WHEN p_initial_domain IS NOT NULL
            THEN domain = p_initial_domain
          ELSE
            TRUE
        END
      )
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to   IS NULL OR created_at <  p_date_to)
  ),
  campaign_agg AS (
    SELECT
      campaign,
      SUM(cnt)::int AS total,
      jsonb_object_agg(status, cnt) AS mix
    FROM (
      SELECT campaign, status, COUNT(*)::int AS cnt
      FROM campaign_rows
      GROUP BY campaign, status
    ) sub
    GROUP BY campaign
    ORDER BY total DESC
    LIMIT 12
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'campaign', campaign,
        'total',    total,
        'mix',      mix
      )
      ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO v_campaigns
  FROM campaign_agg;

  -- ─────────────────────────────────────────────────────────────────
  -- 5. Cold leads count
  --    Threshold: 5 days — matches COLD_LEAD_THRESHOLD_DAYS constant.
  --    NULL last_activity_at is intentionally excluded (< never matches NULL).
  --    Date filter intentionally NOT applied — live state, not cohort.
  -- ─────────────────────────────────────────────────────────────────
  SELECT COUNT(*)::int
  INTO v_cold_leads_count
  FROM leads l
  WHERE l.archived_at IS NULL
    AND l.status NOT IN ('won', 'lost', 'junk')
    AND l.last_activity_at < v_now - interval '5 days'
    AND (
      p_role IN ('admin', 'founder')
      OR (p_role = 'manager' AND l.domain = p_domain)
    );

  -- ─────────────────────────────────────────────────────────────────
  -- Assemble result — snapshot counts are agent-only (0 stubs here).
  -- ─────────────────────────────────────────────────────────────────
  v_result := jsonb_build_object(
    'agent_tasks',         v_agent_tasks,
    'agent_activity',      v_activity,
    'lead_status',         v_lead_status,
    'campaigns',           v_campaigns,
    'cold_leads_count',    v_cold_leads_count,
    'pending_calls_count', 0,
    'new_leads_count',     0
  );

  RETURN v_result;
END;
$$;

-- Re-state the 0102 revoke posture (Q-13): scope-param RPC, admin client only.
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(text, public.app_domain, uuid, public.app_domain, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(text, public.app_domain, uuid, public.app_domain, timestamptz, timestamptz) TO service_role;

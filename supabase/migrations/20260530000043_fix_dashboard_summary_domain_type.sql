-- Fix get_dashboard_summary: p_domain was text but leads.domain is now app_domain (migration 0041).
-- No =(app_domain, text) operator exists, causing a 42883 runtime error on /dashboard.
-- Solution: change p_domain parameter type from text to app_domain.

CREATE OR REPLACE FUNCTION get_dashboard_summary(
  p_role    text,
  p_domain  app_domain,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now          timestamptz := now();
  v_today_end    timestamptz := date_trunc('day', now()) + interval '23 hours 59 minutes 59 seconds 999 milliseconds';
  v_result       jsonb;
  v_agent_tasks  jsonb;
  v_activity     jsonb;
  v_lead_status  jsonb;
  v_campaigns    jsonb;
BEGIN

  -- ─────────────────────────────────────────────────────────────────
  -- 1. Agent Tasks Summary
  -- ─────────────────────────────────────────────────────────────────
  WITH agent_task_rows AS (
    SELECT
      t.id,
      t.task_type,
      t.due_at,
      tgm.lead_id,
      p.first_name,
      p.last_name,
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < v_now THEN true ELSE false END AS is_overdue
    FROM tasks t
    JOIN task_gia_meta tgm ON tgm.task_id = t.id
    JOIN leads p ON p.id = tgm.lead_id
    WHERE t.assigned_to = p_user_id
      AND t.status = 'to_do'
      AND (t.due_at IS NULL OR t.due_at <= v_today_end)
    ORDER BY t.due_at ASC NULLS LAST
    LIMIT 20
  ),
  new_leads_count AS (
    SELECT COUNT(*)::int AS cnt
    FROM leads
    WHERE assigned_to = p_user_id
      AND status = 'new'
      AND archived_at IS NULL
  )
  SELECT jsonb_build_object(
    'tasks', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',         r.id,
          'task_type',  r.task_type,
          'due_at',     r.due_at,
          'lead_id',    r.lead_id,
          'lead_name',  TRIM(COALESCE(r.first_name, '') || ' ' || COALESCE(r.last_name, '')),
          'is_overdue', r.is_overdue
        )
        ORDER BY r.due_at ASC NULLS LAST
      ),
      '[]'::jsonb
    ),
    'newLeadsCount', (SELECT cnt FROM new_leads_count)
  )
  INTO v_agent_tasks
  FROM agent_task_rows r;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Agent Recent Activity
  -- ─────────────────────────────────────────────────────────────────
  WITH activity_rows AS (
    SELECT
      la.id,
      la.action_type,
      la.details,
      la.created_at,
      la.lead_id,
      l.first_name,
      l.last_name
    FROM lead_activities la
    LEFT JOIN leads l ON l.id = la.lead_id
    WHERE la.actor_id = p_user_id
    ORDER BY la.created_at DESC
    LIMIT 10
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          r.id,
        'action_type', r.action_type,
        'details',     r.details,
        'created_at',  r.created_at,
        'lead_id',     r.lead_id,
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
  -- 3. Lead Status Summary
  -- ─────────────────────────────────────────────────────────────────
  WITH lead_rows AS (
    SELECT
      l.status,
      l.assigned_to,
      pr.full_name AS agent_name
    FROM leads l
    LEFT JOIN profiles pr ON pr.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND (p_role IN ('admin', 'founder') OR l.domain = p_domain)
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
      COUNT(*)::int AS total,
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
  -- 4. Campaigns (top 12 by total leads)
  -- ─────────────────────────────────────────────────────────────────
  WITH campaign_rows AS (
    SELECT
      utm_campaign AS campaign,
      status
    FROM leads
    WHERE archived_at IS NULL
      AND utm_campaign IS NOT NULL
      AND (p_role IN ('admin', 'founder') OR domain = p_domain)
  ),
  campaign_agg AS (
    SELECT
      campaign,
      COUNT(*)::int AS total,
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
  -- Assemble final result
  -- ─────────────────────────────────────────────────────────────────
  v_result := jsonb_build_object(
    'agent_tasks',    v_agent_tasks,
    'agent_activity', v_activity,
    'lead_status',    v_lead_status,
    'campaigns',      v_campaigns
  );

  RETURN v_result;
END;
$$;

-- Drop the old text-signature overload so calls always hit the new app_domain signature.
DROP FUNCTION IF EXISTS get_dashboard_summary(text, text, uuid);

GRANT EXECUTE ON FUNCTION get_dashboard_summary(text, app_domain, uuid) TO authenticated;

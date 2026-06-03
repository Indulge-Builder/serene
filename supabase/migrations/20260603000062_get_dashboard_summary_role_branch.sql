-- Migration 0062: Role-branch + p_initial_domain in get_dashboard_summary
--
-- Changes:
--   1. Adds p_initial_domain app_domain DEFAULT NULL as a 4th parameter.
--   2. Agents: only agent_tasks + agent_activity CTEs execute (skip pipeline/campaign).
--   3. Managers: lead_status + campaigns scoped to p_domain (unchanged behaviour).
--   4. Admin/founder + p_initial_domain IS NOT NULL: scoped to that domain (seeding default tab).
--   5. Admin/founder + p_initial_domain IS NULL: no domain filter (all-org "All" view).
--
-- Overload cleanup: drop the existing 3-param signature first so only one overload exists.

DROP FUNCTION IF EXISTS get_dashboard_summary(text, app_domain, uuid);

CREATE OR REPLACE FUNCTION get_dashboard_summary(
  p_role           text,
  p_domain         app_domain,
  p_user_id        uuid,
  p_initial_domain app_domain DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now          timestamptz := now();
  v_result       jsonb;
  v_agent_tasks  jsonb;
  v_activity     jsonb;
  v_lead_status  jsonb;
  v_campaigns    jsonb;
BEGIN

  -- ─────────────────────────────────────────────────────────────────
  -- 1. Agent Tasks — all categories, active statuses only
  --    Always computed (every role has the Tasks widget).
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
  --    Always computed (every role has the Activity widget).
  --    admin/founder → all activities (no domain filter)
  --    manager       → activities on leads belonging to p_domain
  --    agent         → activities where actor_id = p_user_id
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
  -- Role branch: agents skip the pipeline/campaign CTEs entirely.
  -- Return immediately with empty stubs for those two keys.
  -- ─────────────────────────────────────────────────────────────────
  IF p_role = 'agent' THEN
    RETURN jsonb_build_object(
      'agent_tasks',    v_agent_tasks,
      'agent_activity', v_activity,
      'lead_status',    jsonb_build_object('totals', '[]'::jsonb, 'byAgent', '[]'::jsonb),
      'campaigns',      '[]'::jsonb
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- Domain-scoping logic for manager / admin / founder:
  --   manager                          → always p_domain
  --   admin/founder + p_initial_domain → p_initial_domain (seeding default tab)
  --   admin/founder + NULL             → no domain filter (all-org view)
  -- ─────────────────────────────────────────────────────────────────

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
      AND (
        CASE
          WHEN p_role = 'manager'
            THEN l.domain = p_domain
          WHEN p_initial_domain IS NOT NULL
            THEN l.domain = p_initial_domain
          ELSE
            TRUE  -- admin/founder no-filter (all-org)
        END
      )
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
      AND (
        CASE
          WHEN p_role = 'manager'
            THEN domain = p_domain
          WHEN p_initial_domain IS NOT NULL
            THEN domain = p_initial_domain
          ELSE
            TRUE  -- admin/founder no-filter (all-org)
        END
      )
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

GRANT EXECUTE ON FUNCTION get_dashboard_summary(text, app_domain, uuid, app_domain) TO authenticated;

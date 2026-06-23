-- Migration 0143: Going-cold count honours the global domain selector
--
-- WHY
-- ───
-- On the dashboard, admin/founder pick a domain via the global serene-domain
-- selector; the page passes it as p_initial_domain and the lead_status + campaigns
-- CTEs re-scope to it. The cold-leads count did NOT — its predicate was
--   p_role IN ('admin','founder')  OR  (p_role='manager' AND l.domain = p_domain)
-- i.e. admin/founder were always counted ORG-WIDE, ignoring the picked domain. So
-- "Going Cold" was the one widget that never changed when the domain changed.
--
-- WHAT
-- ────
-- CREATE OR REPLACE get_dashboard_summary from the LIVE deployed body (0140), with
-- the SINGLE change being the cold predicate, repointed to the SAME scoping CASE
-- the lead_status / campaigns CTEs already use:
--   manager           → l.domain = p_domain
--   p_initial_domain  → l.domain = p_initial_domain   (the global pick)
--   else              → all-org (the "All domains" view)
-- Everything else is byte-identical to 0140. The cold cutoff stays cold_lead_cutoff()
-- and the date filter is still intentionally NOT applied (going-cold is a live state).
--
-- The GRANT is re-applied: CREATE OR REPLACE silently drops it. (0102 revoke posture
-- preserved — this function is self/role-scoped and keeps its authenticated GRANT.)

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
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
AS $function$
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
        WHEN tgm.lead_id IS NOT NULL THEN
          TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, ''))
        WHEN t.task_category = 'group_subtask' THEN
          tg.title
        ELSE
          NULL
      END AS context_label,
      CASE
        WHEN tgm.lead_id IS NOT NULL THEN tgm.lead_id::text
        ELSE NULL
      END AS lead_id
    FROM tasks t
    LEFT JOIN task_gia_meta tgm ON tgm.task_id = t.id
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

  IF p_role = 'agent' THEN
    SELECT COUNT(*)::int
    INTO v_pending_calls
    FROM tasks t
    WHERE t.assigned_to = p_user_id
      AND EXISTS (SELECT 1 FROM task_gia_meta m WHERE m.task_id = t.id)
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
  per_agent_status AS (
    SELECT assigned_to, agent_name, status, COUNT(*)::int AS cnt
    FROM lead_rows
    WHERE assigned_to IS NOT NULL
    GROUP BY assigned_to, agent_name, status
  ),
  roster AS (
    SELECT pr.id AS agent_id, pr.full_name AS agent_name
    FROM profiles pr
    WHERE p_role = 'manager'
      AND pr.domain = p_domain
      AND pr.role IN ('agent', 'manager')
      AND pr.is_active = true
  ),
  agent_counts_roster AS (
    SELECT
      r.agent_id   AS assigned_to,
      r.agent_name AS agent_name,
      COALESCE(SUM(pas.cnt), 0)::int AS total,
      COALESCE(
        jsonb_object_agg(pas.status, pas.cnt) FILTER (WHERE pas.status IS NOT NULL),
        '{}'::jsonb
      ) AS counts
    FROM roster r
    LEFT JOIN per_agent_status pas ON pas.assigned_to = r.agent_id
    GROUP BY r.agent_id, r.agent_name
  ),
  agent_counts_cohort AS (
    SELECT
      assigned_to,
      MAX(agent_name) AS agent_name,
      SUM(cnt)::int AS total,
      jsonb_object_agg(status, cnt) AS counts
    FROM per_agent_status
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
    'byAgent', CASE
      WHEN p_role = 'manager' THEN COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'agent_id',   assigned_to,
            'agent_name', agent_name,
            'counts',     counts,
            'total',      total
          )
          ORDER BY total DESC
        ) FROM agent_counts_roster),
        '[]'::jsonb
      )
      ELSE COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'agent_id',   assigned_to,
            'agent_name', agent_name,
            'counts',     counts,
            'total',      total
          )
          ORDER BY total DESC
        ) FROM agent_counts_cohort),
        '[]'::jsonb
      )
    END
  )
  INTO v_lead_status;

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

  -- Cold leads count — non-terminal leads quiet past the cold window.
  -- Cutoff via cold_lead_cutoff() (the single SQL anchor); date filter
  -- intentionally NOT applied — "going cold" is a live state, not a cohort.
  -- Domain scope now MATCHES lead_status / campaigns: manager → own domain,
  -- admin/founder → the global pick (p_initial_domain) or all-org (the FIX).
  SELECT COUNT(*)::int
  INTO v_cold_leads_count
  FROM leads l
  WHERE l.archived_at IS NULL
    AND l.status NOT IN ('won', 'lost', 'junk')
    AND l.last_activity_at < cold_lead_cutoff()
    AND (
      CASE
        WHEN p_role = 'manager'
          THEN l.domain = p_domain
        WHEN p_initial_domain IS NOT NULL
          THEN l.domain = p_initial_domain
        ELSE
          TRUE
      END
    );

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
$function$;

-- Non-negotiable: CREATE OR REPLACE silently drops the existing GRANT.
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(text, app_domain, uuid, app_domain, timestamptz, timestamptz) TO authenticated;

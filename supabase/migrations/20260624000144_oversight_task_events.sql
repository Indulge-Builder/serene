-- ═══════════════════════════════════════════════════════════════════════════
-- Oversight (/oversight) — task_events append-only stream + 3 read RPCs.
--
-- A READ surface over existing task data. The ONLY write this migration adds is
-- an append-only event row per task mutation, inserted by the existing
-- task-mutation cores (service-role) — never from a client/action/UI.
--
-- Domain is DERIVED for tasks (no tasks.domain column): group subtask →
-- task_groups.domain; personal/lead-follow-up task → assignee's profiles.domain.
-- Every aggregation joins BOTH paths via COALESCE(tg.domain, assignee.domain)
-- so personal + group tasks land in the same per-domain bucket (no miss/double).
--
-- All three RPCs take caller-supplied scope params → EXECUTE REVOKEd from
-- PUBLIC/anon/authenticated (Q-13 Tier-2 "revoked", migration 0102 pattern);
-- admin-client-only from the service layer with session-derived args. Manager
-- scope is force-clamped in SQL (the manager tasks RLS is role-only — no domain
-- clamp — so RLS cannot be relied on for team isolation).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── §1. task_event_type enum ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_event_type') THEN
    CREATE TYPE task_event_type AS ENUM (
      'created',
      'status_changed',
      'reassigned',
      'remark_added',
      'overdue'
    );
  END IF;
END$$;

-- ─── §2. task_events table (append-only) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  domain      public.app_domain NOT NULL,
  actor_id    uuid REFERENCES public.profiles(id),
  subject_id  uuid REFERENCES public.profiles(id),
  event_type  public.task_event_type NOT NULL,
  task_title  text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_events_domain_created
  ON public.task_events (domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_events_subject_created
  ON public.task_events (subject_id, created_at DESC);

-- ─── §3. RLS — append-only (A-08 / A-11). manager+ SELECT; NO write policy. ─
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_events_select ON public.task_events;
CREATE POLICY task_events_select ON public.task_events
  FOR SELECT
  USING ((SELECT public.get_user_role()) IN ('manager', 'admin', 'founder'));

-- No INSERT / UPDATE / DELETE policy — ever. Writes are admin-client only from
-- the mutation cores (service-role bypasses RLS). Append-only, no suppression.

-- ─── §4. Realtime ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'task_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_events;
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5a. get_team_task_overview(p_role, p_domain) → Tier 1
-- One row per app_domain with ≥1 active agent (roster-driven, not a hardcoded
-- list). Manager → only their own domain row; admin/founder → all rostered.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_team_task_overview(
  p_role   text,
  p_domain public.app_domain
)
RETURNS TABLE (
  domain          public.app_domain,
  agent_count     bigint,
  open_count      bigint,
  overdue_count   bigint,
  completed_count bigint,
  in_review_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH roster AS (
    -- Every domain that owns active agents = the set of team cards.
    SELECT p.domain AS dom, COUNT(*) AS agent_count
    FROM profiles p
    WHERE p.role = 'agent' AND p.is_active
    GROUP BY p.domain
  ),
  task_dom AS (
    -- Derived domain per task: group → task_groups.domain, else assignee's.
    SELECT
      COALESCE(tg.domain, asg.domain) AS dom,
      t.status,
      t.overdue_at,
      t.completed_at
    FROM tasks t
    LEFT JOIN task_groups tg ON tg.id = t.group_id
    LEFT JOIN profiles    asg ON asg.id = t.assigned_to
  ),
  agg AS (
    SELECT
      td.dom,
      COUNT(*) FILTER (
        WHERE td.status IN ('to_do', 'in_progress', 'in_review')
      ) AS open_count,
      COUNT(*) FILTER (
        WHERE td.overdue_at IS NOT NULL
          AND td.status NOT IN ('completed', 'cancelled', 'error')
      ) AS overdue_count,
      COUNT(*) FILTER (
        WHERE td.status = 'completed'
          AND td.completed_at >= now() - interval '30 days'
      ) AS completed_count,
      COUNT(*) FILTER (WHERE td.status = 'in_review') AS in_review_count
    FROM task_dom td
    WHERE td.dom IS NOT NULL
    GROUP BY td.dom
  )
  SELECT
    r.dom AS domain,
    r.agent_count,
    COALESCE(a.open_count, 0)      AS open_count,
    COALESCE(a.overdue_count, 0)   AS overdue_count,
    COALESCE(a.completed_count, 0) AS completed_count,
    COALESCE(a.in_review_count, 0) AS in_review_count
  FROM roster r
  LEFT JOIN agg a ON a.dom = r.dom
  -- Manager clamp: only their own domain row (action already forces p_domain).
  WHERE (p_role <> 'manager' OR r.dom = p_domain)
  ORDER BY r.dom;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5b. get_team_agent_breakdown(p_role, p_caller_domain, p_domain) → Tier 2
-- One row per active agent in the target domain + their task tallies (over
-- tasks they are assigned_to). Manager → forced to p_caller_domain regardless
-- of p_domain. admin/founder → p_domain.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_team_agent_breakdown(
  p_role          text,
  p_caller_domain public.app_domain,
  p_domain        public.app_domain
)
RETURNS TABLE (
  agent_id        uuid,
  full_name       text,
  avatar_url      text,
  role            text,
  open_count      bigint,
  overdue_count   bigint,
  completed_count bigint,
  in_review_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    -- Manager is force-clamped to their own domain in SQL (defence in depth;
    -- the action also rejects a mismatched request outright).
    SELECT CASE WHEN p_role = 'manager' THEN p_caller_domain ELSE p_domain END AS dom
  )
  SELECT
    p.id   AS agent_id,
    p.full_name,
    p.avatar_url,
    p.role::text,
    COUNT(t.id) FILTER (
      WHERE t.status IN ('to_do', 'in_progress', 'in_review')
    ) AS open_count,
    COUNT(t.id) FILTER (
      WHERE t.overdue_at IS NOT NULL
        AND t.status NOT IN ('completed', 'cancelled', 'error')
    ) AS overdue_count,
    COUNT(t.id) FILTER (
      WHERE t.status = 'completed'
        AND t.completed_at >= now() - interval '30 days'
    ) AS completed_count,
    COUNT(t.id) FILTER (WHERE t.status = 'in_review') AS in_review_count
  FROM profiles p
  CROSS JOIN target tg
  LEFT JOIN tasks t ON t.assigned_to = p.id
  WHERE p.role = 'agent'
    AND p.is_active
    AND p.domain = tg.dom
  GROUP BY p.id, p.full_name, p.avatar_url, p.role
  ORDER BY p.full_name;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5c. get_agent_tasks_oversight(p_agent, p_role, p_caller_domain) → Tier 3
-- The agent's task rows (personal + group) + lead identity when a lead
-- follow-up (task_gia_meta LEFT JOIN — meta-presence, never a category check).
-- Manager clamp: an out-of-domain p_agent returns ZERO rows.
-- The service mapper derives the metric counts from these rows (one query).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_agent_tasks_oversight(
  p_agent         uuid,
  p_role          text,
  p_caller_domain public.app_domain
)
RETURNS TABLE (
  id              uuid,
  title           text,
  status          text,
  priority        text,
  task_category   text,
  module          text,
  group_id        uuid,
  due_at          timestamptz,
  completed_at    timestamptz,
  overdue_at      timestamptz,
  created_at      timestamptz,
  group_title     text,
  lead_id         uuid,
  lead_first_name text,
  lead_last_name  text,
  lead_slug       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.title,
    t.status,
    t.priority,
    t.task_category,
    t.module::text,
    t.group_id,
    t.due_at,
    t.completed_at,
    t.overdue_at,
    t.created_at,
    tg.title       AS group_title,
    m.lead_id,
    l.first_name   AS lead_first_name,
    l.last_name    AS lead_last_name,
    l.slug         AS lead_slug
  FROM tasks t
  LEFT JOIN task_groups   tg ON tg.id = t.group_id
  LEFT JOIN task_gia_meta m  ON m.task_id = t.id   -- meta-presence = lead task
  LEFT JOIN leads         l  ON l.id = m.lead_id
  WHERE t.assigned_to = p_agent
    -- Manager clamp: only an agent in the manager's own domain is visible.
    AND (
      p_role <> 'manager'
      OR (SELECT pr.domain FROM profiles pr WHERE pr.id = p_agent) = p_caller_domain
    )
  ORDER BY
    CASE WHEN t.status IN ('to_do', 'in_progress', 'in_review') THEN 0 ELSE 1 END ASC,
    t.due_at ASC NULLS LAST,
    t.created_at ASC;
$$;

-- ─── §6. REVOKE (Q-13 Tier-2): scope-param RPCs are admin-client-only ───────
REVOKE EXECUTE ON FUNCTION public.get_team_task_overview(text, public.app_domain)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_team_task_overview(text, public.app_domain)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_team_agent_breakdown(text, public.app_domain, public.app_domain)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_team_agent_breakdown(text, public.app_domain, public.app_domain)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_agent_tasks_oversight(uuid, text, public.app_domain)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_agent_tasks_oversight(uuid, text, public.app_domain)
  TO service_role;

COMMENT ON TABLE public.task_events IS
  'Append-only task mutation event stream backing /oversight live rails. '
  'Written ONLY by the task-mutation cores via the admin client (service-role). '
  'No INSERT/UPDATE/DELETE RLS policy — ever (A-11). manager+ SELECT. Realtime ON.';

-- 0210 — Gia moves to its own schema: public.<22 tables> → gia.<same names>.
--
-- Plan and runbook: docs/architecture/schema-restructure-plan.md. Precedent: 0172 moved
-- the WhatsApp group tables into `sia` the same way. Numbered 0210 to stay clear of the
-- 020x files another session is writing this week; it MUST run after 20260917000202
-- (members_rename), which still addresses public.deals.
--
-- What SET SCHEMA carries for free (one catalog row per table, no data copied, inside this
-- transaction): every row, index, trigger, foreign key in both directions, RLS enabled
-- state and every policy (policy expressions are stored parsed, by OID, so a policy that
-- says `FROM public.leads` keeps pointing at the same table), publication membership, and
-- the table's own grants.
--
-- What breaks, handled below:
--   1. Function BODIES are re-parsed at run time. 150+ RPCs are `SET search_path = public`
--      and write `FROM leads`; a handful have no pin at all and rely on the caller's path
--      (the trigger on profiles that inserts agent_routing_config, for one). Every
--      non-extension routine in `public` whose path includes `public` — or has no pin —
--      gets `public, gia`. The routines stay in `public`, so no `.rpc()` call changes.
--   2. PostgREST only serves listed schemas; the session client reads Gia under RLS, so
--      `authenticated` needs USAGE on the schema (its table grants moved with the tables).
--
-- Rollback (rehearsed before production): the reverse loop, `SET SCHEMA public`, the
-- function paths back to `public`, the previous app build promoted.

-- ── 1. The schema and who may enter it ───────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS gia;
GRANT USAGE ON SCHEMA gia TO authenticated, service_role;
-- anon deliberately not granted: nothing anonymous reads the leads business.

-- ── 2. Move the tables (guarded: a table already in gia is skipped) ───────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads', 'lead_activities', 'lead_notes', 'lead_raw_payloads', 'lead_sla_timers',
    'lead_product_enquiries', 'deals', 'sla_policies', 'agent_routing_config',
    'revival_candidates', 'revival_policies', 'domain_targets', 'ad_creatives',
    'ad_spend_daily', 'ad_account_recharges', 'task_gia_meta', 'whatsapp_conversations',
    'whatsapp_messages', 'whatsapp_conversation_reads', 'whatsapp_notification_logs',
    'service_cases', 'conversation_hooks'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA gia', t);
    ELSIF to_regclass('gia.' || t) IS NULL THEN
      RAISE EXCEPTION 'gia move: table % found in neither public nor gia', t;
    END IF;
  END LOOP;
END
$$;

-- ── 3. Grants: what the tables had in public, and the same for future tables ──
GRANT ALL ON ALL TABLES    IN SCHEMA gia TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA gia TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA gia GRANT ALL ON TABLES    TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA gia GRANT ALL ON SEQUENCES TO authenticated, service_role;

-- ── 4. Function search paths: append `gia` to whatever the routine already has ──
-- Verified against the live dump of 2026-09-17: 58 routines are `public`, 2 have no pin,
-- 6 are `public, extensions[, vault]` (vendor search via pg_trgm, the subscription vault
-- functions) — those keep their extras. Touches routines in `public` only, skips
-- extension-owned ones, skips a routine whose pinned path does not include public.
DO $$
DECLARE
  r record;
  n int := 0;
  cur text;
  next text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           (SELECT c FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%') AS sp
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    cur := CASE WHEN r.sp IS NULL THEN 'public' ELSE substr(r.sp, length('search_path=') + 1) END;
    CONTINUE WHEN cur !~ '(^|,)\s*"?public"?\s*(,|$)';   -- strict paths stay strict
    CONTINUE WHEN cur  ~ '(^|,)\s*"?gia"?\s*(,|$)';       -- already done (idempotent)
    next := cur || ', gia';
    EXECUTE format('ALTER ROUTINE public.%I(%s) SET search_path = %s', r.proname, r.args, next);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'gia move: search_path widened on % routine(s)', n;
END
$$;

-- ── 4b. The four routines whose BODY spells `public.<moved table>` ────────────
-- A search path cannot help a qualified name. These are the live definitions from the
-- 2026-09-17 dump with `public.` → `gia.` on the moved tables only; CREATE OR REPLACE
-- keeps each routine's owner and grants.

-- get_agent_roster_performance: 1 reference(s) re-pointed
CREATE OR REPLACE FUNCTION "public"."get_agent_roster_performance"("p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_domain" "public"."app_domain" DEFAULT NULL::"public"."app_domain") RETURNS TABLE("agent_id" "uuid", "agent_name" "text", "agent_avatar_url" "text", "agent_domain" "public"."app_domain", "total_leads" bigint, "won_count" bigint, "lost_count" bigint, "total_deal_amount" numeric, "avg_response_minutes" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET search_path TO 'public', 'gia'
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
    -- deal revenue lives on gia.deals, filtered by won_at (not leads)
    SELECT d.assigned_to, SUM(d.deal_amount) AS amount
    FROM deals d JOIN roster r ON r.id = d.assigned_to
    WHERE d.archived_at IS NULL
      AND d.won_at >= p_date_from AND d.won_at <= p_date_to
    GROUP BY d.assigned_to
  ),
  response AS (
    SELECT la.actor_id,
           AVG(public.business_minutes_between(l.created_at, la.created_at)) AS avg_min
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

-- get_agent_today_pulse: 1 reference(s) re-pointed
CREATE OR REPLACE FUNCTION "public"."get_agent_today_pulse"("p_today_start" timestamp with time zone, "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET search_path TO 'public', 'gia'
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

  -- Deals closed in the active period — gia.deals by won_at (never leads)
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

-- get_deals_summary: 1 reference(s) re-pointed
CREATE OR REPLACE FUNCTION "public"."get_deals_summary"("p_role" "text", "p_caller_domain" "text", "p_filter_domain" "text" DEFAULT NULL::"text", "p_agent_id" "uuid" DEFAULT NULL::"uuid", "p_deal_type" "text" DEFAULT NULL::"text", "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("total_deals" integer, "total_revenue" numeric, "membership_count" integer, "retail_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET search_path TO 'public', 'gia'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::int                                                  AS total_deals,
    COALESCE(SUM(d.deal_amount), 0)                               AS total_revenue,
    COUNT(*) FILTER (WHERE d.deal_type = 'membership')::int       AS membership_count,
    COUNT(*) FILTER (WHERE d.deal_type = 'retail')::int           AS retail_count
  FROM gia.deals d
  WHERE d.archived_at IS NULL
    -- ── Role-level gates (A-09 / Q-13: manager gate uses p_caller_domain only) ──
    AND CASE
          WHEN p_role = 'agent'   THEN d.assigned_to = p_agent_id
          WHEN p_role = 'manager' THEN d.domain = p_caller_domain::app_domain
          ELSE TRUE                   -- admin / founder: optional slice below
        END
    -- ── Admin/founder optional domain slice (p_filter_domain — user-supplied) ──
    -- This branch is NEVER reached for manager (already gated above).
    AND (
      p_role IN ('admin', 'founder') IS FALSE
      OR p_filter_domain IS NULL
      OR d.domain = p_filter_domain::app_domain
    )
    -- ── Admin/founder optional agent slice ──
    AND (
      p_role IN ('admin', 'founder') IS FALSE
      OR p_agent_id IS NULL
      OR d.assigned_to = p_agent_id
    )
    -- ── Optional deal-type filter ──
    AND (p_deal_type IS NULL OR d.deal_type = p_deal_type)
    -- ── Date range — applied to won_at ──
    AND (p_date_from IS NULL OR d.won_at >= p_date_from)
    AND (p_date_to   IS NULL OR d.won_at <= p_date_to);
END;
$$;

-- get_domain_health_metrics: 1 reference(s) re-pointed
CREATE OR REPLACE FUNCTION "public"."get_domain_health_metrics"("p_domains" "public"."app_domain"[], "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) RETURNS TABLE("domain" "public"."app_domain", "total_leads" bigint, "leads_won" bigint, "leads_lost" bigint, "calls_logged" bigint, "in_discussion" bigint, "nurturing" bigint, "total_calls_made" bigint, "total_revenue" numeric, "total_deals" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET search_path TO 'public', 'gia'
    AS $$
  WITH

  domains AS (
    SELECT UNNEST(p_domains) AS d
  ),

  cohort AS (
    SELECT leads.domain, COUNT(*) AS total_leads
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  leads.domain = ANY(p_domains)
    GROUP  BY leads.domain
  ),

  closures AS (
    SELECT
      leads.domain,
      COUNT(*) FILTER (WHERE status = 'won')  AS leads_won,
      COUNT(*) FILTER (WHERE status = 'lost') AS leads_lost
    FROM   leads
    WHERE  archived_at IS NULL
      AND  status IN ('won', 'lost')
      AND  status_changed_at >= p_date_from
      AND  status_changed_at <= p_date_to
      AND  leads.domain = ANY(p_domains)
    GROUP  BY leads.domain
  ),

  -- revenue + deal count: from gia.deals filtered by won_at (deals system)
  revenue AS (
    SELECT
      deals.domain,
      COALESCE(SUM(deal_amount), 0) AS total_revenue,
      COUNT(*)                      AS total_deals
    FROM   deals
    WHERE  archived_at IS NULL
      AND  won_at >= p_date_from
      AND  won_at <= p_date_to
      AND  deals.domain = ANY(p_domains)
    GROUP  BY deals.domain
  ),

  pipeline AS (
    SELECT
      leads.domain,
      COUNT(*) FILTER (WHERE status = 'in_discussion') AS in_discussion,
      COUNT(*) FILTER (WHERE status = 'nurturing')     AS nurturing
    FROM   leads
    WHERE  archived_at IS NULL
      AND  status IN ('in_discussion', 'nurturing')
      AND  leads.domain = ANY(p_domains)
    GROUP  BY leads.domain
  ),

  calls AS (
    SELECT
      l.domain,
      COUNT(*) AS calls_logged
    FROM   lead_notes ln
    JOIN   leads      l  ON l.id = ln.lead_id
    WHERE  l.archived_at   IS NULL
      AND  ln.call_outcome IS NOT NULL
      AND  ln.created_at   >= p_date_from
      AND  ln.created_at   <= p_date_to
      AND  l.domain = ANY(p_domains)
    GROUP  BY l.domain
  ),

  calls_made AS (
    SELECT
      leads.domain,
      COALESCE(SUM(call_count), 0) AS total_calls_made
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  leads.domain = ANY(p_domains)
    GROUP  BY leads.domain
  )

  SELECT
    domains.d                                    AS domain,
    COALESCE(cohort.total_leads,          0)     AS total_leads,
    COALESCE(closures.leads_won,          0)     AS leads_won,
    COALESCE(closures.leads_lost,         0)     AS leads_lost,
    COALESCE(calls.calls_logged,          0)     AS calls_logged,
    COALESCE(pipeline.in_discussion,      0)     AS in_discussion,
    COALESCE(pipeline.nurturing,          0)     AS nurturing,
    COALESCE(calls_made.total_calls_made, 0)     AS total_calls_made,
    COALESCE(revenue.total_revenue,       0)     AS total_revenue,
    COALESCE(revenue.total_deals,         0)     AS total_deals
  FROM    domains
  LEFT JOIN cohort      ON cohort.domain      = domains.d
  LEFT JOIN closures    ON closures.domain    = domains.d
  LEFT JOIN revenue     ON revenue.domain     = domains.d
  LEFT JOIN pipeline    ON pipeline.domain    = domains.d
  LEFT JOIN calls       ON calls.domain       = domains.d
  LEFT JOIN calls_made  ON calls_made.domain  = domains.d;
$$;

-- ── 5. Realtime: membership rides the OID; re-add defensively ─────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_conversations', 'whatsapp_messages'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'gia' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE gia.%I', t);
    END IF;
  END LOOP;
END
$$;

-- ── 6. Expose the schema on the REST path and reload PostgREST ────────────────
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, sia, freshdesk, gia';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

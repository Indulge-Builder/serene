-- Migration 0126: Agent usage / active-time tracking (adoption monitoring)
--
-- Goal: measure how much ACTIVE time each team member spends in Serene, per
-- agent and per domain, today and historically — so we can find low-adoption
-- users and fix what's driving low usage. "Active" = tab visible AND a real
-- interaction in the last ~2 min (NOT merely logged in — agents stay logged in
-- 24/7, so login spans are meaningless). The visibility+interaction gate lives
-- in the client heartbeat (UsagePresence.tsx); this schema only stores the
-- ticks that gate already admitted.
--
-- Two-table, three-job architecture (agreed shape):
--   • Hot path (Redis only, no DB write): the client SETs presence:{userId}
--     every 60s while active; the request path NEVER inserts here.
--   • Snapshot job (Trigger.dev, every 1 min): reads live presence keys and
--     appends one row per active user into usage_heartbeats (admin client).
--   • Rollup job (Trigger.dev): re-rolls TODAY every 15 min + the prior IST day
--     nightly into usage_daily — the dashboard's ONLY source. Idempotent UPSERT
--     (recompute distinct minute-ticks, never accumulate).
--
-- usage_heartbeats is the raw append-only tick log (A-11) — never read by the
-- dashboard, pruned after 30 days (the rollup has already captured them).
-- usage_daily is the rollup the dashboard reads via a SECURITY DEFINER RPC.

-- ─────────────────────────────────────────────────────────────────────────
-- usage_heartbeats — raw append-only ticks (one per active user per snapshot)
-- Append-only (A-11): no UPDATE/DELETE RLS policies. The 30-day prune in the
-- rollup job runs on the admin client (RLS-bypassing system maintenance, the
-- same posture as the whatsapp delivery-receipt write) — NOT a user mutation.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.usage_heartbeats (
  id          bigint generated always as identity primary key,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id),
  domain      public.app_domain NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX usage_heartbeats_user_time_idx
  ON public.usage_heartbeats (user_id, captured_at);

-- ─────────────────────────────────────────────────────────────────────────
-- usage_daily — the rollup, the dashboard's ONLY source.
-- PK (day, user_id, domain) makes the rollup UPSERT idempotent: re-rolling
-- today overwrites the row, never increments it.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.usage_daily (
  day            date              NOT NULL,
  user_id        uuid              NOT NULL REFERENCES public.profiles(id),
  domain         public.app_domain NOT NULL,
  active_minutes integer           NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id, domain)
);

CREATE INDEX usage_daily_day_idx ON public.usage_daily (day);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS (A-08). Deny-by-default: enabled, NO policies.
--   • the snapshot + rollup jobs write via the admin client (service-role
--     bypasses RLS),
--   • the dashboard reads ONLY through the SECURITY DEFINER RPC below
--     (admin-client, Q-13) — never a direct table SELECT.
-- An authenticated session can therefore reach neither table directly.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.usage_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily      ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.usage_heartbeats IS
  'Append-only (A-11) raw active-presence ticks — one row per active user per snapshot-job run. Never read by the dashboard; pruned after 30 days by the rollup job (admin client). Deny-by-default RLS.';
COMMENT ON TABLE public.usage_daily IS
  'Per-(IST day, user, domain) active-minutes rollup — the usage dashboard''s only source. Written idempotently (UPSERT, recompute) by the rollup job; read via get_agent_usage (SECURITY DEFINER, admin-client). Deny-by-default RLS.';

-- ─────────────────────────────────────────────────────────────────────────
-- get_agent_usage(p_today_start, p_history_from) — the dashboard read RPC.
--
-- Returns one jsonb envelope:
--   { today:   [ { user_id, full_name, domain, active_minutes } … ],
--     history: [ { day, user_id, full_name, domain, active_minutes } … ] }
--
-- • today   — recomputed live from usage_heartbeats for the current IST day
--             (distinct minute-ticks per user+domain). Lets the dashboard show
--             today's active time at most one snapshot-interval stale, without
--             waiting for the 15-min rollup. p_today_start is the UTC instant
--             of IST midnight today (computed in lib/utils/ist — never re-fork
--             IST math in SQL).
-- • history — read straight from usage_daily for day >= p_history_from
--             (an IST calendar date), the rolled-up source.
--
-- SECURITY DEFINER + SET search_path = public (A-10). This RPC takes NO
-- caller-supplied scope params and exposes ALL agents' usage by design (it is
-- an admin/founder adoption tool) — so under Q-13 it is the "revoked" tier:
-- EXECUTE is REVOKEd from PUBLIC/anon/authenticated and it is called only via
-- the admin client. The founder/admin gate lives in the SERVICE layer
-- (getAgentUsage → requireProfile-equivalent), NOT in this function — the
-- function never trusts a caller-supplied role.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_agent_usage(
  p_today_start  timestamptz,
  p_history_from date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today   jsonb;
  v_history jsonb;
BEGIN
  -- TODAY — live recompute from raw ticks: distinct minute buckets per
  -- (user, domain) since IST midnight. date_trunc('minute', …) collapses the
  -- once-per-minute snapshot rows; COUNT(DISTINCT …) is the active-minutes
  -- definition (recompute, never accumulate). Cast to int (Q-09 backstop —
  -- the service also coerces).
  WITH today_rows AS (
    SELECT
      h.user_id,
      h.domain,
      COUNT(DISTINCT date_trunc('minute', h.captured_at))::int AS active_minutes
    FROM usage_heartbeats h
    WHERE h.captured_at >= p_today_start
    GROUP BY h.user_id, h.domain
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id',        t.user_id,
        'full_name',      pr.full_name,
        'domain',         t.domain,
        'active_minutes', t.active_minutes
      )
      ORDER BY t.active_minutes DESC, pr.full_name ASC
    ),
    '[]'::jsonb
  )
  INTO v_today
  FROM today_rows t
  LEFT JOIN profiles pr ON pr.id = t.user_id;

  -- HISTORY — straight from the rollup table.
  WITH history_rows AS (
    SELECT
      d.day,
      d.user_id,
      d.domain,
      d.active_minutes
    FROM usage_daily d
    WHERE d.day >= p_history_from
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'day',            r.day,
        'user_id',        r.user_id,
        'full_name',      pr.full_name,
        'domain',         r.domain,
        'active_minutes', r.active_minutes
      )
      ORDER BY r.day ASC, pr.full_name ASC
    ),
    '[]'::jsonb
  )
  INTO v_history
  FROM history_rows r
  LEFT JOIN profiles pr ON pr.id = r.user_id;

  RETURN jsonb_build_object(
    'today',   v_today,
    'history', v_history
  );
END;
$$;

-- Q-13 / 0102 revoke posture: scope-broad RPC, admin-client only. The gated
-- service function (getAgentUsage, admin/founder via requireProfile) is the
-- trust boundary.
REVOKE EXECUTE ON FUNCTION public.get_agent_usage(timestamptz, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_usage(timestamptz, date)
  TO service_role;

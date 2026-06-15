-- get_agent_first_touch_pairs: raw (lead, created_at, first_call_at) pairs for
-- one agent's cohort, for the first-touch speed scorecard on the performance
-- deck (the bucketed card below the call-outcome breakdown).
--
-- WHY THIS RETURNS RAW PAIRS AND NOT BUCKET COUNTS:
--   The five speed buckets (<15m / 15–30m / ≤1h / 1–3h / 3h+) are measured in
--   BUSINESS minutes per the agent's shift (IST, Mon–Sat 09:00–19:00 global
--   fallback; per-agent shift_start/shift_end/shift_days override). That
--   calendar/shift math lives only in TS (lib/utils/sla.businessMinutesBetween
--   + buildAgentShiftOverride) — replicating it in SQL would fork the SLA
--   engine's ruler. So SQL does ONLY what SQL is good at: per lead, the cohort
--   creation time and the EARLIEST qualifying call note. The service mapper runs
--   businessMinutesBetween(created_at, first_call_at, shift) per row and tallies.
--
--   first_call_at = MIN(lead_notes.created_at) WHERE call_outcome IS NOT NULL
--   (the same "a call" definition as get_agent_performance.calls_logged / 0101
--   and get_agent_today_pulse / 0108). NULL when the lead has no call note yet —
--   the service counts those as "untouched", never a speed bucket (the cohort
--   created in the period but not yet called). Buckets sum to leads-with-a-call.
--
--   Cohort = leads ASSIGNED to the agent, created in [p_from, p_to], not
--   archived — the same cohort definition the roster/detail metrics use (0101).
--
-- SCOPE / SECURITY (Q-13): this RPC takes a caller-supplied p_agent and returns
-- exactly that agent's rows — it does NOT self-derive scope. Therefore EXECUTE
-- is REVOKED from authenticated and it is admin-client-only from the service;
-- the manager/admin/founder action (assertDrillAccess) is the trust boundary,
-- exactly like get_agent_roster_performance's scope-param posture (0102).

CREATE OR REPLACE FUNCTION get_agent_first_touch_pairs(
  p_agent uuid,
  p_from  timestamptz,
  p_to    timestamptz
)
RETURNS TABLE(
  lead_id       uuid,
  created_at    timestamptz,
  first_call_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    l.id,
    l.created_at,
    (
      SELECT MIN(n.created_at)
      FROM lead_notes n
      WHERE n.lead_id = l.id
        AND n.call_outcome IS NOT NULL
    ) AS first_call_at
  FROM leads l
  WHERE l.assigned_to = p_agent
    AND l.archived_at IS NULL
    AND l.created_at >= p_from
    AND l.created_at <= p_to;
$$;

-- Scope-param RPC → not client-callable (0102 pattern). The service reaches it
-- via createAdminClient(); the gated action is the trust boundary.
REVOKE EXECUTE ON FUNCTION get_agent_first_touch_pairs(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_agent_first_touch_pairs(uuid, timestamptz, timestamptz)
  TO service_role;

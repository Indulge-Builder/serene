-- Migration 0128: get_silent_leads_for_revival RPC (Lead Revival — sweep scaling)
--
-- The daily revival sweep's silence finder (findSilentLeadsForStatus in
-- revival-service.ts) previously did the judge-once anti-join in Node: it SELECTed
-- EVERY revival_candidates.lead_id into a JS Set and inflated the leads LIMIT by
-- that count (REVIVAL_SWEEP_BATCH_PER_STATUS + judgedLeadIds.size). Both the row
-- transfer and the LIMIT grew unbounded with the ledger — over time the sweep
-- ships the whole candidate table to Node every night and the leads scan widens
-- without bound (audit #8/#14).
--
-- This pushes the anti-join into Postgres: one bounded query returns up to
-- p_limit silent leads in the trigger status with NO revival_candidate of ANY
-- status. The NOT EXISTS is served by idx_revival_candidates_lead
-- (lead_id, created_at DESC) from migration 0119. Both the transfer and the LIMIT
-- now stay fixed at the batch size regardless of ledger history.
--
-- Semantics are byte-identical to the prior Node logic:
--   • status = p_status, archived_at IS NULL, assigned_to IS NOT NULL
--   • status_changed_at < p_threshold  (the status-entry clock)
--   • (last_activity_at IS NULL OR last_activity_at < p_threshold)
--     (a recent call note keeps the lead out of the pool)
--   • NOT EXISTS any candidate for the lead (judge-once, all statuses)
--   • ORDER BY status_changed_at ASC (oldest-silent first), LIMIT p_limit
--
-- Q-13 posture: this RPC takes a caller-supplied status/threshold scope and is a
-- sweep-internal tool (no per-user gate). EXECUTE is REVOKEd from
-- PUBLIC/anon/authenticated and GRANTed to service_role only — the daily
-- Trigger.dev sweep calls it via the admin client (same posture as
-- get_next_round_robin_agent / get_agent_usage). It returns lead identity the
-- sweep already reads via the admin client today, so it widens nothing.

CREATE OR REPLACE FUNCTION public.get_silent_leads_for_revival(
  p_status    text,
  p_threshold timestamptz,
  p_limit     integer
)
RETURNS TABLE (
  id          uuid,
  slug        text,
  assigned_to uuid,
  domain      app_domain,
  status      text,
  first_name  text,
  last_name   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.slug,
    l.assigned_to,
    l.domain,
    l.status,
    l.first_name,
    l.last_name
  FROM leads l
  WHERE l.status              = p_status
    AND l.archived_at        IS NULL
    AND l.assigned_to        IS NOT NULL
    AND l.status_changed_at   < p_threshold
    AND (l.last_activity_at IS NULL OR l.last_activity_at < p_threshold)
    AND NOT EXISTS (
      SELECT 1 FROM revival_candidates rc WHERE rc.lead_id = l.id
    )
  ORDER BY l.status_changed_at ASC
  LIMIT p_limit;
$$;

-- Q-13 / 0102 revoke posture: sweep-internal, admin-client only.
REVOKE EXECUTE ON FUNCTION public.get_silent_leads_for_revival(text, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_silent_leads_for_revival(text, timestamptz, integer)
  TO service_role;

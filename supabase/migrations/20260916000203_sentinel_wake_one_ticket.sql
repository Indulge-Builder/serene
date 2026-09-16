-- 0203 — claim_sentinel_wakes learns to claim ONE named ticket (the "Wake now" button).
--
-- Why: the ticket page's Wake now (changelog 2026-09-15) calls
-- claim_sentinel_wakes(p_limit, p_lease_min, p_ticket_id), but that signature was written
-- into 0199 AFTER 0199 had already run on production, so production still held only the
-- two-argument function and the button failed with "function not found" (PGRST202,
-- verified 2026-09-16). A run migration is never edited (A-14): 0199 is restored to what
-- ran, and this migration carries the change.
--
-- Postgres treats a different argument list as a NEW overload, so the old two-argument
-- function is dropped first — otherwise the minute sweep's named call
-- (p_limit, p_lease_min) would match both and PostgREST would refuse it as ambiguous.
-- The sweep keeps working unchanged: p_ticket_id defaults to NULL, which is the old
-- "everything due" behaviour.

DROP FUNCTION IF EXISTS sia.claim_sentinel_wakes(integer, integer);

CREATE OR REPLACE FUNCTION sia.claim_sentinel_wakes(
  p_limit integer DEFAULT 20,
  p_lease_min integer DEFAULT 5,
  p_ticket_id uuid DEFAULT NULL
)
RETURNS SETOF sia.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sia, public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id FROM sia.tickets
    WHERE status NOT IN ('closed', 'dropped')
      AND ((p_ticket_id IS NOT NULL AND id = p_ticket_id) OR (p_ticket_id IS NULL AND next_wake_at <= now()))
    ORDER BY next_wake_at ASC NULLS FIRST
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE sia.tickets t
  SET next_wake_at = now() + make_interval(mins => p_lease_min)
  FROM due WHERE t.id = due.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION sia.claim_sentinel_wakes(integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.claim_sentinel_wakes(integer, integer, uuid) TO service_role;

-- Migration 079: refresh_lead_health_bulk() RPC
-- Called by the hourly Trigger.dev job (refresh-lead-health.ts).
-- Performs a single UPDATE over all active, non-terminal, non-archived leads.
-- SECURITY DEFINER is required so the Trigger.dev service-role call can bypass
-- RLS and update leads regardless of assignment or domain.
--
-- The CASE expression mirrors computeLeadHealth() in src/lib/utils/lead-health.ts.
-- at_risk is evaluated BEFORE needs_attention — SQL CASE short-circuits on first match.
-- Do not reorder — inverted order silently downgrades at-risk leads.
--
-- Returns integer — the number of rows updated.

CREATE OR REPLACE FUNCTION refresh_lead_health_bulk()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE leads
  SET lead_health = CASE
    -- Terminal statuses → NULL (health is meaningless for closed leads)
    WHEN status IN ('won', 'lost', 'junk') THEN NULL

    -- at_risk (evaluated first — CASE short-circuits on first WHEN match)
    WHEN (
      -- No activity for > 7 days (use created_at when last_activity_at is null)
      (last_activity_at IS NOT NULL AND last_activity_at < NOW() - INTERVAL '7 days')
      OR (last_activity_at IS NULL  AND created_at         < NOW() - INTERVAL '7 days')
      -- New lead, never called, older than 5 days
      OR (status = 'new' AND call_count = 0 AND created_at < NOW() - INTERVAL '5 days')
      -- Stuck in touched for > 14 days
      OR (
        status = 'touched'
        AND status_changed_at IS NOT NULL
        AND status_changed_at < NOW() - INTERVAL '14 days'
      )
    ) THEN 'at_risk'

    -- needs_attention
    WHEN (
      -- No activity for > 3 days
      (last_activity_at IS NOT NULL AND last_activity_at < NOW() - INTERVAL '3 days')
      OR (last_activity_at IS NULL  AND created_at         < NOW() - INTERVAL '3 days')
      -- At least one overdue Gia follow-up task for this lead
      OR EXISTS (
        SELECT 1
        FROM tasks t
        INNER JOIN task_gia_meta tgm ON tgm.task_id = t.id
        WHERE tgm.lead_id   = leads.id
          AND t.due_at      < NOW()
          AND t.status NOT IN ('completed', 'cancelled', 'error')
      )
    ) THEN 'needs_attention'

    -- Default: active lead with recent engagement
    ELSE 'healthy'
  END
  WHERE archived_at IS NULL
    AND status NOT IN ('won', 'lost', 'junk');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Only service-role (Trigger.dev) and authenticated users (for future admin use) need EXECUTE.
GRANT EXECUTE ON FUNCTION refresh_lead_health_bulk() TO authenticated;

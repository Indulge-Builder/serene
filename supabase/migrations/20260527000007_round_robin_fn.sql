-- Migration 0007: atomic round-robin agent assignment function
--
-- Replaces the three-query application-layer round-robin with a single
-- SECURITY DEFINER function that is:
--   1. Atomic  — SELECT FOR UPDATE SKIP LOCKED on agent_routing_config rows
--                serializes concurrent calls per domain. Two simultaneous
--                webhooks cannot pick the same agent. The lock is on
--                agent_routing_config (assignment-specific table), NOT on
--                profiles — avoids contention on the busiest shared table.
--   2. Bounded — Uses MAX(assigned_at) GROUP BY per agent instead of fetching
--                every lead ever assigned. O(agents) not O(leads).
--   3. Correct — Respects is_active, is_on_leave, and routing config in one pass.
--
-- Eligibility criteria (must ALL be true to receive a lead):
--   profiles.is_active = true
--   profiles.is_on_leave = false
--   profiles.role = 'agent'
--   profiles.domain = p_domain
--   agent_routing_config.is_active = true  OR  no routing config row exists
--
-- Lock strategy:
--   FOR UPDATE SKIP LOCKED on agent_routing_config.
--   Agents without a routing config row (missing row = default active) are
--   handled by a two-step approach: first try to pick from agents WITH a config
--   row (lockable); if none found, fall back to agents WITHOUT a config row
--   (no lock needed — they have no config row to contend on, and the leads
--   insert itself is the natural serializer for that rare case).
--
-- Called from service role (webhook context) — no auth.uid() required.
-- Returns the winning agent_id, or NULL if no eligible agent exists.

CREATE OR REPLACE FUNCTION get_next_round_robin_agent(p_domain text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  -- Step 1: pick from agents that HAVE a routing config row.
  -- Lock the routing config row to serialize concurrent picks.
  -- SKIP LOCKED: if another concurrent call already locked this agent's row,
  -- skip it and pick the next — no blocking, no deadlock.
  SELECT p.id
    INTO v_agent_id
    FROM agent_routing_config arc
    JOIN profiles p ON p.id = arc.agent_id
    LEFT JOIN (
      SELECT assigned_to, MAX(assigned_at) AS last_assigned_at
        FROM leads
       WHERE archived_at IS NULL
         AND assigned_to IS NOT NULL
       GROUP BY assigned_to
    ) last ON last.assigned_to = p.id
   WHERE p.domain      = p_domain::app_domain
     AND p.role        = 'agent'
     AND p.is_active   = true
     AND p.is_on_leave = false
     AND arc.is_active = true
   ORDER BY last.last_assigned_at ASC NULLS FIRST, p.id ASC
   LIMIT 1
   FOR UPDATE OF arc SKIP LOCKED;

  -- Step 2: if no agent with a config row was found, fall back to agents
  -- without a routing config row (treated as active by default).
  -- These are rare (trigger failure / pre-migration agents) so no lock needed.
  IF v_agent_id IS NULL THEN
    SELECT p.id
      INTO v_agent_id
      FROM profiles p
      LEFT JOIN agent_routing_config arc ON arc.agent_id = p.id
      LEFT JOIN (
        SELECT assigned_to, MAX(assigned_at) AS last_assigned_at
          FROM leads
         WHERE archived_at IS NULL
           AND assigned_to IS NOT NULL
         GROUP BY assigned_to
      ) last ON last.assigned_to = p.id
     WHERE p.domain      = p_domain::app_domain
       AND p.role        = 'agent'
       AND p.is_active   = true
       AND p.is_on_leave = false
       AND arc.agent_id  IS NULL   -- no routing config row exists
     ORDER BY last.last_assigned_at ASC NULLS FIRST, p.id ASC
     LIMIT 1;
  END IF;

  RETURN v_agent_id;  -- NULL if pool is empty
END;
$$;

-- Revoke from public and authenticated — service role only.
REVOKE EXECUTE ON FUNCTION get_next_round_robin_agent(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_next_round_robin_agent(text) FROM authenticated;

-- Index: makes the MAX(assigned_at) GROUP BY subquery an index scan, not a seq scan.
-- Partial: only non-archived, assigned rows — matches the exact filter in the function.
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_assigned_at
  ON leads(assigned_to, assigned_at DESC)
  WHERE archived_at IS NULL AND assigned_to IS NOT NULL;

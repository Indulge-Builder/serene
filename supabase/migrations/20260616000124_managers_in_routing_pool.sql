-- Migration 0124: managers join the round-robin routing pool
--
-- Until now the routing pool was agents only:
--   * agent_routing_config rows were auto-created only for role = 'agent'
--   * get_next_round_robin_agent assigned only to role = 'agent'
-- Managers carry and call leads alongside agents (LEAD_ASSIGNABLE_ROLES /
-- ROUTING_POOL_ROLES in lib/constants/roles.ts already encodes this for the
-- assignment pickers). This migration brings the auto-assignment + shift/pool
-- config in line so a manager:
--   * gets an agent_routing_config row automatically (editable shift + pool toggle
--     in /settings — they already see their own domain's roster)
--   * receives round-robin leads in the SAME fair queue as agents when their
--     pool toggle (is_active) is on
--
-- Pool membership = role IN ('agent','manager'). This literal list mirrors
-- ROUTING_POOL_ROLES in lib/constants/roles.ts — keep them in sync.
--
-- Revival/SLA shift math, the Settings roster query, and the JS round-robin
-- fallback all gate on the same set in the application layer.

-- ─────────────────────────────────────────────────────────
-- 1. Auto-create routing config for managers too
--    (the on_agent_profile_created trigger fires this function)
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_agent_routing_config()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- INSERT case: new pool-member profile (agent or manager)
  IF (TG_OP = 'INSERT' AND NEW.role IN ('agent', 'manager')) THEN
    INSERT INTO agent_routing_config (agent_id, is_active)
    VALUES (NEW.id, true)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;

  -- UPDATE case: role changed TO a pool role from a non-pool role
  -- (e.g. agent → manager keeps its row; guest/admin → manager gains one)
  IF (TG_OP = 'UPDATE'
      AND NEW.role IN ('agent', 'manager')
      AND OLD.role NOT IN ('agent', 'manager')) THEN
    INSERT INTO agent_routing_config (agent_id, is_active)
    VALUES (NEW.id, true)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- 2. Backfill config rows for existing managers
--    (active managers only — inactive ones get a row if/when reactivated via
--     the UPDATE branch; harmless to include, but we mirror the trigger's intent)
-- ─────────────────────────────────────────────────────────
INSERT INTO agent_routing_config (agent_id, is_active)
SELECT p.id, true
  FROM profiles p
 WHERE p.role = 'manager'
 ON CONFLICT (agent_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 3. Round-robin: include managers in both eligibility passes
--    (body identical to migration 0007 except the role predicate)
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_next_round_robin_agent(p_domain text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  -- Step 1: pick from pool members that HAVE a routing config row.
  -- Lock the routing config row to serialize concurrent picks (SKIP LOCKED).
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
     AND p.role        IN ('agent', 'manager')
     AND p.is_active   = true
     AND p.is_on_leave = false
     AND arc.is_active = true
   ORDER BY last.last_assigned_at ASC NULLS FIRST, p.id ASC
   LIMIT 1
   FOR UPDATE OF arc SKIP LOCKED;

  -- Step 2: fall back to pool members WITHOUT a routing config row
  -- (rare — trigger failure / pre-migration profiles; treated as active).
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
       AND p.role        IN ('agent', 'manager')
       AND p.is_active   = true
       AND p.is_on_leave = false
       AND arc.agent_id  IS NULL
     ORDER BY last.last_assigned_at ASC NULLS FIRST, p.id ASC
     LIMIT 1;
  END IF;

  RETURN v_agent_id;  -- NULL if pool is empty
END;
$$;

-- EXECUTE posture unchanged from 0007: service-role only.
REVOKE EXECUTE ON FUNCTION get_next_round_robin_agent(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_next_round_robin_agent(text) FROM authenticated;

-- Migration 0002: agent_routing_config table
-- One row per agent. Controls round-robin lead assignment eligibility.
-- Auto-created when a user with role='agent' is inserted into profiles.

-- ─────────────────────────────────────────────────────────
-- agent_routing_config table
-- ─────────────────────────────────────────────────────────
CREATE TABLE agent_routing_config (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid        NOT NULL UNIQUE
                            REFERENCES profiles(id)
                            ON DELETE CASCADE,
  is_active     boolean     NOT NULL DEFAULT true,
  shift_start   time,                          -- optional: e.g. 09:00
  shift_end     time,                          -- optional: e.g. 18:00
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_routing_config_agent_id
  ON agent_routing_config(agent_id);

CREATE INDEX idx_agent_routing_config_active
  ON agent_routing_config(is_active)
  WHERE is_active = true;

CREATE TRIGGER agent_routing_config_updated_at
  BEFORE UPDATE ON agent_routing_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────
-- RLS on agent_routing_config
-- ─────────────────────────────────────────────────────────
ALTER TABLE agent_routing_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for round-robin logic and UI)
CREATE POLICY "routing_config_select"
  ON agent_routing_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only manager, admin, founder can update is_active / shift times
CREATE POLICY "routing_config_update"
  ON agent_routing_config FOR UPDATE
  USING (get_user_role() IN ('manager', 'admin', 'founder'))
  WITH CHECK (get_user_role() IN ('manager', 'admin', 'founder'));

-- No app-layer INSERT — rows are created by the trigger below only.
-- No DELETE — rows are soft-deactivated via is_active.

-- ─────────────────────────────────────────────────────────
-- Trigger: auto-create routing config when an agent is created
-- Fires AFTER INSERT on profiles where role = 'agent'.
-- Also fires AFTER UPDATE when role is changed TO 'agent'.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_agent_routing_config()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- INSERT case: new agent profile
  IF (TG_OP = 'INSERT' AND NEW.role = 'agent') THEN
    INSERT INTO agent_routing_config (agent_id, is_active)
    VALUES (NEW.id, true)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;

  -- UPDATE case: role changed to agent (e.g. promoted/changed)
  IF (TG_OP = 'UPDATE' AND NEW.role = 'agent' AND OLD.role <> 'agent') THEN
    INSERT INTO agent_routing_config (agent_id, is_active)
    VALUES (NEW.id, true)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_agent_profile_created
  AFTER INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_agent_routing_config();

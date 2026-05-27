-- Migration 0009: personal_details JSONB on leads
--
-- Adds a structured-but-flexible JSONB column for agent-collected enrichment.
-- Distinct from:
--   form_data          → immutable raw webhook payload, never mutated after insert
--   private_scratchpad → ephemeral personal notes, cleared on reassign
--   lead_notes         → append-only call log
--
-- personal_details holds information the agent learns during conversation:
-- city, nationality, property type, budget, occupation, remarks, etc.
-- New fields can be added without a schema migration.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS personal_details jsonb DEFAULT NULL;

COMMENT ON COLUMN leads.personal_details IS
  'Agent-collected biographical/preference enrichment. Mutable. Keys are open-ended.';

-- No new RLS policies needed.
-- The existing leads RLS covers SELECT/UPDATE on this column:
--   - Agents: only their assigned leads (assigned_to = auth.uid())
--   - Managers: all leads in their domain
--   - Admin/Founder: all leads
-- The application-layer access check in the server action is the second layer (rule A-09).

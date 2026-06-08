-- Migration 077: lead_health column + partial index
-- Adds a persisted health tier to leads.
-- NULL = not yet evaluated, or terminal status (won/lost/junk).
-- Populated by: hourly refresh job (refresh-lead-health.ts) and three RPC hooks (migration 078).

ALTER TABLE leads
  ADD COLUMN lead_health text
  CHECK (lead_health IN ('healthy', 'needs_attention', 'at_risk'));

-- Composite index supports the AgentDetailPanel breakdown query (GROUP BY lead_health)
-- and the leads list filter (.eq('lead_health', ...)) on the active, non-terminal slice.
CREATE INDEX idx_leads_health
  ON leads (lead_health, assigned_to)
  WHERE archived_at IS NULL;

-- Performance page indexes
-- Three query shapes used by performance-service.ts
-- All added before writing service functions per spec.

CREATE INDEX IF NOT EXISTS idx_lead_activities_actor_status
  ON lead_activities(actor_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_notes_author_outcome
  ON lead_notes(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_status_created
  ON leads(assigned_to, status, created_at DESC) WHERE archived_at IS NULL;

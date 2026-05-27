-- Migration: lead filter indexes
-- Partial indexes on commonly-filtered columns to support server-side filtering
-- without touching RLS. All indexes are partial (WHERE archived_at IS NULL).

CREATE INDEX IF NOT EXISTS idx_leads_utm_source
  ON leads(utm_source) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign
  ON leads(utm_campaign) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_call_outcome
  ON leads(last_call_outcome) WHERE archived_at IS NULL;

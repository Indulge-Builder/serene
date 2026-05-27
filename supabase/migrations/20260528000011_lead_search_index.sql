-- Migration: phone text search index
-- text_pattern_ops enables prefix and substring ILIKE matching without a sequential scan.
-- Partial index (WHERE archived_at IS NULL) keeps the index small and fast.

CREATE INDEX IF NOT EXISTS idx_leads_phone_text
  ON leads(phone text_pattern_ops) WHERE archived_at IS NULL;

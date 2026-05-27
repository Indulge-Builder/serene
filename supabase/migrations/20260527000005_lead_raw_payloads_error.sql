-- Migration 0005: lead_raw_payloads — add ingestion_error column
-- Allows distinguishing three states for any logged payload:
--   lead_id = uuid, ingestion_error = null  → ingested successfully
--   lead_id = null, ingestion_error = text  → ingestion failed; reason recorded
--   lead_id = null, ingestion_error = null  → in-flight (should not persist)

ALTER TABLE lead_raw_payloads
  ADD COLUMN ingestion_error text;

COMMENT ON COLUMN lead_raw_payloads.ingestion_error IS
  'Null on success. Error reason string when ingestion failed. Never updated after set.';

-- Migration 0066: Add dedicated city column to leads
-- city was previously stored inside personal_details JSONB.
-- Promoting to a top-level column enables direct display and cleaner access.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS city text;

-- Backfill: copy city out of personal_details for any rows that already have it
UPDATE leads
SET city = personal_details->>'city'
WHERE personal_details->>'city' IS NOT NULL
  AND personal_details->>'city' != '';

-- Remove the city key from personal_details JSONB now that it has its own column
UPDATE leads
SET personal_details = personal_details - 'city'
WHERE personal_details ? 'city';

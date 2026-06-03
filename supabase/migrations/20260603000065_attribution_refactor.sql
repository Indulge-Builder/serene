-- Attribution refactor: 7 flat columns → source, medium, utm_campaign + attribution JSONB
-- Removes: platform, campaign_id, ad_name, utm_content (moved into attribution JSONB)
-- Renames: utm_source → source, utm_medium → medium
-- Adds: attribution jsonb (stores platform-specific ad metadata)

-- 1. Add new JSONB column
ALTER TABLE leads ADD COLUMN attribution jsonb;

-- 2. Backfill: migrate flat ad columns into JSONB (only where something to store)
UPDATE leads
SET attribution = jsonb_strip_nulls(jsonb_build_object(
  'platform',    platform,
  'campaign_id', campaign_id,
  'ad_name',     ad_name,
  'adset_name',  utm_content
))
WHERE platform IS NOT NULL
   OR campaign_id IS NOT NULL
   OR ad_name IS NOT NULL
   OR utm_content IS NOT NULL;

-- 3. Rename flat columns
ALTER TABLE leads RENAME COLUMN utm_source TO source;
ALTER TABLE leads RENAME COLUMN utm_medium TO medium;

-- 4. Drop old flat columns
ALTER TABLE leads
  DROP COLUMN platform,
  DROP COLUMN campaign_id,
  DROP COLUMN ad_name,
  DROP COLUMN utm_content;

-- 5. Drop old utm_source index; recreate under new column name
DROP INDEX IF EXISTS idx_leads_utm_source;
CREATE INDEX idx_leads_source ON leads(source) WHERE archived_at IS NULL;
-- idx_leads_utm_campaign: column name unchanged — no action needed

-- RLS is unchanged: UPDATE policy covers all columns; no column-level grants needed.

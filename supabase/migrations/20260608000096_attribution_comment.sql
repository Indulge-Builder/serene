-- 20260608000096_attribution_comment.sql
-- Document the contract of leads.attribution. No data changes.
-- The column was created by migration 0065 (attribution refactor) and is now
-- written on every lead INSERT by the ingestion service. This COMMENT records
-- the schema contract: a full UTM/platform snapshot, immutable after insert.

COMMENT ON COLUMN public.leads.attribution IS
  'Full attribution snapshot at ingestion time. Immutable after insert.
   Contains all UTM and platform fields available from the webhook payload:
   utm_source, utm_medium, utm_campaign, utm_content, platform, ad_name,
   campaign_id, and any other attribution fields present on the normalized
   payload. The flat columns (source, medium, utm_campaign) are indexed
   and used for filtering. This column is the complete historical record
   for future analysis. Never updated after the lead row is created.';

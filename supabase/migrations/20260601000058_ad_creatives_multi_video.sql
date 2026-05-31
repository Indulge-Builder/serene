-- Multiple ad videos per campaign.
-- Originally ad_creatives.campaign_key was UNIQUE (one video per campaign).
-- We now allow many rows per campaign_key — each row is one ad video.
-- The normalisation CHECK and the lookup index are preserved.

-- The UNIQUE constraint was created inline on the column. PostgreSQL names such
-- a constraint <table>_<column>_key. Drop it if present (idempotent guard).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'ad_creatives_campaign_key_key'
      AND  conrelid = 'public.ad_creatives'::regclass
  ) THEN
    ALTER TABLE public.ad_creatives DROP CONSTRAINT ad_creatives_campaign_key_key;
  END IF;
END $$;

-- Dropping a UNIQUE constraint also drops its backing unique index. Ensure a
-- plain (non-unique) index still exists for the campaign_key lookups
-- (getAdCreativeForCampaign / getAdCreativesForCampaigns). idx_ad_creatives_campaign_key
-- from migration 0012 is a separate, non-unique index and remains — recreate
-- defensively in case an environment only had the unique index.
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_key
  ON public.ad_creatives(campaign_key);

-- Normalisation invariant (lowercase + trim) is unchanged — the CHECK constraint
-- ad_creatives_campaign_key_normalised from migration 0012 still applies.

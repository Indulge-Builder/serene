-- ad_creatives: lookup table mapping normalised campaign keys to Meta ad video assets.
-- Joined by string match only — no FK from leads. Campaign names are immutable post-ingestion.

CREATE TABLE IF NOT EXISTS ad_creatives (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key  text        NOT NULL UNIQUE,
  ad_name       text,
  video_url     text        NOT NULL,
  thumbnail_url text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Normalisation invariant: campaign_key must always be lowercase and trimmed.
  CONSTRAINT ad_creatives_campaign_key_normalised
    CHECK (campaign_key = lower(trim(campaign_key)))
);

ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (agents need to resolve creatives on the dossier).
CREATE POLICY "ad_creatives_select_authenticated"
  ON ad_creatives FOR SELECT
  TO authenticated
  USING (true);

-- Only admin and founder may insert/update/delete.
CREATE POLICY "ad_creatives_insert_admin_founder"
  ON ad_creatives FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'founder')
  );

CREATE POLICY "ad_creatives_update_admin_founder"
  ON ad_creatives FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'founder')
  );

CREATE POLICY "ad_creatives_delete_admin_founder"
  ON ad_creatives FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'founder')
  );

CREATE INDEX idx_ad_creatives_campaign_key ON ad_creatives(campaign_key);

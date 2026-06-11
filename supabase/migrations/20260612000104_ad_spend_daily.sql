-- ad_spend_daily: day-grain Meta ad spend ingested from CSV exports (budget page).
-- One row per (campaign_key, spend_date, source). Upserted by the admin/founder
-- upload action — re-uploading the same file is idempotent on the unique key.
--
-- campaign_key carries the SAME normalisation invariant as ad_creatives
-- (lowercase + trim — migration 0012): the budget RPC joins spend to leads on
-- lower(trim(leads.utm_campaign)) = campaign_key, so a fork here would silently
-- orphan spend from leads.

CREATE TABLE IF NOT EXISTS ad_spend_daily (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key  text          NOT NULL,
  spend_date    date          NOT NULL,
  spend         numeric(12,2) NOT NULL CHECK (spend >= 0),
  results       integer       CHECK (results      IS NULL OR results      >= 0),
  impressions   integer       CHECK (impressions  IS NULL OR impressions  >= 0),
  reach         integer       CHECK (reach        IS NULL OR reach        >= 0),
  link_clicks   integer       CHECK (link_clicks  IS NULL OR link_clicks  >= 0),
  currency      text          NOT NULL DEFAULT 'INR',
  uploaded_by   uuid          REFERENCES public.profiles(id),
  source        text          NOT NULL DEFAULT 'meta_csv',
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  -- Normalisation invariant — must match ad_creatives_campaign_key_normalised (0012)
  CONSTRAINT ad_spend_campaign_key_normalised
    CHECK (campaign_key = lower(trim(campaign_key))),

  CONSTRAINT ad_spend_daily_unique_grain
    UNIQUE (campaign_key, spend_date, source)
);

-- updated_at maintained by the shared trigger function (never recreate it)
CREATE TRIGGER set_ad_spend_daily_updated_at
  BEFORE UPDATE ON ad_spend_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_ad_spend_daily_date ON ad_spend_daily (spend_date DESC);

ALTER TABLE ad_spend_daily ENABLE ROW LEVEL SECURITY;

-- Read: manager and above (spend is org-level commercial data — no agent read).
CREATE POLICY ad_spend_select_manager_up
  ON ad_spend_daily FOR SELECT
  TO authenticated
  USING ((SELECT get_user_role()) IN ('manager', 'admin', 'founder'));

-- Write: admin/founder only (upload action is also role-gated — A-09 two layers).
CREATE POLICY ad_spend_insert_admin_founder
  ON ad_spend_daily FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY ad_spend_update_admin_founder
  ON ad_spend_daily FOR UPDATE
  TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'))
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY ad_spend_delete_admin_founder
  ON ad_spend_daily FOR DELETE
  TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

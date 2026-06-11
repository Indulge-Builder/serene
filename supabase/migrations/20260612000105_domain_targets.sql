-- domain_targets: founder-set monthly targets per Gia domain (performance page
-- domain cards). One row per (domain, metric, period) — upserted by the
-- founder/admin edit affordance on the domain card. Nothing is seeded.

CREATE TABLE IF NOT EXISTS domain_targets (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  domain       app_domain    NOT NULL,
  metric       text          NOT NULL CHECK (metric IN ('deals_closed')),
  target_value numeric(12,2) NOT NULL CHECK (target_value >= 0),
  period       text          NOT NULL DEFAULT 'month' CHECK (period IN ('month')),
  set_by       uuid          REFERENCES public.profiles(id),
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT domain_targets_unique_metric UNIQUE (domain, metric, period)
);

CREATE TRIGGER set_domain_targets_updated_at
  BEFORE UPDATE ON domain_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE domain_targets ENABLE ROW LEVEL SECURITY;

-- Read: every authenticated user (targets render on shared performance surfaces).
CREATE POLICY domain_targets_select_authenticated
  ON domain_targets FOR SELECT
  TO authenticated
  USING (true);

-- Write: founder/admin only.
CREATE POLICY domain_targets_insert_admin_founder
  ON domain_targets FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY domain_targets_update_admin_founder
  ON domain_targets FOR UPDATE
  TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'))
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY domain_targets_delete_admin_founder
  ON domain_targets FOR DELETE
  TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

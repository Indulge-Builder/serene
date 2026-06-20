-- ad_account_recharges: finance-side ledger of money sent to each Meta ad
-- account (a "recharge"), kept SEPARATE from campaign spend (ad_spend_daily).
-- The /budget per-account report reads recharged − spent = balance, where spend
-- is derived from campaign keys via resolveAccountFromCampaign — account is
-- NEVER stored on spend, only on a recharge.
--
-- Mirrors the ad_spend_daily (0104) table/RLS/trigger pattern exactly:
--   * admin/founder write, manager+ read (spend + recharges are org-level
--     commercial data — no agent read)
--   * RLS two-layer with the role-gated action (A-09)
--   * reuses the shared update_updated_at() trigger (never recreated)
--
-- ad_account CHECK is the SQL mirror of AD_ACCOUNT_KEY_VALUES in
-- lib/constants/ad-accounts.ts. Adding the pending "Indulge New Gen" account
-- later = one AD_ACCOUNTS entry + a CHECK-extending migration here (the
-- themes/app-icons precedent) — no other schema change.
--
-- Hard DELETE is PERMITTED for admin/founder (this MIRRORS ad_spend_daily, the
-- nearest finance sibling, which has admin/founder UPDATE + DELETE). A recharge
-- is a manually-keyed money figure; a fat-fingered amount must be correctable.
-- This is deliberately NOT the append-only log posture (whatsapp_notification_
-- logs / lead_activities) — recharges are an editable finance record, not an
-- immutable event stream.
--
-- PII: `method` is a free-text LABEL only ('NEFT', 'Card', 'Razorpay'). It is
-- sanitized + card-PAN-stripped in the action layer (createRechargeAction);
-- this CHECK is a defence-in-depth backstop that rejects any value containing a
-- 13–19 digit run (a card PAN) even ignoring separators. No raw card number can
-- persist.

CREATE TABLE IF NOT EXISTS ad_account_recharges (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account    text          NOT NULL,
  platform      text          NOT NULL DEFAULT 'meta',
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  currency      text          NOT NULL DEFAULT 'INR',
  recharged_at  date          NOT NULL,
  done_by       uuid          NOT NULL REFERENCES public.profiles(id),
  method        text,
  note          text,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  -- The 3 live account keys (SQL mirror of AD_ACCOUNT_KEY_VALUES). Extend this
  -- list in a new migration when "Indulge New Gen" is created.
  CONSTRAINT ad_account_recharges_account_check
    CHECK (ad_account IN ('april', 'gmr', 'dubai')),

  -- Defence-in-depth PII backstop: reject any method/note containing a 13–19
  -- digit run (a card PAN), tolerant of spaces/hyphens between digit groups.
  -- The action layer is the primary guard; this makes "no card number persists"
  -- structural.
  CONSTRAINT ad_account_recharges_no_card_pan
    CHECK (
      (method IS NULL OR regexp_replace(method, '[ -]', '', 'g') !~ '\d{13,19}')
      AND
      (note   IS NULL OR regexp_replace(note,   '[ -]', '', 'g') !~ '\d{13,19}')
    )
);

-- updated_at maintained by the shared trigger function (never recreate it)
CREATE TRIGGER set_ad_account_recharges_updated_at
  BEFORE UPDATE ON ad_account_recharges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_ad_account_recharges_date    ON ad_account_recharges (recharged_at DESC);
CREATE INDEX idx_ad_account_recharges_account ON ad_account_recharges (ad_account);

ALTER TABLE ad_account_recharges ENABLE ROW LEVEL SECURITY;

-- Read: manager and above (org-level commercial data — no agent read).
CREATE POLICY ad_account_recharges_select_manager_up
  ON ad_account_recharges FOR SELECT
  TO authenticated
  USING ((SELECT get_user_role()) IN ('manager', 'admin', 'founder'));

-- Write: admin/founder only (the create action is also role-gated — A-09).
CREATE POLICY ad_account_recharges_insert_admin_founder
  ON ad_account_recharges FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY ad_account_recharges_update_admin_founder
  ON ad_account_recharges FOR UPDATE
  TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'))
  WITH CHECK ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY ad_account_recharges_delete_admin_founder
  ON ad_account_recharges FOR DELETE
  TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

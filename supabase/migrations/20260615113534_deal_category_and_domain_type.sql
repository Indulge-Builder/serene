-- Migration 0122 — Deal category + domain-derived deal_type
--
-- Enforces the domain→type→category rule at the DB layer (decision-log 2026-06-15):
--   onboarding → membership · shop → retail · house/legacy → sale.
-- deal_type is derived from domain server-side (recordDeal + createWalkInDeal);
-- this migration makes the column honest by (a) admitting the new 'sale' value,
-- (b) adding deal_category, and (c) coupling retail ⇔ category-required.
--
-- The category CHECK uses deals_membership_duration_check (0072) as its template:
-- a "type X ⇒ field constrained" cross-column CHECK.
--
-- ⚠️ Order matters. Existing rows must satisfy every new CHECK at the moment it
-- is added or the ALTER aborts. So: clean data FIRST, then constrain.

-- ── 1. Add the column (nullable for now — backfill happens before the CHECK) ──
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS deal_category text;

-- ── 2. Remove the one pre-rule mismatch row ──────────────────────────────────
-- A single onboarding+retail walk-in (no duration, no category) predates the
-- rule. Under the rule onboarding ⇒ membership (which needs a duration it lacks),
-- so it cannot be realigned cleanly; it is a stray test row (lead_id IS NULL).
-- Delete it before the CHECKs so the table is rule-clean. Guarded so the
-- migration is a no-op anywhere the row is already gone.
DELETE FROM public.deals
WHERE domain = 'onboarding' AND deal_type = 'retail';

-- ── 3. Backfill: any surviving retail row must carry a category ───────────────
-- After step 2 there are no retail rows on this DB, but prod parity demands the
-- backfill run unconditionally: a retail row with a NULL category would fail the
-- category-required CHECK in step 5. 'other' is the safe catch-all.
UPDATE public.deals
SET deal_category = 'other'
WHERE deal_type = 'retail' AND deal_category IS NULL;

-- Symmetrically, force every non-retail row's category to NULL so the
-- non-retail ⇒ category-null half of the CHECK holds for legacy data.
UPDATE public.deals
SET deal_category = NULL
WHERE deal_type <> 'retail' AND deal_category IS NOT NULL;

-- ── 4. Extend deal_type to admit 'sale' (house/legacy) ───────────────────────
-- The inline CHECK from 0072 is named deals_deal_type_check (verified via
-- pg_constraint — NOT auto-suffixed). Drop + recreate with the full vocabulary.
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_deal_type_check;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_deal_type_check
  CHECK (deal_type IN ('membership', 'retail', 'sale'));

-- ── 5. Category vocabulary + retail ⇔ category coupling ──────────────────────
-- Two CHECKs, both modelled on deals_membership_duration_check:
--   (a) value whitelist (mirror of DEAL_CATEGORIES in lib/constants/deal-types.ts)
--   (b) the cross-column rule: retail ⇒ category set, non-retail ⇒ category null.
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_deal_category_check;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_deal_category_check
  CHECK (
    deal_category IS NULL
    OR deal_category IN ('watch', 'bag', 'event', 'jewellery', 'small_luxury', 'accessories', 'other')
  );

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_retail_category_check;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_retail_category_check
  CHECK (
    (deal_type = 'retail' AND deal_category IS NOT NULL)
    OR (deal_type <> 'retail' AND deal_category IS NULL)
  );

COMMENT ON COLUMN public.deals.deal_category IS
  'Product category for retail (shop) deals only. Required when deal_type = retail, '
  'NULL for membership/sale (deals_retail_category_check). Vocabulary mirrors '
  'DEAL_CATEGORIES in lib/constants/deal-types.ts (deals_deal_category_check). '
  'deal_type itself is domain-derived via DOMAIN_DEAL_CONFIG — never client-supplied.';

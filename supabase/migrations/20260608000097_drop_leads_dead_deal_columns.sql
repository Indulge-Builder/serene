-- ─────────────────────────────────────────────────────────────────────────────
-- 0097 — Drop orphaned deal columns from public.leads
--
-- recordDeal (src/lib/actions/deals.ts) writes deal data to public.deals, NOT to
-- these columns. They have been dead since the deals table became first-class
-- (migrations 0072–0074). Keeping them produces a misleading schema where a
-- recently won lead shows deal_amount = NULL.
--
-- The CHECK constraints (leads_deal_amount_check, leads_deal_duration_check,
-- leads_deal_type_check) are CASCADE-dropped automatically with their columns.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS deal_amount,
  DROP COLUMN IF EXISTS deal_type,
  DROP COLUMN IF EXISTS deal_duration;

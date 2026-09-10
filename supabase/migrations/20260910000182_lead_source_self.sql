-- Migration 0182 — Add the "self" lead source
-- A lead a team member brought in themselves (own network, outreach) rather
-- than through a channel. Mirrors the new entry in lib/constants/lead-sources.ts.
-- leads.source has no CHECK (free text, validated by Zod); deals.source does
-- (deals_source_check, last extended in 0180) and must list every LEAD_SOURCES
-- value or a deal recorded against a self-sourced lead is rejected at write time.
-- Adding a lead source and extending this CHECK are one change, never two.

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_source_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_source_check
  CHECK (source IS NULL OR source IN
    ('meta','google','website','whatsapp','referral','ypo','events','shop_app','self'));

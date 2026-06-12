-- Call Intelligence Phase 1 — leads.service_interests
-- (docs/modules/call-intelligence.md §4/§11; spec filename 20260610000085 was
-- already taken by 20260608000085_fix_wa_unread_count — renumbered to 0109.)
--
-- text[] by design, NOT an enum — different domains carry different interest
-- vocabularies (DOMAIN_INTERESTS in src/lib/constants/interests.ts owns the
-- valid values per domain; unknown values are dropped at ingestion, never
-- rejected). Distinct from lead_intent (hot/cold) — separate semantics.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS service_interests text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_leads_service_interests
  ON public.leads USING GIN(service_interests)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.leads.service_interests IS
  'Multi-select service categories from lead form. Values validated against DOMAIN_INTERESTS constant per domain. Distinct from lead_intent (hot/cold).';

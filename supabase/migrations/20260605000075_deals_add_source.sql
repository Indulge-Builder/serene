-- Migration 0075 — Add source column to public.deals
-- Mirrors leads.source (formerly utm_source). Nullable — existing rows have no source.

ALTER TABLE public.deals
  ADD COLUMN source text NULL
    CHECK (source IS NULL OR source IN ('meta','google','website','whatsapp','referral','ypo','events'));

CREATE INDEX deals_source_idx ON public.deals (source) WHERE archived_at IS NULL AND source IS NOT NULL;

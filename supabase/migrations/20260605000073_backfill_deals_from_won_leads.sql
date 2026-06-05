-- Migration 0073 — Backfill public.deals from won leads
-- Idempotent: NOT EXISTS guard prevents double-insert.
-- Every row on /deals before this migration remains visible after.

INSERT INTO public.deals (
  lead_id,
  contact_name,
  contact_phone,
  contact_email,
  domain,
  deal_amount,
  deal_type,
  deal_duration,
  assigned_to,
  won_at,
  created_at
)
SELECT
  l.id,
  trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')),
  l.phone,
  l.email,
  l.domain,
  l.deal_amount,
  l.deal_type,
  l.deal_duration,
  l.assigned_to,
  coalesce(l.status_changed_at, l.created_at),  -- historical won moment; fallback to created_at if null
  l.created_at
FROM public.leads l
WHERE l.status = 'won'
  AND l.deal_amount IS NOT NULL
  AND l.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.deals d WHERE d.lead_id = l.id
  );

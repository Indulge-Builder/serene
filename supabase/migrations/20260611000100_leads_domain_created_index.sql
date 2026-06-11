-- Migration 100 (perf audit C-4): composite index for the manager list path.
--
-- The manager's default leads list is:
--   WHERE domain = X AND archived_at IS NULL ORDER BY created_at DESC LIMIT 30
--
-- Existing indexes cover (domain, status) and (created_at DESC) separately —
-- there is no (domain, created_at). For a domain that owns a small fraction
-- of rows, the planner walks idx_leads_created_at backwards filtering on
-- domain, discarding most entries. This composite serves the filter and the
-- order in one descent.
--
-- Post-deploy verification (audit note): EXPLAIN ANALYZE the manager list
-- query at production volume and confirm this index is chosen; it is cheap
-- to drop if the planner never picks it.

CREATE INDEX IF NOT EXISTS idx_leads_domain_created
  ON public.leads (domain, created_at DESC)
  WHERE archived_at IS NULL;

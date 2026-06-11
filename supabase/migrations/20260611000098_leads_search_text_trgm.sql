-- Migration 098 (perf audit C-2): indexable lead search.
--
-- Problem: the leads list search is a leading-wildcard ILIKE across five columns
-- (first_name, last_name, phone, email, city). The only text index on leads is
-- idx_leads_phone_text (text_pattern_ops), which can never serve a '%term%'
-- pattern — every keystroke-debounced search is a sequential scan of all
-- non-archived leads.
--
-- Fix: one STORED generated column concatenating the five searched columns,
-- plus a trigram GIN index on it. A generated column (not an expression index)
-- because PostgREST query builders can only filter on real columns — the same
-- column is then used by the list query, the export query, the task lead
-- picker, and get_leads_status_counts (migration 0099), so the search
-- predicate cannot drift between the table and the count pills again.
--
-- Bonus correctness fix: multi-word searches ("john doe") previously matched
-- nothing — no single column contains both words. The concatenated column
-- matches across the name boundary.
--
-- Ops note: ADD COLUMN ... GENERATED ALWAYS ... STORED rewrites the table
-- (ACCESS EXCLUSIVE during the rewrite) and CREATE INDEX here is
-- non-CONCURRENT (migrations run in a transaction). Both are fast at current
-- lead volume; if the table ever reaches millions of rows, a future change of
-- this shape would need a CONCURRENTLY-based rollout instead.

-- 1. pg_trgm — house convention: extensions live in the `extensions` schema
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 2. The canonical searchable text for a lead. Postgres keeps it in sync on
--    every INSERT/UPDATE; expression must stay IMMUTABLE (coalesce + concat).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
    coalesce(first_name, '') || ' ' ||
    coalesce(last_name,  '') || ' ' ||
    coalesce(email,      '') || ' ' ||
    coalesce(city,       '') || ' ' ||
    coalesce(phone,      '')
  ) STORED;

COMMENT ON COLUMN public.leads.search_text IS
  'Generated: first_name + last_name + email + city + phone. THE search surface for every lead search path (list, export, task picker, get_leads_status_counts). Never search individual columns with OR-ILIKE chains — they bypass idx_leads_search_trgm and drift from the count RPC.';

-- 3. Trigram index — serves infix ILIKE ('%term%'). Partial on the live set:
--    every search path filters archived_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_leads_search_trgm
  ON public.leads
  USING gin (search_text extensions.gin_trgm_ops)
  WHERE archived_at IS NULL;

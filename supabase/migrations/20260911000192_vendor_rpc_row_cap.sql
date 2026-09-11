-- Migration 0192: the RPC layer has the same 1,000-row cap — and three vendor
-- functions were quietly under it.
--
-- WHAT WAS FOUND, AND WHERE
-- Verifying the production runbook on 2026-09-11, get_vendor_cities returned
-- EXACTLY 1,000 rows. The SQL was right — 2,071 distinct cities — but PostgREST
-- caps every response at db-max-rows (1,000 on Supabase), RPC results included,
-- and says nothing. Measured through the same cap: get_vendor_candidates hands
-- back 1,000 of 5,957 for `dining`, 1,000 of 5,584 for `travel`, 1,000 of
-- 7,982 for `special-request`. The score rollup that those candidates feed
-- returns one row per id and would have been cut the same way — 4,957 vendors
-- scored as if they had no history. 0187 / 0188 moved the reads INTO SQL to
-- escape this cap at the table layer; it was still waiting at the RPC layer.
--
-- THE FIX, BY SHAPE
--   1. A vocabulary is ONE value: get_vendor_cities / get_vendor_categories
--      now return text[] — a single row holding the whole array, which no row
--      cap touches. RETURNS changed → DROP + CREATE.
--   2. A candidate set can be thousands: get_vendor_candidates gains
--      `ORDER BY v.id` so the service can PAGE it with Range headers
--      (callAdminRpcAll). An OFFSET page over an unordered result is whatever
--      order that statement scanned in — the loader met exactly that (22 pages,
--      13,766 distinct rows of 21,580) — so the order is the contract here.
--      Same signature and return type → CREATE OR REPLACE, body verbatim + the
--      ORDER BY.
--   3. The rollup (get_vendor_score_inputs) is unchanged: the service now asks
--      for at most 500 ids per call, so no single response can reach the cap.
--
-- Its own file because 0187 and 0188 were applied to production earlier the
-- same day (A-14). Every function keeps the Q-13 revoked tier.

-- ── 1. vocabularies as one array ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_vendor_cities();
CREATE FUNCTION public.get_vendor_cities()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT coalesce(array_agg(u.city ORDER BY u.city), '{}'::text[])
  FROM (
    SELECT DISTINCT city FROM (
      SELECT lower(unnest(c.cities)) AS city FROM public.vendor_capabilities c
      UNION ALL
      SELECT lower(v.home_city)        FROM public.vendors v WHERE v.home_city IS NOT NULL
    ) raw
    WHERE city IS NOT NULL AND city <> ''
  ) u;
$$;

DROP FUNCTION IF EXISTS public.get_vendor_categories();
CREATE FUNCTION public.get_vendor_categories()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT coalesce(array_agg(x.category ORDER BY x.category), '{}'::text[])
  FROM (SELECT DISTINCT v.category FROM public.vendors v WHERE v.category IS NOT NULL) x;
$$;

REVOKE EXECUTE ON FUNCTION public.get_vendor_cities()     FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendor_cities()     TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_vendor_categories() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendor_categories() TO service_role;

COMMENT ON FUNCTION public.get_vendor_cities() IS
  'Every city served or based in, lower-cased, as ONE text[] — a single row, so PostgREST''s 1,000-row response cap cannot cut it (it did: 1,000 of 2,071). Q-13 revoked tier.';
COMMENT ON FUNCTION public.get_vendor_categories() IS
  'Every vendors.category in use as ONE text[] (0192 — one row, uncappable). Q-13 revoked tier.';

-- ── 2. the candidate set, in a stable order so it can be paged ───────────────
CREATE OR REPLACE FUNCTION public.get_vendor_candidates(
  p_category text DEFAULT NULL,
  p_service  text DEFAULT NULL,
  p_city     text DEFAULT NULL
)
RETURNS SETOF public.vendors
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.*
  FROM public.vendors v
  WHERE v.status = 'active'          -- paused / blacklisted never rank
    AND EXISTS (
      -- offersApplies: an `offers` row for this category whose service is
      -- either the WHOLE category (NULL) or exactly the one asked for, and
      -- whose city list is either empty (serves everywhere) or includes it.
      SELECT 1 FROM public.vendor_capabilities c
      WHERE c.vendor_id = v.id
        AND c.stance = 'offers'
        AND (p_category IS NULL OR c.category = p_category)
        -- A row whose service is NULL means "the whole category", and that
        -- only speaks to the request when a CATEGORY was actually asked for.
        AND (
          p_service IS NULL
          OR c.service = p_service
          OR (p_category IS NOT NULL AND c.service IS NULL)
        )
        AND (p_city     IS NULL OR cardinality(c.cities) = 0 OR c.cities @> ARRAY[p_city])
    )
    AND NOT EXISTS (
      -- declinesApplies: a WHOLE-category `declines` always bites; a
      -- service-specific one bites only when that service was asked for.
      SELECT 1 FROM public.vendor_capabilities c
      WHERE c.vendor_id = v.id
        AND c.stance = 'declines'
        AND (p_category IS NULL OR c.category = p_category)
        AND (c.service IS NULL OR (p_service IS NOT NULL AND c.service = p_service))
        AND (p_city IS NULL OR cardinality(c.cities) = 0 OR c.cities @> ARRAY[p_city])
    )
  -- The paging contract (0192): the service reads this in Range pages of
  -- 1,000, and a page is only meaningful over a stable order.
  ORDER BY v.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_vendor_candidates(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendor_candidates(text, text, text) TO service_role;

COMMENT ON FUNCTION public.get_vendor_candidates(text, text, text) IS
  'THE ranker candidate set: active vendors with an applying `offers` capability and no applying `declines`, ORDER BY id so the service can page it past PostgREST''s 1,000-row response cap (0192 — dining alone is 5,957). Q-13 revoked tier: service_role only.';

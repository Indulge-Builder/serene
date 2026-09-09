-- ─────────────────────────────────────────────────────────────────────────────
-- 0187 — Vendors: pick the ranker's candidates in SQL.
--
-- `rankVendorsForRequest` selected candidates in Node: read every capability
-- row for the category, decide offers/declines in TypeScript, then fetch those
-- vendors with `.in("id", candidateIds)`. Three faults, all silent:
--
--   1. **The capability read was capped at 1,000 rows.** PostgREST's default
--      limit. `dining` has 6,034 capability rows, `special-request` 8,087 — so
--      the ranker had only ever seen about a sixth of the candidates for the
--      busiest categories, and which sixth depended on physical row order.
--   2. **`.in("id", …)` built a URI Kong rejects.** With a thousand uuids the
--      request line is ~37 KB: "URI too long", caught and logged, and the user
--      saw "no vendors matched" for every large category.
--   3. **A service-only request matched nothing.** The lookup was
--      `.eq("category", req.category)`, and `.eq(…, null)` matches no rows — so
--      "flights to Dubai", which parses to a service and a city but no
--      category, could never return a vendor.
--
-- One EXISTS/NOT EXISTS query in the database has none of those limits. The
-- predicates below are the exact SQL translation of `offersApplies`,
-- `declinesApplies` and `cityApplies` in vendors-service.ts — if either side
-- changes, both must.
-- ─────────────────────────────────────────────────────────────────────────────

-- Serves the EXISTS lookups: find a vendor's rows for one category fast.
CREATE INDEX IF NOT EXISTS idx_vendor_capabilities_vendor_category
  ON public.vendor_capabilities (vendor_id, category, stance);

DROP FUNCTION IF EXISTS public.get_vendor_candidates(text, text, text);

CREATE FUNCTION public.get_vendor_candidates(
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
        -- Without this guard a "flights" request with no category matched every
        -- vendor holding any whole-category row — a dining vendor answering a
        -- flight request, 14,841 candidates instead of 270.
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
    );
$$;

COMMENT ON FUNCTION public.get_vendor_candidates(text, text, text) IS
  'THE ranker candidate set: active vendors with an applying `offers` capability and no applying `declines`. Mirrors offersApplies/declinesApplies/cityApplies in vendors-service.ts exactly — change both together. Replaces a Node-side selection that was silently capped at PostgREST''s 1,000 rows and then blew the URI length on .in(). Q-13 revoked tier: service_role only.';

-- Q-13 / the 0102 posture: caller-supplied scope params, returns whatever slice
-- it is asked for → admin-client only; the action is the trust boundary.
REVOKE EXECUTE ON FUNCTION public.get_vendor_candidates(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendor_candidates(text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0187 — Vendors: a search surface that survives how people actually type.
--
-- The list search was `name ILIKE '%<term>%'` plus an EXACT array-containment
-- test on aliases. Three things it could not do:
--
--   1. "lux drovia" never found "LuxDrovia" — the space is not in the name.
--   2. "aviation indigo" never found "IndiGo (InterGlobe Aviation Ltd)" — a
--      single ILIKE needs the words adjacent and in the typed order.
--   3. Aliases only matched when the WHOLE alias was typed character for
--      character, so 19,194 vendors' alternate spellings were effectively dead
--      weight — and those spellings are exactly what the archive knows a vendor
--      by ("TRAVIBES INDIA", "Travibes India").
--
-- Two generated columns and two RPCs fix all three. This mirrors the leads
-- `search_text` + `idx_leads_search_trgm` pattern from 0098 (R-01) — same
-- STORED-generated-column-plus-GIN-trigram shape, one column wider because
-- vendors are searched by squashed name and by phone as well.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The two surfaces ────────────────────────────────────────────────────────
-- search_text — everything a person might type, lower-cased and space-separated.
-- search_key  — the same with every non-alphanumeric character removed, so
--               "LuxDrovia", "Lux Drovia" and "lux-drovia" all collapse onto
--               "luxdrovia" and match each other.
--
-- A generated column may not reference another generated column, so the
-- expression is spelled out twice on purpose. `immutable_array_to_string`
-- (0110) is used because plain `array_to_string` is STABLE and Postgres rejects
-- it in a GENERATED expression. Every operand is COALESCEd — one NULL in a
-- `||` chain would blank the whole search surface for that vendor.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
    lower(
      name
      || ' ' || public.immutable_array_to_string(aliases, ' ')
      || ' ' || coalesce(subcategory, '')
      || ' ' || coalesce(home_city, '')
      || ' ' || coalesce(primary_phone, '')
    )
  ) STORED,
  ADD COLUMN IF NOT EXISTS search_key text GENERATED ALWAYS AS (
    regexp_replace(
      lower(
        name
        || ' ' || public.immutable_array_to_string(aliases, ' ')
        || ' ' || coalesce(subcategory, '')
        || ' ' || coalesce(home_city, '')
        || ' ' || coalesce(primary_phone, '')
      ),
      '[^a-z0-9]+', '', 'g'
    )
  ) STORED;

COMMENT ON COLUMN public.vendors.search_text IS
  'Generated search surface: name + aliases + subcategory + home_city + primary_phone, lower-cased. Trigram-indexed. Never written directly.';
COMMENT ON COLUMN public.vendors.search_key IS
  'search_text with every non-alphanumeric removed, so "Lux Drovia" and "LuxDrovia" are one key. Trigram-indexed. Never written directly.';

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- gin_trgm_ops is schema-qualified (the full 0098 pattern) because pg_trgm
-- lives in `extensions`, not on the default search_path.
CREATE INDEX IF NOT EXISTS idx_vendors_search_text_trgm
  ON public.vendors USING gin (search_text extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vendors_search_key_trgm
  ON public.vendors USING gin (search_key extensions.gin_trgm_ops);

-- A plain btree so the default, unsearched list page orders by name off an
-- index instead of sorting all 21,960 rows.
CREATE INDEX IF NOT EXISTS idx_vendors_name ON public.vendors (name);

-- An earlier draft of this migration factored the match predicate into a
-- helper function so the two RPCs could share it. Postgres would NOT inline it
-- (its body contains a sub-SELECT), so every call became a per-row function
-- invocation and the planner fell back to a Seq Scan: 0.19ms became 260ms.
-- The predicate is therefore written inline below. Dropped here so a database
-- that ran the earlier draft does not keep a dead, misleading function.
DROP FUNCTION IF EXISTS public.vendor_search_match(text, text, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- THE SEARCH — one ranked page.
--
-- Three match rules:
--   1. every word typed appears somewhere, in ANY order
--        → "aviation indigo" finds "IndiGo (InterGlobe Aviation Ltd)"
--   2. the query with its spaces removed is a substring of the squashed surface
--        → "lux drovia" finds "LuxDrovia", and "luxdrovia" finds "Lux Drovia"
--   3. close enough to be a typo
--        → "travibs" finds "Travibes"
--
-- plpgsql rather than sql ON PURPOSE. The rules need the query broken into
-- words and squashed first; doing that in a CTE leaves the planner comparing a
-- column against a subquery output, which it will not resolve to an index scan.
-- As plpgsql locals these become plan PARAMETERS, so each `LIKE '%' || word`
-- is served by the GIN trigram index above.
--
-- Rule 1 is spelled out for up to FOUR words instead of looping over an array:
-- `v_words[5]` is NULL for a shorter query and each term short-circuits, so one
-- fixed WHERE covers 1–4 words while staying a plain AND of indexable LIKEs.
-- A fifth word is ignored for matching (it still ranks) — a deliberate ceiling,
-- since a 5-word vendor search is already narrower than the index can help with.
--
-- Rule 3 uses word_similarity (`<%`): it asks whether the typed text resembles
-- some CONTIGUOUS part of the surface, the right question for a long
-- concatenated string where plain similarity() would be diluted to nothing by
-- the rest of the text. It requires a letter — fuzzy-matching DIGITS is
-- meaningless (every long number resembles every other) and a phone search is
-- exact by nature, so it belongs to rule 2.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_vendors(text, text, text, integer);
DROP FUNCTION IF EXISTS public.search_vendors(text, text, text, integer, integer);

CREATE FUNCTION public.search_vendors(
  p_query    text    DEFAULT NULL,
  p_category text    DEFAULT NULL,
  p_status   text    DEFAULT NULL,
  p_limit    integer DEFAULT 20,
  p_offset   integer DEFAULT 0
)
RETURNS SETOF public.vendors
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_raw      text   := lower(btrim(coalesce(p_query, '')));
  v_squashed text   := regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]+', '', 'g');
  v_words    text[] := array_remove(string_to_array(lower(btrim(coalesce(p_query, ''))), ' '), '');
  v_w1 text; v_w2 text; v_w3 text; v_w4 text;
  v_fuzzy    text;
BEGIN
  v_w1 := v_words[1]; v_w2 := v_words[2]; v_w3 := v_words[3]; v_w4 := v_words[4];
  -- NULL disables rule 3 entirely rather than letting it match on digits.
  IF length(v_raw) >= 4 AND v_raw ~ '[a-z]' THEN v_fuzzy := v_raw; END IF;

  RETURN QUERY
  SELECT v.*
  FROM public.vendors v
  WHERE (p_category IS NULL OR v.category = p_category)
    AND (p_status   IS NULL OR v.status   = p_status)
    AND (
      v_raw = ''
      OR (
        v.search_text LIKE '%' || v_w1 || '%'
        AND (v_w2 IS NULL OR v.search_text LIKE '%' || v_w2 || '%')
        AND (v_w3 IS NULL OR v.search_text LIKE '%' || v_w3 || '%')
        AND (v_w4 IS NULL OR v.search_text LIKE '%' || v_w4 || '%')
      )
      OR (v_squashed <> '' AND v.search_key LIKE '%' || v_squashed || '%')
      OR (v_fuzzy IS NOT NULL AND v_fuzzy OPERATOR(extensions.<%) v.search_text)
    )
  ORDER BY
    -- Exact name wins outright.
    (v_raw <> '' AND lower(v.name) = v_raw) DESC,
    -- Then a hit on the vendor's OWN number. Typing a phone number is a precise
    -- search, so it must outrank a fuzzy name resemblance — without this tier a
    -- numeric query scores 0 similarity everywhere and collapses to alphabetical
    -- order, burying the vendor whose number it actually is. It RANKS rather
    -- than filters: the archive attributes some shared lines to several vendors
    -- and every one of them still comes back.
    (
      length(v_squashed) >= 6
      AND regexp_replace(coalesce(v.primary_phone, ''), '[^0-9]+', '', 'g') LIKE '%' || v_squashed || '%'
    ) DESC,
    -- Then a name STARTING with what was typed, then one CONTAINING it, then
    -- whichever name is closest. Ties break alphabetically so paging is stable.
    (v_squashed <> '' AND v.search_key LIKE v_squashed || '%') DESC,
    (v_squashed <> '' AND v.search_key LIKE '%' || v_squashed || '%') DESC,
    -- Guarded: with no query there is nothing to be close TO, and two
    -- similarity() calls plus a regexp_replace across every row is pure waste
    -- on the plain "open /vendors" page.
    CASE WHEN v_raw = '' THEN 0::real ELSE greatest(
      similarity(lower(v.name), v_raw),
      similarity(regexp_replace(lower(v.name), '[^a-z0-9]+', '', 'g'), v_squashed)
    ) END DESC,
    v.name ASC
  -- No upper clamp: this is a service_role-only RPC and the CALLER owns the
  -- page size (VENDOR_LIST_PAGE_SIZE / VENDOR_SEARCH_MAX_LIMIT). A clamp here
  -- would silently cap count_vendors, which reuses this function to count.
  LIMIT  greatest(1, coalesce(p_limit, 20))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

COMMENT ON FUNCTION public.search_vendors(text, text, text, integer, integer) IS
  'THE vendor search — one ranked page (exact > own phone > prefix > contains > closest). Matches on all-words-any-order, space-insensitive substring, or trigram typo distance. plpgsql so the query parts become plan parameters and the GIN trigram indexes are used. Q-13 revoked tier: service_role only, via callAdminRpc.';

-- ── The matching total, for the list pager ──────────────────────────────────
-- An empty query matches everything by definition, so that case is a plain
-- COUNT with the column filters — no predicate to get wrong. Any real query
-- DELEGATES to search_vendors, which is what guarantees the pager total can
-- never disagree with the page it is paging: there is only one predicate, and
-- this is not a second copy of it.
CREATE OR REPLACE FUNCTION public.count_vendors(
  p_query    text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_status   text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_query, '')) = '' THEN (
      SELECT count(*) FROM public.vendors v
      WHERE (p_category IS NULL OR v.category = p_category)
        AND (p_status   IS NULL OR v.status   = p_status)
    )
    ELSE (
      -- The whole matching set, not a page — this is the pager TOTAL.
      SELECT count(*) FROM public.search_vendors(p_query, p_category, p_status, 2147483647, 0)
    )
  END;
$$;

COMMENT ON FUNCTION public.count_vendors(text, text, text) IS
  'How many vendors match a search — the pager total for listVendors. Delegates to search_vendors for a real query so there is only ONE predicate; an empty query is a plain COUNT. Q-13 revoked tier: service_role only.';

-- Q-13 / the 0102 posture: these take caller-supplied scope params and return
-- whatever slice they are asked for, so they are admin-client only. `vendors`
-- itself is admin/founder SELECT (0183) and the ACTION is the trust boundary.
REVOKE EXECUTE ON FUNCTION public.search_vendors(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_vendors(text, text, text, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.count_vendors(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.count_vendors(text, text, text) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- get_vendor_categories / get_vendor_cities — the search VOCABULARY.
-- ─────────────────────────────────────────────────────────────────────────────
-- The filter bar's category list and the find-a-vendor city parser both need
-- "every value in use". The service read them by selecting the COLUMN off every
-- row and de-duplicating in Node — `vendors.category` across 21,000 rows and
-- `vendor_capabilities.cities` across 25,000 — which PostgREST silently caps at
-- 1,000 rows. The category list was whatever happened to sort into the first
-- thousand; a city only served by a vendor outside that window did not exist
-- as far as the parser was concerned. A DISTINCT returns the vocabulary itself:
-- a few dozen rows, complete, whatever the table size.
CREATE OR REPLACE FUNCTION public.get_vendor_categories()
RETURNS TABLE (category text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT DISTINCT v.category
  FROM public.vendors v
  WHERE v.category IS NOT NULL
  ORDER BY v.category;
$$;

-- Cities SERVED (capability rows) plus cities vendors are BASED in, lower-cased
-- — the same union the service assembled, now in one pass.
CREATE OR REPLACE FUNCTION public.get_vendor_cities()
RETURNS TABLE (city text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT DISTINCT u.city FROM (
    SELECT lower(unnest(c.cities)) AS city FROM public.vendor_capabilities c
    UNION ALL
    SELECT lower(v.home_city)        FROM public.vendors v WHERE v.home_city IS NOT NULL
  ) u
  WHERE u.city IS NOT NULL AND u.city <> ''
  ORDER BY u.city;
$$;

REVOKE EXECUTE ON FUNCTION public.get_vendor_categories() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendor_categories() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_vendor_cities()     FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vendor_cities()     TO service_role;

COMMENT ON FUNCTION public.get_vendor_categories() IS
  'Every vendors.category in use, distinct, in SQL — the Node de-dup read the column off every row and was capped at 1,000. Q-13 revoked tier.';
COMMENT ON FUNCTION public.get_vendor_cities() IS
  'Every city served (capability cities) or based in (home_city), lower-cased, distinct, in SQL. Q-13 revoked tier.';

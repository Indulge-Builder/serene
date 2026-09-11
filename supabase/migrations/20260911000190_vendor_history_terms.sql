-- ─────────────────────────────────────────────────────────────────────────────
-- 0190 — The search terms arrive ranked, and the ranking is honoured.
--
-- 0189 scored a title by the summed rarity (IDF) of the query words it matched.
-- Rarity is a decent proxy for importance and a bad substitute for it. Once the
-- model began expanding requests, the proxy broke outright:
--
--   "order for black forest cake"  ->  terms: cake, black, forest, bakery, dessert
--
-- `black` appears in fewer titles than `cake`, so IDF scored it HIGHER, and the
-- answer became Birkenstock sandals in Black and navy-and-black socks. No amount
-- of frequency arithmetic can work out that `cake` is the subject and `black` is
-- a modifier — but the model that read the sentence already knows.
--
-- So the terms now arrive as an ORDERED array, most important first, and
-- position sets the weight: the subject counts 3x, the next term 2x, the rest
-- 1x, each still multiplied by its rarity. `p_query` is kept for the fallback
-- path that runs when the model is unavailable.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.find_vendors_by_history(text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.find_vendors_by_history(text, text[], text, text, text, integer);

CREATE FUNCTION public.find_vendors_by_history(
  p_query    text    DEFAULT NULL,
  p_terms    text[]  DEFAULT NULL,   -- ordered, most important first
  p_category text    DEFAULT NULL,
  p_service  text    DEFAULT NULL,
  p_city     text    DEFAULT NULL,
  p_limit    integer DEFAULT 5
)
RETURNS TABLE (
  vendor_id      uuid,
  match_count    integer,
  match_score    real,
  last_matched   timestamptz,
  sample_titles  text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  -- Request-shaped filler. English stopwords are dropped by to_tsquery itself;
  -- these are the words it would keep — "need a vendor for…" is how every one
  -- of these sentences starts.
  v_filler text[] := ARRAY[
    'need','needs','needed','want','wants','get','gets','find','looking','look',
    'please','pls','kindly','client','clients','guest','guests','order','orders',
    'book','booking','vendor','vendors','someone','something','anyone','arrange',
    'require','required','requirement','asap','urgent','today','tomorrow'
  ];
  v_words text[];
  v_total bigint;
BEGIN
  IF p_terms IS NOT NULL AND cardinality(p_terms) > 0 THEN
    -- The model read the request and ranked the terms. Trust the order.
    -- ORDER BY belongs INSIDE array_agg: a bare ORDER BY beside an aggregate
    -- with no GROUP BY is an error, and the order is the whole point here.
    SELECT array_agg(w ORDER BY ord) INTO v_words
    FROM unnest(p_terms) WITH ORDINALITY AS t(w, ord)
    WHERE length(w) >= 3;
  ELSE
    -- Fallback: no model reply, so the raw sentence is all there is.
    SELECT array_agg(w) INTO v_words
    FROM unnest(regexp_split_to_array(lower(btrim(coalesce(p_query, ''))), '[^a-z0-9]+')) AS w
    WHERE length(w) >= 3
      AND NOT (w = ANY(v_filler))
      -- The city is already a FILTER below; leaving it in the text search too
      -- counts it twice and drags in the wrong vendors ("flowers goa" surfaced
      -- IndiGo, whose titles read "Mumbai -> Goa").
      AND (p_city IS NULL OR w <> ALL(regexp_split_to_array(lower(p_city), '[^a-z0-9]+')))
      -- Dates are not subjects.
      AND w !~ '^[0-9]+(st|nd|rd|th)?$'
      AND w <> ALL(ARRAY['jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec',
                         'january','february','march','april','june','july','august','september',
                         'october','november','december','monday','tuesday','wednesday','thursday',
                         'friday','saturday','sunday','today','tonight','morning','evening']);
  END IF;

  IF v_words IS NULL OR cardinality(v_words) = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_total FROM public.vendor_engagements WHERE title IS NOT NULL;

  RETURN QUERY
  WITH w AS (
    -- weight = rarity x position. Rarity alone chose `black` over `cake`;
    -- position alone would ignore that a term nobody ever wrote is worthless.
    SELECT
      t.word,
      (ln(v_total::numeric / greatest(
        (SELECT count(*) FROM public.vendor_engagements e2
         WHERE e2.title IS NOT NULL
           AND to_tsvector('english', e2.title) @@ plainto_tsquery('english', t.word)), 1))
       * CASE t.ord WHEN 1 THEN 3.0 WHEN 2 THEN 2.0 ELSE 1.0 END)::real AS weight
    FROM unnest(v_words) WITH ORDINALITY AS t(word, ord)
  ),
  hit AS (
    SELECT e.id, e.vendor_id, e.title, e.started_at, w.weight
    FROM w
    JOIN public.vendor_engagements e
      ON e.title IS NOT NULL
     AND to_tsvector('english', e.title) @@ plainto_tsquery('english', w.word)
    JOIN public.vendors v ON v.id = e.vendor_id
    WHERE v.status = 'active'
      AND (p_category IS NULL OR e.category = p_category)
      AND (p_service  IS NULL OR e.service  = p_service)
      -- A `declines` capability excludes the vendor here exactly as it does in
      -- get_vendor_candidates (0188). This path used to check status alone, so a
      -- vendor who had told us they no longer take a kind of work was still
      -- suggested for it whenever an old ticket title matched. The request's
      -- category is the chip when one was given, else the matched job's own
      -- category — the closest thing to "what kind of work is this" that a
      -- title match carries. A whole-category decline (NULL service) always
      -- bites; a service-specific one bites only for that service.
      AND NOT EXISTS (
        SELECT 1 FROM public.vendor_capabilities c
        WHERE c.vendor_id = e.vendor_id
          AND c.stance = 'declines'
          AND c.category = COALESCE(p_category, e.category)
          AND (c.service IS NULL OR c.service = COALESCE(p_service, e.service))
          AND (p_city IS NULL OR cardinality(c.cities) = 0 OR c.cities @> ARRAY[p_city])
      )
      -- City narrows on the vendor's SERVICE AREA, not the job: only 1,802 of
      -- 46,572 jobs recorded a location.
      AND (
        p_city IS NULL
        OR v.home_city = p_city
        OR EXISTS (
          SELECT 1 FROM public.vendor_capabilities c
          WHERE c.vendor_id = e.vendor_id AND c.cities @> ARRAY[p_city]
        )
      )
  ),
  scored AS (
    -- Every column qualified: `vendor_id` is also an OUT parameter of this
    -- function, and an unqualified reference is rejected as ambiguous.
    SELECT hit.id, hit.vendor_id AS vid, hit.title, hit.started_at,
           sum(hit.weight)::real AS title_score
    FROM hit GROUP BY hit.id, hit.vendor_id, hit.title, hit.started_at
  )
  SELECT
    sc.vid,
    count(*)::int                                                              AS match_count,
    max(sc.title_score)                                                        AS match_score,
    max(sc.started_at)                                                         AS last_matched,
    (array_agg(sc.title ORDER BY sc.title_score DESC, sc.started_at DESC))[1:2] AS sample_titles
  FROM scored sc
  GROUP BY sc.vid
  -- BEST match first, then depth: ordering by the sum alone let a vendor with 71
  -- weak matches beat the actual sweet shop with 6 strong ones.
  ORDER BY max(sc.title_score) DESC, sum(sc.title_score) DESC, count(*) DESC
  LIMIT greatest(1, coalesce(p_limit, 5));
END;
$$;

COMMENT ON FUNCTION public.find_vendors_by_history(text, text[], text, text, text, integer) IS
  'Find vendors by searching past TICKET TITLES. `p_terms` arrives ordered by importance from the model that read the request and is weighted by rarity x position — rarity alone ranked "black" above "cake" and returned black socks for a cake request. `p_query` is the no-model fallback. A `declines` capability excludes a vendor here as in get_vendor_candidates (request category, else the matched job''s). Q-13 revoked tier: service_role only.';

REVOKE EXECUTE ON FUNCTION public.find_vendors_by_history(text, text[], text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.find_vendors_by_history(text, text[], text, text, text, integer) TO service_role;

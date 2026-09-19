-- 0225 — the category guess ranks the vendor history search; it no longer filters it.
--
-- WHY
-- 0224 stopped the search timing out. This is the second half of the same incident,
-- and the one that was actually visible on screen.
--
-- "Power bank sourcing request NB 10000" reached the ranker with the chip
-- `special-request`, guessed from the words by the page. Nitecore's job for that very
-- ticket is filed under `retail` — not a mistake, it is what the Freshdesk ticket's own
-- category field says. `find_vendors_by_history` filtered on the chip, so the one
-- vendor who had done the job was excluded before scoring, and the page fell through to
-- offering the most-used vendors in Special Request: airlines.
--
-- Measured on production with the AI's own terms (power, bank, portable, charger,
-- battery, pack, mobile, charging):
--     no category filter            Shubham, Ankit, Stuffcool, DailyObjects, NITECORE UAE
--     category = special-request    Ankit, Nanaware, FIRKI, DailyObjects, Samsung BKC
--     category = retail             Shubham, Stuffcool, Fortune Park, NITECORE UAE, nitecore
--
-- The AI had read it correctly, incidentally: it returned category `retail` and eight
-- rare, well-chosen terms. The page's own keyword chip overrode it.
--
-- THE INCONSISTENCY THIS REMOVES
-- vendor-search-intent.ts already states the rule: the model's category is DISPLAY
-- ONLY, never a filter, because "a wrong guess is a hard filter that empties the
-- search". That guard was placed on the model's guess and not on the page's keyword
-- guess, which is the same guess arriving by another route. Now neither filters here.
--
-- WHAT REPLACES IT
-- Agreement is a boost, not a gate: +40% on a job under the guessed category, +20% on
-- the guessed service. The chip still shapes the answer and can no longer empty it.
-- The city is untouched — a place name is a fact in the sentence, not an
-- interpretation, and it narrows on the vendor's service area rather than the job.
-- The category filter also stays in get_vendor_candidates, the fallback used when no
-- title matched at all, where it is the only thing there is to go on.
--
-- Signature unchanged: CREATE OR REPLACE, and the 0190 grants stand.

CREATE OR REPLACE FUNCTION public.find_vendors_by_history(
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
  -- A word carried by more than this share of all titles cannot tell two vendors
  -- apart, and joining one is what made this function time out. See the CTE below.
  v_df_cap bigint;
  -- However rare they all are, never join more than this many words.
  v_max_words constant int := 5;
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
  -- 5% of the corpus, with a floor so a small or empty table never prunes everything.
  v_df_cap := greatest(200, (v_total * 0.05)::bigint);

  RETURN QUERY
  WITH df AS (
    -- How many titles carry each word. This count was already being taken, to price
    -- rarity; now it also decides whether the word is worth JOINING at all.
    SELECT
      t.word,
      t.ord,
      (SELECT count(*) FROM public.vendor_engagements e2
       WHERE e2.title IS NOT NULL
         AND to_tsvector('english', e2.title) @@ plainto_tsquery('english', t.word)) AS n
    FROM unnest(v_words) WITH ORDINALITY AS t(word, ord)
  ),
  w AS (
    -- weight = rarity x position. Rarity alone chose `black` over `cake`;
    -- position alone would ignore that a term nobody ever wrote is worthless.
    --
    -- AND a word too common to discriminate is DROPPED before the join, not merely
    -- given a low weight. That distinction is the whole of 0224. "Power bank sourcing
    -- request NB 10000" took over fourteen seconds and died on the statement timeout,
    -- so the search silently returned nothing and the ranker fell back to ranking the
    -- category by usage -- which answered a power bank request with airlines. Three of
    -- those words match about a thousand titles between them; `request` alone matches
    -- 10,870 of 46,693 (23%), and every one of those rows then pays for a declines
    -- lookup. It carried a fifth of `power`'s weight at ten times the cost.
    --
    -- `rarity = 1` keeps the single rarest word whatever the cap says, so a request
    -- written entirely in common words still gives its best guess instead of nothing.
    SELECT
      r.word,
      (ln(v_total::numeric / greatest(r.n, 1))
       * CASE r.ord WHEN 1 THEN 3.0 WHEN 2 THEN 2.0 ELSE 1.0 END)::real AS weight
    FROM (
      SELECT df.word, df.ord, df.n,
             row_number() OVER (ORDER BY df.n ASC, df.ord ASC) AS rarity
      FROM df
      -- A word no title has ever carried can only cost; it matches nothing.
      WHERE df.n > 0
    ) r
    WHERE r.n <= v_df_cap OR r.rarity = 1
    ORDER BY r.n ASC
    LIMIT v_max_words
  ),
  hit AS (
    SELECT e.id, e.vendor_id, e.title, e.started_at, e.category, e.service, w.weight
    FROM w
    JOIN public.vendor_engagements e
      ON e.title IS NOT NULL
     AND to_tsvector('english', e.title) @@ plainto_tsquery('english', w.word)
    JOIN public.vendors v ON v.id = e.vendor_id
    WHERE v.status = 'active'
      -- The category and service are NOT filtered here any more (0225). They are a
      -- GUESS about the request, and this file already carries the lesson in its own
      -- words for the model's version of that guess: "a wrong guess is a hard filter
      -- that empties the search". The guard was on the model and not on the keyword
      -- chip the page sends, which is the same guess by another route.
      --
      -- It cost a real answer. "Power bank sourcing request NB 10000" arrived with the
      -- chip Special Request; the job is filed under Retail, because that is what the
      -- Freshdesk ticket itself said. Filtering on the chip removed the one vendor who
      -- had done the job, and the page offered airlines. Without the filter Nitecore is
      -- in the top five; with it, it is nowhere.
      --
      -- A title that matches the words IS the evidence. Agreement on category still
      -- counts, as a boost in `scored` below, so the chip continues to shape the answer
      -- without being able to empty it. The filter remains where it is the only thing
      -- there is: get_vendor_candidates, the fallback used when no title matched.
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
    -- The guess now RANKS instead of excluding (0225): a job under the category the
    -- page guessed is worth more than one under another, but one under another is
    -- still worth showing when its title matched the words.
    SELECT hit.id, hit.vendor_id AS vid, hit.title, hit.started_at,
           (sum(hit.weight)
            * (1.0
               + CASE WHEN p_category IS NOT NULL AND hit.category = p_category THEN 0.40 ELSE 0 END
               + CASE WHEN p_service  IS NOT NULL AND hit.service  = p_service  THEN 0.20 ELSE 0 END)
           )::real AS title_score
    FROM hit GROUP BY hit.id, hit.vendor_id, hit.title, hit.started_at, hit.category, hit.service
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
  'Find vendors by searching past TICKET TITLES. Terms are weighted by rarity x position, and a word carried by more '
  'than 5% of titles is dropped before the join (0224). The category and service are a GUESS and RANK the result '
  '(+40% / +20% on agreement) rather than filtering it (0225): filtering on a chip that read "Special Request" hid the '
  'vendor whose job was filed under Retail, and the page answered a power bank request with airlines. The city still '
  'filters, on the vendor''s service area. A `declines` capability excludes a vendor here as in get_vendor_candidates. '
  'Q-13 revoked tier: service_role only.';

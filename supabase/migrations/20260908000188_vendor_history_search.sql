-- ─────────────────────────────────────────────────────────────────────────────
-- 0188 — Find a vendor by what your team has actually written.
--
-- The panel matched a request against a hand-written list of ~80 keywords. That
-- list can never be finished: "order for black forest cake" and "flowers for my
-- father-in-law" both greyed the button out, because nobody had thought to add
-- "cake" or "father". Every new kind of request needed a code change.
--
-- The archive already answers these. Every engagement carries the ticket TITLE
-- — the sentence someone actually typed — and 765 of them mention a cake, 710 a
-- flower. So the request is matched against 47,441 real sentences instead of a
-- vocabulary, and the vendors who served the matching tickets ARE the answer.
--
-- Two decisions worth stating, because both are the opposite of the obvious:
--
--   * **ANY word, not every word.** `plainto_tsquery` ANDs its terms, so
--     "black forest cake" demanded all three and returned nothing — while
--     "cake" alone returns 765 tickets and exactly the right vendors. The
--     terms are OR-ed and the RANK does the discriminating: a title matching
--     three words outranks one matching one.
--
--   * **No AI.** The database knows who did what; a model would take a second,
--     cost money per search, and can name a vendor that does not exist. This
--     returns rows that are provably in the ledger. Intent ("something nice for
--     a client's wife") and typo tolerance are a later layer ON TOP, not the
--     engine.
-- ─────────────────────────────────────────────────────────────────────────────

-- No new index: the FTS index on titles and `(vendor_id, started_at DESC)` both
-- already exist from 0184. An earlier draft re-created the latter and a fresh
-- `db reset` printed "already exists, skipping" for it — harmless, but a second
-- declaration of one index is exactly the drift this file should not add.

DROP FUNCTION IF EXISTS public.find_vendors_by_history(text, text, text, text, integer);

CREATE FUNCTION public.find_vendors_by_history(
  p_query    text    DEFAULT NULL,
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
  -- Words that carry no meaning in a request. English stopwords are dropped by
  -- to_tsquery itself; these are the REQUEST-shaped fillers it would keep —
  -- "need a vendor for…" is how every one of these sentences starts.
  v_filler text[] := ARRAY[
    'need','needs','needed','want','wants','get','gets','find','looking','look',
    'please','pls','kindly','client','clients','guest','guests','order','orders',
    'book','booking','vendor','vendors','someone','something','anyone','arrange',
    'require','required','requirement','asap','urgent','today','tomorrow'
  ];
  v_words   text[];
  v_kept    text[];
  v_min_df  bigint;
  v_ts      tsquery;
BEGIN
  -- Split on anything that is not a letter or digit, drop 1–2 character noise
  -- and the fillers above.
  SELECT array_agg(w) INTO v_words
  FROM unnest(regexp_split_to_array(lower(btrim(coalesce(p_query, ''))), '[^a-z0-9]+')) AS w
  WHERE length(w) >= 3
    AND NOT (w = ANY(v_filler))
    -- The city is already a FILTER (below), so leaving it in the text search
    -- too counts it twice and drags in the wrong vendors: "flowers goa" pulled
    -- up IndiGo and MakeMyTrip, whose titles read "Mumbai → Goa". A flight TO
    -- Goa is not a Goa florist.
    AND (p_city IS NULL OR w <> ALL(regexp_split_to_array(lower(p_city), '[^a-z0-9]+')))
    -- Dates are not subjects. "Sweet Delivery | 11th Sept" was searching for
    -- "11th", which appears in 437 unrelated titles, and "sept". A bare number,
    -- an ordinal, or a month name says nothing about WHO can do the job.
    AND w !~ '^[0-9]+(st|nd|rd|th)?$'
    AND w <> ALL(ARRAY['jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec',
                       'january','february','march','april','june','july','august','september',
                       'october','november','december','monday','tuesday','wednesday','thursday',
                       'friday','saturday','sunday','today','tonight','morning','evening']);

  IF v_words IS NULL OR cardinality(v_words) = 0 THEN
    RETURN;   -- nothing searchable; the caller falls back to the capability ranker
  END IF;

  -- ── Rare words carry the meaning ────────────────────────────────────────
  -- "Sweet Delivery" returned couriers, not sweet shops: `delivery` is in 2,590
  -- titles and `sweet` in 82, so the common word supplied 32x the matches and
  -- buried the one that mattered. Same for "Artwork Procurement" —
  -- `procurement` (486) drowned `artwork` (13).
  --
  -- So the query keeps only words near the RAREST one present. The bar is
  -- relative (3x the rarest) with an absolute floor, so a search whose words
  -- are all common — "flowers", "cake" — keeps them all and still works.
  SELECT min(df) INTO v_min_df FROM (
    SELECT (SELECT count(*) FROM public.vendor_engagements e2
            WHERE e2.title IS NOT NULL
              AND to_tsvector('english', e2.title) @@ plainto_tsquery('english', w)) AS df
    FROM unnest(v_words) AS w
  ) d;

  SELECT array_agg(w) INTO v_kept FROM unnest(v_words) AS w
  WHERE (SELECT count(*) FROM public.vendor_engagements e2
         WHERE e2.title IS NOT NULL
           AND to_tsvector('english', e2.title) @@ plainto_tsquery('english', w))
        <= greatest(coalesce(v_min_df, 0) * 3, 300);

  IF v_kept IS NOT NULL AND cardinality(v_kept) > 0 THEN
    v_words := v_kept;
  END IF;

  -- OR, deliberately (see the header). The words are already stripped to
  -- [a-z0-9] so they need no quoting.
  v_ts := to_tsquery('english', array_to_string(v_words, ' | '));
  -- numnode(), not `= ''::tsquery` — comparing against an empty tsquery makes
  -- Postgres parse '' and emit a NOTICE on every single search.
  IF v_ts IS NULL OR numnode(v_ts) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.vendor_id,
    count(*)::int                                                   AS match_count,
    -- Summed rather than averaged: a vendor with 37 cake jobs should outrank
    -- one with a single very-well-matching title. ts_rank already weights how
    -- much of the query a title covers.
    sum(ts_rank(to_tsvector('english', e.title), v_ts))::real        AS match_score,
    max(e.started_at)                                               AS last_matched,
    (array_agg(e.title ORDER BY ts_rank(to_tsvector('english', e.title), v_ts) DESC))[1:2]
                                                                    AS sample_titles
  FROM public.vendor_engagements e
  JOIN public.vendors v ON v.id = e.vendor_id
  WHERE e.title IS NOT NULL
    AND to_tsvector('english', e.title) @@ v_ts
    AND v.status = 'active'                    -- paused / blacklisted never surface
    -- The chips NARROW when given, and are never required.
    AND (p_category IS NULL OR e.category = p_category)
    AND (p_service  IS NULL OR e.service  = p_service)
    -- City is matched against the vendor's SERVICE AREA, not the engagement:
    -- 45,639 of 47,441 jobs have no city recorded, so filtering on the job
    -- itself would throw away almost everything. Capability cities come from
    -- the extraction's service_cities and are populated for 16,972 vendors.
    AND (
      p_city IS NULL
      OR v.home_city = p_city
      OR EXISTS (
        SELECT 1 FROM public.vendor_capabilities c
        WHERE c.vendor_id = e.vendor_id AND c.cities @> ARRAY[p_city]
      )
    )
  GROUP BY e.vendor_id
  ORDER BY match_score DESC, match_count DESC, max(e.started_at) DESC
  LIMIT greatest(1, coalesce(p_limit, 5));
END;
$$;

COMMENT ON FUNCTION public.find_vendors_by_history(text, text, text, text, integer) IS
  'Find a vendor by searching the TICKET TITLES of past jobs — the sentences the team actually wrote — instead of a hand-written keyword list. Terms are OR-ed and ts_rank discriminates, because requiring every word ("black forest cake") returns nothing while "cake" returns 765 tickets. Category/service narrow on the engagement; city narrows on the vendor''s service area, since 96% of jobs have no city. Q-13 revoked tier: service_role only.';

REVOKE EXECUTE ON FUNCTION public.find_vendors_by_history(text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.find_vendors_by_history(text, text, text, text, integer) TO service_role;

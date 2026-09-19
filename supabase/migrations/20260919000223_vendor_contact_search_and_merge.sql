-- 0223 — Three things a person needs now that the extractor writes vendors by itself:
-- find one by the person you dealt with, put two rows back together when they are one
-- supplier, and take a row out of circulation without destroying what it knows.
--
-- WHY NOW
-- The live extractor (0213/0214) writes the business as the vendor and the person as a
-- contact, which is right: "Booking at Josue Avenue Restaurant" with a note reading
-- "booked through vendor Roman Jackson" is one restaurant, not a vendor called Roman
-- Jackson. But staff remember the person. Searching "Roman Jackson" found nothing,
-- because the search surface never included contacts.
--
-- And the same week it produced "Nitecore UAE" and "nitecore" from one ticket, two
-- hours apart. It flags a near miss rather than merging (a machine must never fuse two
-- suppliers on a guess), so a person has to finish the job — and until now there was no
-- way to, short of someone writing SQL by hand.
--
-- The third is the same problem from the other side: a row that is simply wrong (a
-- client read as a supplier, a product name, a line of chatter) needs to leave the
-- lists and the ranker. A real DELETE is not the answer -- it would take its jobs with
-- it, and those jobs are the record of money that actually moved. So: deleted_at.

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — contacts join the search surface.
-- ─────────────────────────────────────────────────────────────────────────────

-- The 0187 columns are GENERATED, so every operand must be IMMUTABLE. That is why
-- `immutable_array_to_string` (0110) exists for aliases; contacts are jsonb and need
-- their own. The ORDER BY is not decoration: string_agg over a set is otherwise free to
-- order how it likes, and a GENERATED STORED value that can differ between table
-- rewrites is a value you cannot reason about.
--
-- Names AND phones, because a contact with a NULL name is how this table stores the
-- vendor's own general lines (the 0183 column comment), and `primary_phone` is already
-- in the surface — the contacts array is simply where the other lines live. Emails are
-- deliberately OUT: "gmail" and "com" are shared by thousands of rows and would make
-- every such search useless.
CREATE OR REPLACE FUNCTION public.immutable_contact_search_text(p_contacts jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT coalesce(string_ag.txt, '')
  FROM (
    SELECT string_agg(s.bit, ' ' ORDER BY s.ord, s.bit) AS txt
    FROM (
      SELECT c.ordinality AS ord, btrim(c.value ->> 'name') AS bit
        FROM jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb))
             WITH ORDINALITY AS c(value, ordinality)
      UNION ALL
      SELECT c.ordinality, btrim(p.value #>> '{}')
        FROM jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb))
             WITH ORDINALITY AS c(value, ordinality),
             jsonb_array_elements(coalesce(c.value -> 'phones', '[]'::jsonb)) AS p(value)
    ) s
    WHERE s.bit IS NOT NULL AND s.bit <> ''
  ) string_ag;
$$;

COMMENT ON FUNCTION public.immutable_contact_search_text(jsonb) IS
  'Contact names + phones out of vendors.contacts as one lower-caseable string, for the GENERATED '
  'search columns. IMMUTABLE and deterministically ordered because a generated STORED value must not '
  'change between table rewrites. Emails are excluded on purpose (shared tokens, no signal).';

-- Postgres 17 can re-point a generated column in place, which keeps both trigram indexes
-- and rewrites the table once. The expression stays spelled out twice, as 0187 left it.
ALTER TABLE public.vendors
  ALTER COLUMN search_text SET EXPRESSION AS (
    lower(
      name
      || ' ' || public.immutable_array_to_string(aliases, ' ')
      || ' ' || coalesce(subcategory, '')
      || ' ' || coalesce(home_city, '')
      || ' ' || coalesce(primary_phone, '')
      || ' ' || public.immutable_contact_search_text(contacts)
    )
  );

ALTER TABLE public.vendors
  ALTER COLUMN search_key SET EXPRESSION AS (
    regexp_replace(
      lower(
        name
        || ' ' || public.immutable_array_to_string(aliases, ' ')
        || ' ' || coalesce(subcategory, '')
        || ' ' || coalesce(home_city, '')
        || ' ' || coalesce(primary_phone, '')
        || ' ' || public.immutable_contact_search_text(contacts)
      ),
      '[^a-z0-9]+', '', 'g'
    )
  );

COMMENT ON COLUMN public.vendors.search_text IS
  'Generated search surface: name + aliases + subcategory + home_city + primary_phone + contact names '
  'and phones (0223), lower-cased. Trigram-indexed. Never written directly.';
COMMENT ON COLUMN public.vendors.search_key IS
  'search_text with every non-alphanumeric removed, so "Lux Drovia" and "LuxDrovia" are one key. '
  'Trigram-indexed. Never written directly.';

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — merging two vendors that are one supplier.
-- ─────────────────────────────────────────────────────────────────────────────

-- The record of every merge, and the only reason a merge is safe to offer in the UI:
-- the losing spine row is kept here in full, so "we merged the wrong pair" is a
-- conversation with evidence rather than a shrug. Append-only, like every ledger here.
CREATE TABLE IF NOT EXISTS public.vendor_merges (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kept_vendor_id    uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  -- No FK: this row is deleted by the merge, on purpose. Keeping the id lets an old
  -- link or a cached page id be explained rather than 404 into silence.
  merged_vendor_id  uuid        NOT NULL,
  merged_name       text        NOT NULL,
  -- The whole deleted spine row. Everything else that moved is still in its own table,
  -- pointing at the keeper; this is the one thing a merge destroys.
  merged_row        jsonb       NOT NULL,
  -- What moved, and what was folded because the keeper already had the same thing.
  moved             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  merged_by         uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_merges_kept ON public.vendor_merges (kept_vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_merges_merged ON public.vendor_merges (merged_vendor_id);

COMMENT ON TABLE public.vendor_merges IS
  'One row per manual vendor merge (0223). Append-only: no UPDATE or DELETE, no user write policy. '
  'merged_row holds the deleted spine row in full, which is what makes a merge answerable after the fact.';

ALTER TABLE public.vendor_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_merges_select ON public.vendor_merges
  FOR SELECT TO authenticated
  USING ((SELECT public.can_access_vendors()));

-- ─────────────────────────────────────────────────────────────────────────────
-- merge_vendors — one transaction, or nothing.
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A FUNCTION AND NOT A SEQUENCE OF CALLS FROM THE APP
-- A vendor id is referenced by seven tables, and three of them carry a UNIQUE that the
-- move can collide with. A half-finished merge would leave jobs under a vendor that no
-- longer exists, or fail on the last table with the first six already moved. One
-- statement, one transaction, all of it or none of it.
--
-- THE COLLISIONS ARE THE WHOLE PROBLEM, and they are not theoretical. On 2026-09-18 the
-- extractor read one ticket twice, two hours apart, and produced "Nitecore UAE" and
-- "nitecore" — BOTH holding a job for ticket 55146. `vendor_engagements` is UNIQUE on
-- (vendor_id, source, source_ref), so simply re-pointing the second one raises 23505.
-- Where the keeper already has the same job, the duplicate is FOLDED: every fact the
-- keeper is missing is filled from it, its reviews follow to the surviving job, and the
-- now-empty duplicate row is removed.
--
-- A-11 (append-only) — this is the DELETE the Decision Log entry of 2026-09-19 covers.
-- Two rows describing one real job are not history, they are a fault in it; the facts
-- are folded into the survivor rather than lost, and the audit row above keeps what was
-- destroyed. Nothing here rewrites a fact the keeper already had: every fold is COALESCE.
--
-- Q-13: service_role only. The caller gates (mergeVendorsAction → requireVendorAccess).
CREATE OR REPLACE FUNCTION public.merge_vendors(
  p_keep  uuid,
  p_merge uuid,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sia
AS $$
DECLARE
  v_keep       public.vendors%ROWTYPE;
  v_merge      public.vendors%ROWTYPE;
  r            record;
  v_twin       uuid;
  n_eng_moved  int := 0;
  n_eng_folded int := 0;
  n_cap_moved  int := 0;
  n_cap_folded int := 0;
  n_reviews    int := 0;
  n_notes      int := 0;
  n_pref_moved int := 0;
  n_pref_kept  int := 0;
  n_tickets    int := 0;
  n_groups     int := 0;
  n_contacts   int := 0;
  v_moved      jsonb;
BEGIN
  IF p_keep IS NULL OR p_merge IS NULL THEN
    RAISE EXCEPTION 'merge_vendors: both ids are required' USING ERRCODE = '22004';
  END IF;
  IF p_keep = p_merge THEN
    RAISE EXCEPTION 'merge_vendors: a vendor cannot be merged into itself' USING ERRCODE = '22023';
  END IF;

  -- Lock both spine rows, lowest id first. Two people merging the same pair from
  -- opposite directions at the same moment would otherwise deadlock.
  IF p_keep < p_merge THEN
    SELECT * INTO v_keep  FROM public.vendors WHERE id = p_keep  FOR UPDATE;
    SELECT * INTO v_merge FROM public.vendors WHERE id = p_merge FOR UPDATE;
  ELSE
    SELECT * INTO v_merge FROM public.vendors WHERE id = p_merge FOR UPDATE;
    SELECT * INTO v_keep  FROM public.vendors WHERE id = p_keep  FOR UPDATE;
  END IF;

  IF v_keep.id IS NULL THEN
    RAISE EXCEPTION 'merge_vendors: the vendor to keep does not exist' USING ERRCODE = 'P0002';
  END IF;
  IF v_merge.id IS NULL THEN
    RAISE EXCEPTION 'merge_vendors: the vendor to merge does not exist' USING ERRCODE = 'P0002';
  END IF;
  -- Merging INTO a removed row would move live history somewhere nobody can see.
  -- Merging a removed row into a live one is the opposite, and is allowed: that is
  -- exactly how someone tidies up after removing the wrong half of a pair.
  IF v_keep.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'merge_vendors: the vendor to keep has been removed' USING ERRCODE = '22023';
  END IF;

  -- ── The ledger: move what is new, fold what is already there ──────────────
  FOR r IN SELECT * FROM public.vendor_engagements WHERE vendor_id = p_merge LOOP
    SELECT id INTO v_twin
      FROM public.vendor_engagements
     WHERE vendor_id = p_keep AND source = r.source AND source_ref = r.source_ref;

    IF v_twin IS NULL THEN
      UPDATE public.vendor_engagements SET vendor_id = p_keep WHERE id = r.id;
      n_eng_moved := n_eng_moved + 1;
    ELSE
      -- Fill the survivor's gaps. COALESCE throughout: a fact the keeper already
      -- carries is never replaced by the duplicate's version of it.
      UPDATE public.vendor_engagements k SET
        member_id      = coalesce(k.member_id, r.member_id),
        lead_id        = coalesce(k.lead_id, r.lead_id),
        agent_id       = coalesce(k.agent_id, r.agent_id),
        agent_name_raw = coalesce(k.agent_name_raw, r.agent_name_raw),
        title          = coalesce(k.title, r.title),
        service        = coalesce(k.service, r.service),
        city           = coalesce(k.city, r.city),
        amount_inr     = coalesce(k.amount_inr, r.amount_inr),
        note           = coalesce(k.note, r.note),
        closed_at      = coalesce(k.closed_at, r.closed_at),
        outcome        = CASE WHEN k.outcome = 'unknown' THEN r.outcome ELSE k.outcome END,
        invoice_paths  = CASE WHEN coalesce(array_length(k.invoice_paths, 1), 0) = 0
                              THEN r.invoice_paths ELSE k.invoice_paths END
      WHERE k.id = v_twin;

      -- A rating written against the duplicate job belongs to the surviving one.
      UPDATE public.vendor_reviews SET engagement_id = v_twin WHERE engagement_id = r.id;
      DELETE FROM public.vendor_engagements WHERE id = r.id;
      n_eng_folded := n_eng_folded + 1;
    END IF;
  END LOOP;

  -- ── Capabilities: UNIQUE on (vendor, category, coalesce(service,'')) ───────
  FOR r IN SELECT * FROM public.vendor_capabilities WHERE vendor_id = p_merge LOOP
    SELECT id INTO v_twin
      FROM public.vendor_capabilities
     WHERE vendor_id = p_keep
       AND category = r.category
       AND coalesce(service, '') = coalesce(r.service, '');

    IF v_twin IS NULL THEN
      UPDATE public.vendor_capabilities SET vendor_id = p_keep WHERE id = r.id;
      n_cap_moved := n_cap_moved + 1;
    ELSE
      -- Cities union; a `declines` on either side wins, because it is the stronger
      -- statement and the ranker hard-excludes on it.
      UPDATE public.vendor_capabilities k SET
        cities = (SELECT coalesce(array_agg(DISTINCT c), '{}'::text[])
                    FROM unnest(coalesce(k.cities, '{}') || coalesce(r.cities, '{}')) c
                   WHERE c IS NOT NULL AND btrim(c) <> ''),
        stance = CASE WHEN k.stance = 'declines' OR r.stance = 'declines' THEN 'declines' ELSE k.stance END,
        note   = coalesce(k.note, r.note)
      WHERE k.id = v_twin;
      DELETE FROM public.vendor_capabilities WHERE id = r.id;
      n_cap_folded := n_cap_folded + 1;
    END IF;
  END LOOP;

  -- ── Preferences: UNIQUE on (vendor, agent). One person, one stance. ───────
  FOR r IN SELECT * FROM public.vendor_agent_preferences WHERE vendor_id = p_merge LOOP
    SELECT id INTO v_twin
      FROM public.vendor_agent_preferences
     WHERE vendor_id = p_keep AND agent_id = r.agent_id;

    IF v_twin IS NULL THEN
      UPDATE public.vendor_agent_preferences SET vendor_id = p_keep WHERE id = r.id;
      n_pref_moved := n_pref_moved + 1;
    ELSE
      -- The keeper's note is the one that person wrote about the row they will keep
      -- seeing. Their other one is dropped rather than silently overwriting it.
      DELETE FROM public.vendor_agent_preferences WHERE id = r.id;
      n_pref_kept := n_pref_kept + 1;
    END IF;
  END LOOP;

  -- ── Everything with no UNIQUE to collide with ─────────────────────────────
  UPDATE public.vendor_reviews SET vendor_id = p_keep WHERE vendor_id = p_merge;
  GET DIAGNOSTICS n_reviews = ROW_COUNT;

  UPDATE public.vendor_notes SET vendor_id = p_keep WHERE vendor_id = p_merge;
  GET DIAGNOSTICS n_notes = ROW_COUNT;

  UPDATE sia.tickets SET vendor_id = p_keep WHERE vendor_id = p_merge;
  GET DIAGNOSTICS n_tickets = ROW_COUNT;

  UPDATE sia.wag_groups SET vendor_id = p_keep WHERE vendor_id = p_merge;
  GET DIAGNOSTICS n_groups = ROW_COUNT;

  UPDATE sia.wag_contacts SET vendor_id = p_keep WHERE vendor_id = p_merge;
  GET DIAGNOSTICS n_contacts = ROW_COUNT;

  -- ── The spine: the keeper absorbs, it never loses ─────────────────────────
  -- The loser's NAME becomes an alias, which is the point: the next time the
  -- extractor reads that spelling it matches exactly instead of creating the row again.
  UPDATE public.vendors k SET
    aliases = (
      SELECT coalesce(array_agg(DISTINCT a), '{}'::text[])
        FROM unnest(coalesce(k.aliases, '{}') || ARRAY[v_merge.name] || coalesce(v_merge.aliases, '{}')) a
       WHERE a IS NOT NULL
         AND btrim(a) <> ''
         AND lower(btrim(a)) <> lower(btrim(k.name))
    ),
    category        = coalesce(k.category, v_merge.category),
    subcategory     = coalesce(k.subcategory, v_merge.subcategory),
    category_source = coalesce(k.category_source, v_merge.category_source),
    primary_phone   = coalesce(k.primary_phone, v_merge.primary_phone),
    home_city       = coalesce(k.home_city, v_merge.home_city),
    notes           = coalesce(k.notes, v_merge.notes),
    sources = (
      SELECT coalesce(array_agg(DISTINCT s), '{}'::text[])
        FROM unnest(coalesce(k.sources, '{}') || coalesce(v_merge.sources, '{}')) s
       WHERE s IS NOT NULL
    ),
    contacts = (
      SELECT coalesce(jsonb_agg(DISTINCT e ORDER BY e), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(k.contacts, '[]'::jsonb) || coalesce(v_merge.contacts, '[]'::jsonb)) e
    ),
    -- Keeper's keys win; the loser's provenance is kept under whatever keys it had
    -- that the keeper does not, so "where did this come from" still answers.
    import_raw = coalesce(v_merge.import_raw, '{}'::jsonb) || coalesce(k.import_raw, '{}'::jsonb)
  WHERE k.id = p_keep;

  v_moved := jsonb_build_object(
    'engagements_moved',  n_eng_moved,
    'engagements_folded', n_eng_folded,
    'capabilities_moved', n_cap_moved,
    'capabilities_folded', n_cap_folded,
    'reviews',            n_reviews,
    'notes',              n_notes,
    'preferences_moved',  n_pref_moved,
    'preferences_dropped', n_pref_kept,
    'tickets',            n_tickets,
    'wa_groups',          n_groups,
    'wa_contacts',        n_contacts
  );

  -- Recorded BEFORE the delete, so the audit row exists even if the delete trips a
  -- reference this function does not know about (which is itself the alarm).
  INSERT INTO public.vendor_merges (kept_vendor_id, merged_vendor_id, merged_name, merged_row, moved, merged_by)
  VALUES (p_keep, p_merge, v_merge.name, to_jsonb(v_merge), v_moved, p_actor);

  DELETE FROM public.vendors WHERE id = p_merge;

  RETURN v_moved || jsonb_build_object('kept_vendor_id', p_keep, 'merged_vendor_id', p_merge, 'merged_name', v_merge.name);
END;
$$;

COMMENT ON FUNCTION public.merge_vendors(uuid, uuid, uuid) IS
  'Merge one vendor into another in a single transaction: move engagements, capabilities, reviews, notes, '
  'preferences, sia.tickets and the WhatsApp links onto the keeper, folding anything the keeper already has '
  '(the ledger UNIQUE on (vendor_id, source, source_ref) makes this unavoidable — see the A-11 Decision Log '
  'entry of 2026-09-19). The loser''s name becomes an alias so the extractor matches it next time. Records '
  'public.vendor_merges with the deleted spine row. Q-13 revoked tier: service_role only.';

REVOKE EXECUTE ON FUNCTION public.merge_vendors(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.merge_vendors(uuid, uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — removing a vendor from the product, not from the database.
-- ─────────────────────────────────────────────────────────────────────────────
-- A vendor row can be plain wrong: a client the extractor read as a supplier, a product
-- name, a line of chatter. Staff need to make it go away without waiting for anyone.
--
-- WHY NOT A REAL DELETE. `vendor_engagements` and `vendor_reviews` are ON DELETE
-- RESTRICT, so a vendor with any history cannot be deleted at all -- and that restraint
-- is right. Those rows record money that moved and work that happened; they are the
-- product's memory, and the fact that someone attached them to the wrong name does not
-- make them untrue. `deleted_at` takes the row out of every list, every search and the
-- ranker, and leaves all of it intact and restorable.
--
-- WHY NOT status = 'blacklisted'. Status answers "how should we treat this supplier"
-- (blacklisted still appears, deliberately, so nobody re-adds it by accident).
-- deleted_at answers a different question: "is this a supplier at all". Folding the two
-- would lose one of the answers.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Indexes only the removed rows: tiny, and it is the one set anyone ever asks for
-- directly ("what did we remove, and can I put it back").
CREATE INDEX IF NOT EXISTS idx_vendors_deleted ON public.vendors (deleted_at DESC) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.vendors.deleted_at IS
  'When a person removed this vendor from the product (0223). NULL = live. A removed vendor is '
  'excluded from search_vendors, count_vendors and get_vendor_candidates, but its row, its jobs, its '
  'reviews and its notes are untouched and it can be restored. Never use this for "stop suggesting '
  'them" -- that is status = paused / blacklisted.';

-- ── The three reads that must stop returning it ──────────────────────────────
-- Re-declared rather than patched, because a function body is not editable in place.
-- Each is the 0187 / 0192 body verbatim plus one line.

CREATE OR REPLACE FUNCTION public.search_vendors(
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
  IF length(v_raw) >= 4 AND v_raw ~ '[a-z]' THEN v_fuzzy := v_raw; END IF;

  RETURN QUERY
  SELECT v.*
  FROM public.vendors v
  WHERE v.deleted_at IS NULL                    -- 0223: removed vendors are not findable
    AND (p_category IS NULL OR v.category = p_category)
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
    (v_raw <> '' AND lower(v.name) = v_raw) DESC,
    (
      length(v_squashed) >= 6
      AND regexp_replace(coalesce(v.primary_phone, ''), '[^0-9]+', '', 'g') LIKE '%' || v_squashed || '%'
    ) DESC,
    (v_squashed <> '' AND v.search_key LIKE v_squashed || '%') DESC,
    (v_squashed <> '' AND v.search_key LIKE '%' || v_squashed || '%') DESC,
    CASE WHEN v_raw = '' THEN 0::real ELSE greatest(
      similarity(lower(v.name), v_raw),
      similarity(regexp_replace(lower(v.name), '[^a-z0-9]+', '', 'g'), v_squashed)
    ) END DESC,
    v.name ASC
  LIMIT  greatest(1, coalesce(p_limit, 20))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

COMMENT ON FUNCTION public.search_vendors(text, text, text, integer, integer) IS
  'THE vendor search — one ranked page (exact > own phone > prefix > contains > closest). Matches on all-words-any-order, space-insensitive substring, or trigram typo distance, across name, aliases, subcategory, city, phone and CONTACT names and phones (0223). Removed vendors (deleted_at) never appear. plpgsql so the query parts become plan parameters and the GIN trigram indexes are used. Q-13 revoked tier: service_role only, via callAdminRpc.';

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
      WHERE v.deleted_at IS NULL                -- 0223; the other branch inherits it
        AND (p_category IS NULL OR v.category = p_category)
        AND (p_status   IS NULL OR v.status   = p_status)
    )
    ELSE (
      SELECT count(*) FROM public.search_vendors(p_query, p_category, p_status, 2147483647, 0)
    )
  END;
$$;

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
  WHERE v.deleted_at IS NULL          -- 0223: a removed vendor is never suggested
    AND v.status = 'active'           -- paused / blacklisted never rank
    AND EXISTS (
      SELECT 1 FROM public.vendor_capabilities c
      WHERE c.vendor_id = v.id
        AND c.stance = 'offers'
        AND (p_category IS NULL OR c.category = p_category)
        AND (
          p_service IS NULL
          OR c.service = p_service
          OR (p_category IS NOT NULL AND c.service IS NULL)
        )
        AND (p_city     IS NULL OR cardinality(c.cities) = 0 OR c.cities @> ARRAY[p_city])
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.vendor_capabilities c
      WHERE c.vendor_id = v.id
        AND c.stance = 'declines'
        AND (p_category IS NULL OR c.category = p_category)
        AND (c.service IS NULL OR (p_service IS NOT NULL AND c.service = p_service))
        AND (p_city IS NULL OR cardinality(c.cities) = 0 OR c.cities @> ARRAY[p_city])
    )
  ORDER BY v.id;
$$;

COMMENT ON FUNCTION public.get_vendor_candidates(text, text, text) IS
  'THE ranker candidate set: LIVE (deleted_at IS NULL, 0223), active vendors with an applying `offers` capability and no applying `declines`, ORDER BY id so the service can page it past PostgREST''s 1,000-row response cap (0192 — dining alone is 5,957). Q-13 revoked tier: service_role only.';

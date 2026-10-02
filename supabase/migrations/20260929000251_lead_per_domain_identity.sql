-- Migration 0251 — one active lead per person PER DOMAIN (2026-09-29)
--
-- PROBLEM
--   The lead identity was the phone alone: one active lead per phone across the WHOLE
--   company (get_active_lead_by_phone, 0008/0137). So a person who already had an active
--   Onboarding lead and then clicked a Legacy ad, or asked about a Shop product, or was
--   added by a Legacy agent by hand, never became a Legacy / Shop lead. The submission was
--   folded into the Onboarding lead as a `duplicate_submission` row. Measured on
--   production 2026-09-29: 48 such submissions, 42 of them from paid campaigns. The team
--   that paid for the ad never saw the lead, and an agent adding the person by hand was
--   sent to a lead the security rules do not let him open.
--
--   Second finding: the 0137 "active phone" UNIQUE index is NOT unique on production. 0137
--   fell back to a plain index because duplicate active leads already existed, so the only
--   thing stopping a double insert was the app's read-then-write.
--
-- FIX
--   1. gia.leads.phone_key — the canonical phone key as a STORED generated column
--      (lead_phone_key(phone), 0137). It cannot drift from `phone`, and every identity
--      read (the duplicate check, the "also in" lookup) is a plain indexed column.
--   2. The 21 groups of same-domain active twins are settled: the lead with the most work
--      on it stays, its twins are archived (nothing is deleted), their notes are copied to
--      the keeper, and the keeper's timeline says which lead was folded in.
--   3. A REAL unique index: one active lead per (phone_key, domain). No fallback: if twins
--      remain the migration fails loudly instead of quietly building a plain index.
--   4. get_active_lead_by_phone(p_phone, p_domain) — the duplicate check asks inside ONE
--      domain. p_domain defaults to NULL (any domain), so the build that is live while
--      this migration lands keeps its old behaviour until the new build is deployed.
--      EXECUTE is revoked from PUBLIC, anon and authenticated (the old function was still
--      callable by `anon`; it returns a name and a phone).
--   5. generate_lead_slug(..., p_domain) — a second lead for the same person takes the
--      domain as its suffix (ashish-kumar-3210-shop), not a bare -2. Existing slugs are
--      never rewritten.
--
-- NOT CHANGED: every RLS policy on leads, lead_notes and lead_activities. Reading a
-- person's lead in another domain goes through ONE gated service read
-- (src/lib/services/lead-identity.ts), never through a wider policy.

-- ─────────────────────────────────────────────────────────
-- 1. phone_key — stored, generated, indexed
-- ─────────────────────────────────────────────────────────
ALTER TABLE gia.leads
  ADD COLUMN IF NOT EXISTS phone_key text
  GENERATED ALWAYS AS (public.lead_phone_key(phone)) STORED;

COMMENT ON COLUMN gia.leads.phone_key IS
  'The canonical phone key (digits only) — generated from phone by lead_phone_key(), never '
  'written by hand. THE person identity: the duplicate check is (phone_key, domain), the '
  '"also in another domain" lookup is phone_key. Empty string when the lead has no phone.';

-- ─────────────────────────────────────────────────────────
-- 2. Settle the same-domain active twins (keep one, archive the rest)
--    Keeper: most work (notes + calls) → has an owner → furthest status → oldest.
-- ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_archived int := 0;
  v_notes    int := 0;
BEGIN
  CREATE TEMP TABLE _lead_twins ON COMMIT DROP AS
  WITH active AS (
    SELECT l.id, l.phone_key, l.domain, l.created_at,
           row_number() OVER (
             PARTITION BY l.phone_key, l.domain
             ORDER BY
               (SELECT count(*) FROM gia.lead_notes n WHERE n.lead_id = l.id) + coalesce(l.call_count, 0) DESC,
               (l.assigned_to IS NOT NULL) DESC,
               CASE l.status
                 WHEN 'in_discussion' THEN 4
                 WHEN 'nurturing'     THEN 3
                 WHEN 'touched'       THEN 2
                 ELSE 1
               END DESC,
               l.created_at ASC,
               l.id ASC
           ) AS rn,
           first_value(l.id) OVER (
             PARTITION BY l.phone_key, l.domain
             ORDER BY
               (SELECT count(*) FROM gia.lead_notes n WHERE n.lead_id = l.id) + coalesce(l.call_count, 0) DESC,
               (l.assigned_to IS NOT NULL) DESC,
               CASE l.status
                 WHEN 'in_discussion' THEN 4
                 WHEN 'nurturing'     THEN 3
                 WHEN 'touched'       THEN 2
                 ELSE 1
               END DESC,
               l.created_at ASC,
               l.id ASC
           ) AS keeper_id
      FROM gia.leads l
     WHERE l.archived_at IS NULL
       AND l.phone_key <> ''
       AND l.status IN ('new', 'touched', 'in_discussion', 'nurturing')
  )
  SELECT id AS twin_id, keeper_id
    FROM active
   WHERE rn > 1;

  -- The twin's notes move WITH the person: copied to the keeper (an INSERT, the notes
  -- table stays append-only), same author, same time.
  INSERT INTO gia.lead_notes (lead_id, author_id, content, call_outcome, created_at)
  SELECT t.keeper_id, n.author_id, n.content, n.call_outcome, n.created_at
    FROM _lead_twins t
    JOIN gia.lead_notes n ON n.lead_id = t.twin_id;
  GET DIAGNOSTICS v_notes = ROW_COUNT;

  -- The keeper's timeline says what was folded in.
  INSERT INTO gia.lead_activities (lead_id, actor_id, action_type, details)
  SELECT t.keeper_id, NULL, 'note_added',
         jsonb_build_object('type', 'duplicate_lead_archived', 'archived_lead_id', t.twin_id, 'migration', '0251')
    FROM _lead_twins t;

  UPDATE gia.leads l
     SET archived_at = now()
    FROM _lead_twins t
   WHERE l.id = t.twin_id;
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  RAISE NOTICE '[0251] archived % duplicate active lead(s), copied % note(s) to their keepers', v_archived, v_notes;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- 3. The indexes — a real UNIQUE, and the person lookup
-- ─────────────────────────────────────────────────────────
DROP INDEX IF EXISTS gia.idx_leads_phone_key_active;

DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
    FROM (
      SELECT 1
        FROM gia.leads
       WHERE archived_at IS NULL
         AND phone_key <> ''
         AND status IN ('new', 'touched', 'in_discussion', 'nurturing')
       GROUP BY phone_key, domain
      HAVING count(*) > 1
    ) d;

  IF v_left > 0 THEN
    RAISE EXCEPTION '[0251] % same-domain active duplicate group(s) remain — the unique index cannot be built', v_left;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_active_person_domain
  ON gia.leads (phone_key, domain)
  WHERE archived_at IS NULL
    AND phone_key <> ''
    AND status IN ('new', 'touched', 'in_discussion', 'nurturing');

COMMENT ON INDEX gia.idx_leads_active_person_domain IS
  'One ACTIVE lead per person per domain (0251). Active = new/touched/in_discussion/nurturing, '
  'the same set get_active_lead_by_phone reads. Won/lost/junk and archived leads are outside '
  'it, so a returning client always gets a new lead. A 23505 here is caught in the app: an '
  'insert returns the lead that won the race; a domain move or a re-open that would make a '
  'second active lead is refused with a sentence.';

-- The person lookup: every lead of one person, any domain, any status.
CREATE INDEX IF NOT EXISTS idx_leads_phone_key
  ON gia.leads (phone_key)
  WHERE archived_at IS NULL
    AND phone_key <> '';

-- ─────────────────────────────────────────────────────────
-- 4. get_active_lead_by_phone(p_phone, p_domain)
--    DROP first: a new parameter is a new signature, and two overloads would be ambiguous.
-- ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_active_lead_by_phone(text);

CREATE OR REPLACE FUNCTION public.get_active_lead_by_phone(
  p_phone  text,
  p_domain app_domain DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  first_name  text,
  last_name   text,
  phone       text,
  status      text,
  assigned_to uuid,
  domain      app_domain,
  slug        text,
  archived_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, gia, member
AS $$
  SELECT l.id, l.first_name, l.last_name, l.phone, l.status,
         l.assigned_to, l.domain, l.slug, l.archived_at
    FROM gia.leads l
   WHERE l.phone_key = public.lead_phone_key(p_phone)
     AND l.phone_key <> ''
     AND (p_domain IS NULL OR l.domain = p_domain)
     AND l.archived_at IS NULL
     AND l.status IN ('new', 'touched', 'in_discussion', 'nurturing')
   ORDER BY l.created_at DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_active_lead_by_phone(text, app_domain) IS
  'THE duplicate check (0251): the active lead of this phone INSIDE one domain. p_domain NULL '
  '= any domain (the pre-0251 behaviour, kept only so the old build keeps working across the '
  'deploy). Matches on phone_key, so a format variant of the same number is the same person. '
  'Admin client only: returns whatever phone it is asked for.';

-- Q-13: it returns the slice it is asked for, so nobody but the service role calls it.
REVOKE ALL ON FUNCTION public.get_active_lead_by_phone(text, app_domain) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_lead_by_phone(text, app_domain) TO service_role;

-- ─────────────────────────────────────────────────────────
-- 5. Slugs — the second lead of one person carries its domain
-- ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.generate_lead_slug(text, text, text);

CREATE OR REPLACE FUNCTION public.generate_lead_slug(
  p_first_name text,
  p_last_name  text,
  p_phone      text,
  p_domain     text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, gia, member
AS $$
DECLARE
  base      text;
  last4     text;
  stem      text;
  candidate text;
  counter   int := 1;
BEGIN
  last4 := right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 4);
  base  := regexp_replace(
             lower(concat_ws('-',
               regexp_replace(trim(coalesce(p_first_name, '')), '\s+', '-', 'g'),
               regexp_replace(trim(coalesce(p_last_name,  '')), '\s+', '-', 'g')
             )),
             '[^a-z0-9\-]', '', 'g'
           );

  -- First lead of this name + number: the plain slug, exactly as before.
  stem := base || '-' || last4;
  IF NOT EXISTS (SELECT 1 FROM gia.leads WHERE slug = stem) THEN
    RETURN stem;
  END IF;

  -- Taken: the same person in another domain (or a returning client). Say the domain.
  IF p_domain IS NOT NULL AND p_domain <> '' THEN
    stem := stem || '-' || p_domain;
    IF NOT EXISTS (SELECT 1 FROM gia.leads WHERE slug = stem) THEN
      RETURN stem;
    END IF;
  END IF;

  -- Taken again (a returning client inside the same domain): count.
  LOOP
    counter   := counter + 1;
    candidate := stem || '-' || counter;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM gia.leads WHERE slug = candidate);
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_lead_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, gia, member
AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.phone IS NOT NULL THEN
    NEW.slug := generate_lead_slug(NEW.first_name, NEW.last_name, NEW.phone, NEW.domain::text);
  END IF;
  RETURN NEW;
END;
$$;

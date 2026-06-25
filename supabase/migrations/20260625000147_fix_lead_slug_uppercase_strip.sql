-- Fix: generate_lead_slug stripped EVERY uppercase letter from the slug.
--
-- The 0046 body ran the character-class strip on the ORIGINAL mixed-case string:
--
--   base := lower(regexp_replace(concat_ws('-', first, last), '[^a-z0-9\-]', '', 'g'));
--                 └─ inner strip runs FIRST, on "Akhil-Deekshith" ──────────────┘
--   the class [^a-z0-9\-] is lowercase-only, so 'A','D',... are "not allowed" and
--   are deleted BEFORE lower() ever runs. Result: "Akhil Deekshith" -> "khil-eekshith".
--
-- Impact (prod, 2026-06-25): 4,705 of 5,219 active slugs were missing their
-- first letter (every name part that began with a capital). Masked until now only
-- because the dossier route falls back to UUID and lead SEARCH uses the separate,
-- correct `search_text` column — so the corruption was cosmetic + an Elaya-handle
-- hazard, never a hard 404.
--
-- The fix is one move: lower() BEFORE the strip, so the class sees lowercased text.
-- Then a full regenerate of every slug (oldest-first, so the first holder of a
-- name+phone-suffix keeps the clean slug and later duplicates get -2/-3, exactly
-- the 0046 collision contract).
--
-- Slugs are NOT a stored generated column and NOT updated by any trigger after
-- INSERT (trg_lead_slug is BEFORE INSERT only), so rewriting slug here touches no
-- generated dependency. `leads.slug` has a partial UNIQUE index — the regenerate
-- loop below frees every slug first (sets them NULL in one statement) so the
-- collision loop never trips on a stale pre-fix value.

-- ─── Corrected generator (lower BEFORE strip) ────────────────────────────────

CREATE OR REPLACE FUNCTION generate_lead_slug(
  p_first_name text,
  p_last_name  text,
  p_phone      text
) RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  base      text;
  last4     text;
  candidate text;
  counter   int := 1;
BEGIN
  last4 := right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 4);
  -- lower() FIRST, then strip — the class [^a-z0-9\-] now only sees lowercase,
  -- so it keeps the (already lowercased) letters instead of deleting capitals.
  base  := regexp_replace(
             lower(concat_ws('-',
               regexp_replace(trim(coalesce(p_first_name, '')), '\s+', '-', 'g'),
               regexp_replace(trim(coalesce(p_last_name,  '')), '\s+', '-', 'g')
             )),
             '[^a-z0-9\-]', '', 'g'
           );

  candidate := base || '-' || last4;

  -- Loop until a free slot is found (skip the row we're updating — handled by the
  -- regenerate block below NULL-ing slugs first, so no self-collision here).
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM leads WHERE slug = candidate
    );
    counter   := counter + 1;
    candidate := base || '-' || last4 || '-' || counter;
  END LOOP;

  RETURN candidate;
END;
$$;

-- ─── Trigger uses the function by name — no change needed, but re-state it so the
--     contract is explicit in this file's history. (set_lead_slug body unchanged.)

CREATE OR REPLACE FUNCTION set_lead_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.phone IS NOT NULL THEN
    NEW.slug := generate_lead_slug(NEW.first_name, NEW.last_name, NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Regenerate ALL slugs ────────────────────────────────────────────────────
-- Free every slug first (one UPDATE) so the collision loop in generate_lead_slug
-- never sees a stale pre-fix value, then regenerate oldest-first so the earliest
-- lead with a given name+phone-suffix keeps the clean slug and later duplicates
-- get the -2/-3 counter (mirrors the 0046 backfill ordering exactly).

DO $$
DECLARE
  rec RECORD;
BEGIN
  UPDATE leads SET slug = NULL WHERE phone IS NOT NULL;

  FOR rec IN
    SELECT id, first_name, last_name, phone
    FROM   leads
    WHERE  slug IS NULL
      AND  phone IS NOT NULL
    ORDER  BY created_at ASC
  LOOP
    UPDATE leads
    SET    slug = generate_lead_slug(rec.first_name, rec.last_name, rec.phone)
    WHERE  id = rec.id;
  END LOOP;
END;
$$;

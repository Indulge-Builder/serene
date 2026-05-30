-- Fix: slug backfill in migration 0045 failed because archived/previous leads
-- can share the same name+phone-suffix, causing a UNIQUE collision.
-- Solution: replace the plain generator with one that appends -2, -3, ...
-- until the slot is free. The trigger is updated to use the same function.

-- ─── Safe generator: appends counter suffix on collision ─────────────────────

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
  base  := lower(regexp_replace(
             concat_ws('-',
               regexp_replace(trim(coalesce(p_first_name, '')), '\s+', '-', 'g'),
               regexp_replace(trim(coalesce(p_last_name,  '')), '\s+', '-', 'g')
             ),
             '[^a-z0-9\-]', '', 'g'
           ));

  candidate := base || '-' || last4;

  -- Loop until a free slot is found
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

-- ─── Back-fill rows that failed in migration 0045 ────────────────────────────
-- Process oldest-first so the first lead keeps the clean slug and later
-- duplicates get the counter suffix.

DO $$
DECLARE
  rec RECORD;
BEGIN
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

-- ─── Update trigger to use the collision-safe generator ──────────────────────

CREATE OR REPLACE FUNCTION set_lead_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.phone IS NOT NULL THEN
    NEW.slug := generate_lead_slug(NEW.first_name, NEW.last_name, NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

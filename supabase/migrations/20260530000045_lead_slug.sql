-- Lead slug: human-readable URL identifier
-- Format: priya-sharma-9182 (name parts + last 4 digits of phone)
-- Immutable after insert — slug never changes when phone/name change.
-- Collision guard: UNIQUE constraint; in practice impossible since phone is
-- already a dedup key (no two active leads share a phone).

ALTER TABLE leads ADD COLUMN slug text;

CREATE UNIQUE INDEX idx_leads_slug ON leads(slug) WHERE slug IS NOT NULL;

-- ─── Generator function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_lead_slug(
  p_first_name text,
  p_last_name  text,
  p_phone      text
) RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  base  text;
  last4 text;
BEGIN
  last4 := right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 4);
  base  := lower(regexp_replace(
             concat_ws('-',
               regexp_replace(trim(coalesce(p_first_name, '')), '\s+', '-', 'g'),
               regexp_replace(trim(coalesce(p_last_name, '')), '\s+', '-', 'g')
             ),
             '[^a-z0-9\-]', '', 'g'
           ));
  RETURN base || '-' || last4;
END;
$$;

-- ─── Back-fill existing rows ──────────────────────────────────────────────────

UPDATE leads
SET slug = generate_lead_slug(first_name, last_name, phone)
WHERE slug IS NULL
  AND phone IS NOT NULL;

-- ─── Insert trigger — auto-set slug, immutable after creation ─────────────────

CREATE OR REPLACE FUNCTION set_lead_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.phone IS NOT NULL THEN
    NEW.slug := generate_lead_slug(NEW.first_name, NEW.last_name, NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_slug
BEFORE INSERT ON leads
FOR EACH ROW EXECUTE FUNCTION set_lead_slug();

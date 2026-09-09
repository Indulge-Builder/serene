-- Migration 0182: public.vendors — the vendor identity SPINE + vendor_capabilities.
--
-- The one row per vendor (a supplier the concierge / shop floor books work with)
-- that every other vendor table and the Sia WhatsApp hooks finally point at:
-- sia.wag_groups.vendor_id / sia.wag_contacts.vendor_id (the 0169 soft hooks,
-- wired here), and the ledger layer (0184: engagements / reviews / preferences)
-- which hangs OFF this table — never lives in it.
--
-- Built the 0181 clients way: a thin identity spine + `import_raw` provenance.
-- PR #3's computed Freshdesk row (ticket_categories / service_cities / agents /
-- invoices / times_used / first_used / last_used / invoice_count) lands in
-- `import_raw` UNTOUCHED as the audit trail of the import; nothing ranks on it
-- once vendor_engagements (0184) are loaded. Anything that does not parse
-- cleanly stays NULL in a typed column and survives inside import_raw.
--
-- Speed / quality / pricing / reliability are NOT columns here: they are
-- manually entered per review (vendor_reviews, 0184) and the score is COMPUTED
-- per read (the subscriptions status pattern) — never stored on the spine.
--
-- Numbered 0182: 0179 (Elaya brain switch) / 0180 (shop product enquiries) /
-- 0181 (clients spine) are taken and applied on prod. The Supabase CLI matches
-- on the version number, so a file reusing a taken number is SILENTLY SKIPPED.
--
-- NOT APPLIED. Runs through the normal deployment process, never directly
-- against production.

-- Repo convention (0098/0110/0166): extensions live in `extensions`, not public.
-- 0098 already installed pg_trgm there, so this is a no-op on prod; the schema
-- pin keeps a fresh database identical to prod.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- vendors — the spine
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.vendors (
  -- uuid, not bigint: Sia 0169 reserved `vendor_id uuid` on sia.wag_groups /
  -- sia.wag_contacts for this table; 43 of 46 tables here use `id uuid`.
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  name              text        NOT NULL,
  -- The dedup identity (the subscription_tools 0168 pattern): one row per
  -- vendor regardless of casing / stray whitespace. Rerunning the loader upserts
  -- on this key instead of minting a duplicate.
  name_key          text        GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  -- Spelling variants seen in tickets, so a search for "Shamsher" still finds
  -- LuxDrovia after the two were merged.
  aliases           text[]      NOT NULL DEFAULT '{}',

  -- What the vendor SELLS. A SERVICE_CATEGORY slug (lib/constants/interests.ts)
  -- where the import could map one, else the raw Freshdesk label — free text by
  -- design, so an unmapped label is kept rather than rejected. Where it has been
  -- used lives in vendor_engagements; what it offers in vendor_capabilities.
  category          text,
  subcategory       text,
  -- How the vendor's category was decided. `rule` / `ticket-category` are the
  -- import's own derivations, `hand` a human label, `unresolved` an honest
  -- "we could not tell from what was written", and `client-excluded` a row
  -- kept for provenance that is not a supplier at all. All five come out of
  -- the Freshdesk extraction; the vocabulary mirrors VENDOR_CATEGORY_SOURCES.
  category_source   text        CHECK (category_source IN ('hand', 'rule', 'ticket-category', 'unresolved', 'client-excluded')),

  -- paused = do not suggest for now; blacklisted = never suggest (the ranker
  -- hard-excludes both and the details read says why). Vendors are never
  -- hard-deleted once they carry history — 0184's ledger FKs RESTRICT it.
  status            text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'blacklisted')),

  -- One entry per PERSON, each holding their own numbers:
  --   [{"name":"Abdul","phones":["+917045829809"],"emails":[]},
  --    {"name":null,"phones":["+919654106784"],"emails":["support@…"]}]
  -- A null name is deliberate: the vendor's general lines, never tied to a
  -- person. Phones are E.164 (Rule 06 — normalizeToE164() in the loader and the
  -- Zod schema). Kept as jsonb because the shape is per-person and dynamic;
  -- the array CHECK (0023 precedent) is what a scalar or bare object would
  -- otherwise silently pass.
  contacts          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- E.164, nullable. THE join key Sia uses to match a WhatsApp contact to a
  -- vendor (the clients.primary_phone posture, but NOT unique — two vendor
  -- desks can share a switchboard).
  primary_phone     text,
  -- Where the vendor is based. Cities SERVED come from capabilities and
  -- engagements, not from here.
  home_city         text,

  -- 'verified' only after a human confirms the merged identity; imports are
  -- born 'unverified' (the 0181 clients semantics).
  identity_status   text        NOT NULL DEFAULT 'unverified'
    CHECK (identity_status IN ('unverified', 'verified')),
  -- External join key into the Freshdesk archive (the clients.freshdesk_contact_id
  -- posture) — NULL for vendors born in-app or via Sia.
  freshdesk_ref     text,
  -- Which systems have contributed to this row. The SAME vocabulary as
  -- vendor_engagements.source (VENDOR_SOURCES in lib/constants/vendors.ts).
  sources           text[]      NOT NULL DEFAULT '{}'
    CHECK (sources <@ ARRAY['freshdesk', 'sia', 'manual', 'ticket']::text[]),
  -- The raw source rows keyed by source — PR #3's computed row goes here whole.
  import_raw        jsonb       NOT NULL DEFAULT '{}'::jsonb,

  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vendors_name_key_unique      UNIQUE (name_key),
  CONSTRAINT vendors_contacts_is_array    CHECK (jsonb_typeof(contacts) = 'array'),
  CONSTRAINT vendors_import_raw_is_object CHECK (jsonb_typeof(import_raw) = 'object')
);

-- Opclass schema-qualified: pg_trgm lives in `extensions`, which is not on the
-- search_path in every context (0098 does exactly this for idx_leads_search_trgm).
CREATE INDEX idx_vendors_name_trgm ON public.vendors USING gin (name extensions.gin_trgm_ops);
CREATE INDEX idx_vendors_aliases   ON public.vendors USING gin (aliases);
CREATE INDEX idx_vendors_category  ON public.vendors (category);
CREATE INDEX idx_vendors_status    ON public.vendors (status);
CREATE INDEX idx_vendors_primary_phone ON public.vendors (primary_phone)
  WHERE primary_phone IS NOT NULL;
CREATE INDEX idx_vendors_freshdesk ON public.vendors (freshdesk_ref)
  WHERE freshdesk_ref IS NOT NULL;

-- Reuse the shared helper from migration 0001 (rule: never recreate it).
CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.vendors IS
  'The vendor identity spine (one row per supplier). Identity + contacts + status only — '
  'what it offers lives in vendor_capabilities, every job in vendor_engagements, ratings in '
  'vendor_reviews (0184); raw import rows in import_raw. Scores are computed per read, never '
  'stored here. Reads admin/founder; writes service-role only (actions/vendors.ts is the gate).';
COMMENT ON COLUMN public.vendors.contacts IS
  'Per-person contacts [{name|null, phones[] (E.164), emails[]}]; a null name holds the vendor general lines.';
COMMENT ON COLUMN public.vendors.import_raw IS
  'Raw source rows keyed by source (PR #3 Freshdesk computed row lives here whole). Audit trail only — nothing ranks on it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- vendor_capabilities — what a vendor offers / refuses, per category (+ service)
-- ─────────────────────────────────────────────────────────────────────────────
-- `declines` is how "this vendor does not want these tickets" is recorded; the
-- ranker hard-excludes it. Editable config (NOT a ledger): agents refine this
-- constantly as they work with vendors, so it carries updated_at + set_by.
CREATE TABLE public.vendor_capabilities (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  -- SERVICE_CATEGORY slug or the domain vocabulary (getDomainInterests).
  category    text        NOT NULL,
  -- The finer service inside the category (visa / hotel / chauffeur …); NULL =
  -- the whole category. Vocabulary = VENDOR_SERVICES (lib/constants/vendors.ts),
  -- grown as we learn — deliberately no SQL CHECK so growing it is not a migration.
  service     text,
  stance      text        NOT NULL CHECK (stance IN ('offers', 'declines')),
  -- Where this capability applies. Empty = anywhere. Lower-cased by the writer.
  cities      text[]      NOT NULL DEFAULT '{}',
  note        text,
  -- NULL when seeded by the import.
  set_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per (vendor, category, service) — a vendor cannot both offer and
-- decline the same thing; COALESCE so NULL service ("whole category") is one
-- key, not infinitely many (UNIQUE treats NULLs as distinct).
CREATE UNIQUE INDEX idx_vendor_capabilities_key
  ON public.vendor_capabilities (vendor_id, category, COALESCE(service, ''));
-- The ranker's candidate lookup: category (+ service) + stance → vendor ids.
CREATE INDEX idx_vendor_capabilities_lookup
  ON public.vendor_capabilities (category, stance, service);
CREATE INDEX idx_vendor_capabilities_cities
  ON public.vendor_capabilities USING gin (cities);

CREATE TRIGGER vendor_capabilities_updated_at
  BEFORE UPDATE ON public.vendor_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.vendor_capabilities IS
  'What a vendor offers / declines per category (+ optional service, + cities). Editable config, '
  'one row per (vendor, category, service). declines rows only ever come from a human.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — admin/founder SELECT only (the 0181 clients posture; the concierge /
-- shop floor gets access with the Sia UI, as its own migration). No user
-- write policies anywhere: writes are service-role only via actions/vendors.ts
-- (requireProfile is the trust boundary) and the import scripts.
-- InitPlan-hoisted `(SELECT get_user_role())` per 0088.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_capabilities  ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_select_admin ON public.vendors
  FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

CREATE POLICY vendor_capabilities_select_admin ON public.vendor_capabilities
  FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

-- ─────────────────────────────────────────────────────────────────────────────
-- The 0169 soft hooks become real now that the target exists (the 0181 way).
-- ON DELETE SET NULL: losing a vendor row must never delete the WhatsApp group
-- or contact that pointed at it.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sia.wag_groups
  ADD CONSTRAINT wag_groups_vendor_fk
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;

ALTER TABLE sia.wag_contacts
  ADD CONSTRAINT wag_contacts_vendor_fk
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;

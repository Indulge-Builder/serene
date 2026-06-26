-- Migration 0150: elaya_training_assets + the public 'elaya-training' storage bucket
--
-- Block 2 of the customer welcome-blast feature (docs/modules/customer-welcome-blast.md).
-- Elaya's curated customer-training library — the brand/media/reference material she may
-- surface or send to a customer (brochures, work examples, testimonials, reviews,
-- podcasts, images, videos, docs, standalone facts, external links) PLUS a free-text
-- company-facts brief (a kind='fact' row).
--
-- EDITABLE config/content table (NOT append-only, so NOT A-11): carries updated_at +
-- the shared update_updated_at() trigger + UPDATE/DELETE policies — the ad_creatives
-- (0012) / ad_spend_daily (0104) posture. An asset is a correctable record.
--
-- url          = an external/public link (hosted brochure, YouTube video, a 'url' kind).
-- storage_path = an object PATH in the PUBLIC 'elaya-training' bucket (never a full url).
-- The app mints the public url from the path on read via getPublicUrl (public bucket,
-- so a plain public url, NOT a signed url). At most one source per asset; both nullable
-- so an asset can be link-only, upload-only, or text-only (a 'fact').
--
-- WRITE GATE (locked decision): manager / admin / founder (managers curate their
-- domain's library). Two-layer A-09: RLS here + the role-gated action. READ is
-- all-authenticated (every staff Elaya turn resolves assets). Bucket is PUBLIC so
-- Gupshup can fetch a sent media url with no signing step.

-- ───────────────────────────── 1. Table ─────────────────────────────
CREATE TABLE IF NOT EXISTS elaya_training_assets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text        NOT NULL,
  title         text        NOT NULL,
  description   text,                              -- the 'fact' kind stores the brief body here
  url           text,
  storage_path  text,
  tags          text[]      NOT NULL DEFAULT '{}',
  domain        app_domain,                        -- NULL = applies to every domain
  send_order    integer     NOT NULL DEFAULT 0,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- kind whitelist — the SQL mirror of TRAINING_ASSET_KINDS in
  -- lib/constants/elaya-training.ts. Extend = DROP+re-ADD this CHECK + one {id,label}
  -- line in that constant (the themes/app_icon precedent). The 10 ids below MUST match
  -- that file byte-for-byte.
  CONSTRAINT elaya_training_assets_kind_check
    CHECK (kind IN (
      'brochure',
      'work_example',
      'testimonial',
      'review',
      'podcast',
      'image',
      'video',
      'doc',
      'fact',
      'url'
    ))
);

-- updated_at maintained by the shared trigger fn (migration 0001 — NEVER recreate it).
CREATE TRIGGER set_elaya_training_assets_updated_at
  BEFORE UPDATE ON elaya_training_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes: domain scope, the active filter, and send-order ranking (the blast read).
CREATE INDEX idx_elaya_training_assets_domain     ON elaya_training_assets (domain);
CREATE INDEX idx_elaya_training_assets_active     ON elaya_training_assets (active);
CREATE INDEX idx_elaya_training_assets_send_order ON elaya_training_assets (send_order);

-- ───────────────────── 2. RLS — read all-auth; write manager+ (A-08) ─────────────────────
ALTER TABLE elaya_training_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY elaya_training_assets_select_authenticated
  ON elaya_training_assets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY elaya_training_assets_insert_manager_up
  ON elaya_training_assets FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_user_role()) IN ('manager', 'admin', 'founder'));

CREATE POLICY elaya_training_assets_update_manager_up
  ON elaya_training_assets FOR UPDATE TO authenticated
  USING      ((SELECT get_user_role()) IN ('manager', 'admin', 'founder'))
  WITH CHECK ((SELECT get_user_role()) IN ('manager', 'admin', 'founder'));

CREATE POLICY elaya_training_assets_delete_manager_up
  ON elaya_training_assets FOR DELETE TO authenticated
  USING ((SELECT get_user_role()) IN ('manager', 'admin', 'founder'));

-- ──────────── 3. Storage — public 'elaya-training' bucket + storage.objects RLS ────────────
insert into storage.buckets (id, name, public)
values ('elaya-training', 'elaya-training', true)   -- PUBLIC — public read
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase. Policies are idempotent.
drop policy if exists "elaya_training_public_read"  on storage.objects;
drop policy if exists "elaya_training_insert_staff" on storage.objects;
drop policy if exists "elaya_training_update_staff" on storage.objects;
drop policy if exists "elaya_training_delete_staff" on storage.objects;

-- Public read — NO `TO authenticated`, so anon + authenticated both read (public bucket).
create policy "elaya_training_public_read" on storage.objects
  for select
  using (bucket_id = 'elaya-training');

create policy "elaya_training_insert_staff" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'elaya-training'
    and (select get_user_role()) in ('manager', 'admin', 'founder')
  );

create policy "elaya_training_update_staff" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'elaya-training'
    and (select get_user_role()) in ('manager', 'admin', 'founder')
  )
  with check (
    bucket_id = 'elaya-training'
    and (select get_user_role()) in ('manager', 'admin', 'founder')
  );

create policy "elaya_training_delete_staff" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'elaya-training'
    and (select get_user_role()) in ('manager', 'admin', 'founder')
  );

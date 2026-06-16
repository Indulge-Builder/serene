-- Migration 0135: Suggestions screenshot bucket (PRIVATE)
--
-- Holds the screenshots attached to suggestion / bug reports (migration 0134).
-- Unlike `avatars`/`ad-creatives` (public), this bucket is PRIVATE — reports can
-- contain sensitive screens, so there is NO public-read policy. Admin viewing
-- mints short-lived signed URLs server-side (createSignedUrl in
-- suggestions-service); the suggestions row stores PATHS, never URLs.
--
-- Object path convention: `${sender_id}/${draftId}/${i}-${filename}`. The first
-- folder segment is the uploader's uid — the insert policy pins writes to the
-- caller's own prefix, and the action re-checks the same prefix (defence in depth
-- against a client claiming another user's object path).

insert into storage.buckets (id, name, public)
values ('suggestions', 'suggestions', false)         -- PRIVATE — no public read
on conflict (id) do nothing;

-- RLS is already enabled on storage.objects by Supabase. Policies are idempotent.

drop policy if exists "suggestions_storage_insert_own"   on storage.objects;
drop policy if exists "suggestions_storage_read_own"     on storage.objects;
drop policy if exists "suggestions_storage_read_admin"   on storage.objects;

-- Authenticated users write only under their own uid/ prefix.
create policy "suggestions_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'suggestions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Sender can read their own objects.
create policy "suggestions_storage_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'suggestions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Admin/founder read all objects (backs createSignedUrl on the session client
-- for the triage inbox). InitPlan-hoisted get_user_role() per 0088.
create policy "suggestions_storage_read_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'suggestions'
    and (select get_user_role()) in ('admin', 'founder')
  );

-- No UPDATE/DELETE policies — screenshots are write-once.

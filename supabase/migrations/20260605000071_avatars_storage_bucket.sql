-- Avatars bucket: public read, authenticated write scoped to the user's own object.
-- Object name == profile.id (matches ProfileAvatarSection upload(profile.id, ...)).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS is already enabled on storage.objects by Supabase. Policies are idempotent.

drop policy if exists "avatars_public_read"  on storage.objects;
drop policy if exists "avatars_insert_own"   on storage.objects;
drop policy if exists "avatars_update_own"   on storage.objects;
drop policy if exists "avatars_delete_own"   on storage.objects;

create policy "avatars_public_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text);

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text)
  with check (bucket_id = 'avatars' and name = auth.uid()::text);

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text);

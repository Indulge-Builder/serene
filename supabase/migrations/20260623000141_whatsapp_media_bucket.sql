-- Migration 0141: WhatsApp media bucket (PRIVATE)
--
-- Holds inbound (and later outbound) WhatsApp media — image/video/document/audio
-- (Phase C inbound-media work, 2026-06-23). Gupshup delivers media as a direct,
-- TIME-LIMITED CDN url; storing that url means old media 404s once the link
-- expires. The ingestion path downloads the bytes server-side and re-uploads them
-- here, then stores the resulting STORAGE PATH (never a url) in
-- whatsapp_messages.media_url. Reads mint short-lived signed urls server-side.
--
-- PRIVATE — like `suggestions` (0135), not `avatars`/`ad-creatives`: lead
-- conversations can be sensitive, so there is NO public-read policy.
--
-- Object path convention: `${leadId}/${messageId}.${ext}`. The leadId prefix
-- keeps a conversation's media grouped and lets a future per-lead cleanup target
-- one prefix.
--
-- Writes + reads both run through the ADMIN (service-role) client: the inbound
-- webhook has no session (admin upload), and signed-url minting on read also uses
-- the admin client (the page/action role gate is the trust boundary, mirroring
-- the whatsapp_messages RLS posture). The admin client bypasses RLS, so no
-- authenticated INSERT/SELECT policy is needed. We add a single defence-in-depth
-- admin/founder SELECT policy so a direct session-client read (if ever used) is
-- scoped, and deliberately omit any broad authenticated read.

insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)        -- PRIVATE — no public read
on conflict (id) do nothing;

-- RLS is already enabled on storage.objects by Supabase. Policies are idempotent.

drop policy if exists "wa_media_storage_read_admin" on storage.objects;

-- Admin/founder may read directly (defence in depth — primary read path is the
-- admin client minting signed urls, which bypasses RLS). InitPlan-hoisted
-- get_user_role() per 0088. No authenticated INSERT/UPDATE/DELETE policies —
-- all writes are service-role (the webhook + outbound action use the admin client).
create policy "wa_media_storage_read_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (select get_user_role()) in ('admin', 'founder')
  );

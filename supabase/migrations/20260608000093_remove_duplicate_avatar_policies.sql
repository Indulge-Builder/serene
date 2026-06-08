-- Remove duplicate avatar storage policies (quoted-name variants from dashboard setup).
-- Canonical set from migration 0071: avatars_public_read, avatars_insert_own,
-- avatars_update_own, avatars_delete_own.

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;

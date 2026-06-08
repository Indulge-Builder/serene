-- ad-creatives storage bucket: restrict INSERT/DELETE to admin and founder.
-- Matches ad_creatives table RLS (migration 0012). SELECT unchanged — public bucket
-- read for campaign/lead dossier surfaces; no SELECT policy added here.

DROP POLICY IF EXISTS "Ad Creative Modal delete" ON storage.objects;
DROP POLICY IF EXISTS "Ad Creative Modal insert" ON storage.objects;

CREATE POLICY "ad_creatives_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ad-creatives'
    AND (
      SELECT role FROM public.profiles WHERE id = auth.uid()
    ) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

CREATE POLICY "ad_creatives_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ad-creatives'
    AND (
      SELECT role FROM public.profiles WHERE id = auth.uid()
    ) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])
  );

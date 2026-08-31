-- The private `vendor-invoices` bucket that holds the vendor invoice PDFs whose
-- paths are stored in public.vendors.invoices[].storage_path (migration 0179).
--
-- Provisioned HERE, not by hand in the dashboard: a bucket carries its own access
-- rules (RLS on storage.objects), and a hand-made one exists in exactly one project
-- with its policies invisible to review, absent from a fresh environment, and one
-- misclick away from being public.
--
-- Write posture follows whatsapp-media (0141), NOT subscription-invoices (0163):
-- 0163 gates uploads on a `{uid}/` path prefix, but vendor invoice paths are FLAT
-- (keyed on the globally-unique attachment_id, e.g. '1070049291938.pdf'), so a
-- prefix policy is unsatisfiable. It is also unnecessary - the bulk load and every
-- later write run on the admin client, and service-role bypasses RLS.
--
-- Numbered 0183, paired with the 0182 spine (0179/0180/0181 are taken and
-- applied on prod; a file reusing a taken version number is silently skipped).
--
-- NOT APPLIED. Run through the normal deployment process, never directly
-- against production.

-- private: invoice PDFs carry pricing and commercial terms, never world-readable.
-- File-type and size limits are enforced at the application layer.
insert into storage.buckets (id, name, public)
values ('vendor-invoices', 'vendor-invoices', false)
on conflict (id) do nothing;

drop policy if exists "vendor_invoices_read_authenticated" on storage.objects;

-- Read is open to every signed-in user, matching public.vendors itself (0179):
-- the invoice belongs to the vendor row, so splitting the audience would leave a
-- visible row with an unopenable file. Defence in depth only - the app reads via
-- admin-client signed urls, which bypass RLS.
create policy "vendor_invoices_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'vendor-invoices');

-- No INSERT / UPDATE / DELETE policies, deliberately: writes are service-role only.

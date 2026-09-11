-- Migration 0184: the private `vendor-invoices` bucket.
--
-- Holds the vendor invoice PDFs whose paths are stored on the ledger —
-- public.vendor_engagements.invoice_paths[] (0185): every invoice from the
-- Freshdesk archive becomes a path on its ticket's engagement, so the ~1 GB
-- upload is fully referenced instead of "newest 5 per vendor".
--
-- Provisioned HERE, not by hand in the dashboard: a bucket carries its own access
-- rules (RLS on storage.objects), and a hand-made one exists in exactly one project
-- with its policies invisible to review, absent from a fresh environment, and one
-- misclick away from being public.
--
-- Write posture follows whatsapp-media (0141), NOT subscription-invoices (0163):
-- 0163 gates uploads on a `{uid}/` path prefix, but vendor invoice paths are FLAT
-- (keyed on the globally-unique Freshdesk attachment_id, e.g. '1070049291938.pdf'),
-- so a prefix policy is unsatisfiable. It is also unnecessary — the bulk load and
-- every later write run on the admin client, and service-role bypasses RLS.
--
-- Numbered 0184, paired with the 0183 spine (0179/0180/0181 are taken and
-- applied on prod; a file reusing a taken version number is silently skipped).
--
-- NOT APPLIED. Runs through the normal deployment process, never directly
-- against production.

-- private: invoice PDFs carry pricing and commercial terms, never world-readable.
-- File-type and size limits are enforced at the application layer.
insert into storage.buckets (id, name, public)
values ('vendor-invoices', 'vendor-invoices', false)
on conflict (id) do nothing;

drop policy if exists "vendor_invoices_read_authenticated" on storage.objects;
drop policy if exists "vendor_invoices_read_admin" on storage.objects;

-- Read narrows to the vendor audience — admin/founder, exactly the SELECT
-- policy on public.vendors / vendor_engagements (0183/0185): the invoice belongs
-- to the engagement row, so the two audiences must match or a visible row would
-- carry an unopenable file. Defence in depth only — the app reads via
-- admin-client signed urls (signVendorInvoiceAction), which bypass RLS.
-- InitPlan-hoisted `(select get_user_role())` per 0088.
create policy "vendor_invoices_read_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vendor-invoices'
    and (select get_user_role()) in ('admin', 'founder')
  );

-- No INSERT / UPDATE / DELETE policies, deliberately: writes are service-role only.

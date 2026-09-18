-- 0221 — The vendor module opens to the concierge floor.
--
-- Why: vendors were admin/founder only while the module was being built (founder, 2026-09-12:
-- "admin/founder for now"). The people who actually pick, call and rate vendors are the
-- concierge team, and tickets now carry a vendor (ticket-vendor.ts). Founder, 2026-09-18:
-- everyone in the concierge domain sees the vendor pages, adds notes and uses every feature.
--
-- What: ONE predicate, public.can_access_vendors(): admin, founder, or anyone whose domain is
-- concierge. The six vendor SELECT policies and the invoice bucket's read policy are re-declared
-- on it, so the next change of audience is this function and nothing else. The app reads and
-- writes vendors through the admin client behind its own gate (hasVendorAccess in
-- route-access.ts, the mirror of this function); these policies are the defence in depth.
-- Writes stay service role only, as before. InitPlan-hoisted `(select …)` per 0088.

CREATE OR REPLACE FUNCTION public.can_access_vendors()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active
      AND (p.role IN ('admin', 'founder') OR p.domain = 'concierge')
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_vendors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_vendors() TO authenticated, service_role;

DROP POLICY IF EXISTS vendors_select_admin ON public.vendors;
CREATE POLICY vendors_select ON public.vendors FOR SELECT TO authenticated USING ((SELECT public.can_access_vendors()));

DROP POLICY IF EXISTS vendor_capabilities_select_admin ON public.vendor_capabilities;
CREATE POLICY vendor_capabilities_select ON public.vendor_capabilities FOR SELECT TO authenticated USING ((SELECT public.can_access_vendors()));

DROP POLICY IF EXISTS vendor_engagements_select_admin ON public.vendor_engagements;
CREATE POLICY vendor_engagements_select ON public.vendor_engagements FOR SELECT TO authenticated USING ((SELECT public.can_access_vendors()));

DROP POLICY IF EXISTS vendor_reviews_select_admin ON public.vendor_reviews;
CREATE POLICY vendor_reviews_select ON public.vendor_reviews FOR SELECT TO authenticated USING ((SELECT public.can_access_vendors()));

DROP POLICY IF EXISTS vendor_notes_select_admin ON public.vendor_notes;
CREATE POLICY vendor_notes_select ON public.vendor_notes FOR SELECT TO authenticated USING ((SELECT public.can_access_vendors()));

DROP POLICY IF EXISTS vendor_agent_preferences_select_admin ON public.vendor_agent_preferences;
CREATE POLICY vendor_agent_preferences_select ON public.vendor_agent_preferences FOR SELECT TO authenticated USING ((SELECT public.can_access_vendors()));

DROP POLICY IF EXISTS "vendor_invoices_read_admin" ON storage.objects;
CREATE POLICY "vendor_invoices_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-invoices' AND (SELECT public.can_access_vendors()));

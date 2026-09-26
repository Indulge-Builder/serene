-- 0243: a teammate cannot change their own seat or queendom.
--
-- Why: profiles_update (latest definition 0095) lets a person update their own row as long as
-- role and domain stay the same. sia_role and queendom_id were never pinned, so anyone in the
-- concierge domain could move themselves into another queendom, and so see its members (the
-- vault included), tickets, WhatsApp groups and Freshdesk group, or give themselves a seat,
-- straight through the database API with their own session. Found 2026-09-26 while planning the
-- Joker head, a company-wide seat that must never be self-assigned. Seats are changed only by
-- admin and founder, on the Authorization card.
--
-- What: the same policy, with sia_role and queendom_id pinned on the self branch exactly the
-- way role and domain already are (the subquery reads the row as it was before the update).
-- IS NOT DISTINCT FROM, because both are NULL on every account outside concierge and an
-- unchanged NULL must still pass. The admin/founder branch and the USING clause are unchanged.
-- No app path is affected: the profile page never writes these two fields, and every seat
-- write runs as admin/founder or through the service role.

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  USING (
    (auth.uid() = id)
    OR (SELECT public.get_user_role()) = ANY (
      ARRAY['admin'::public.user_role, 'founder'::public.user_role]
    )
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = ANY (
      ARRAY['admin'::public.user_role, 'founder'::public.user_role]
    )
    OR (
      auth.uid() = id
      AND role = (
        SELECT profiles_1.role FROM public.profiles profiles_1
        WHERE profiles_1.id = auth.uid()
      )
      AND domain = (
        SELECT profiles_1.domain FROM public.profiles profiles_1
        WHERE profiles_1.id = auth.uid()
      )
      AND sia_role IS NOT DISTINCT FROM (
        SELECT profiles_1.sia_role FROM public.profiles profiles_1
        WHERE profiles_1.id = auth.uid()
      )
      AND queendom_id IS NOT DISTINCT FROM (
        SELECT profiles_1.queendom_id FROM public.profiles profiles_1
        WHERE profiles_1.id = auth.uid()
      )
    )
  );

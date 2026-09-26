-- 0244: the Joker head, one company-wide seat above the queendoms.
--
-- Why: the concierge floor has one Joker head who works every queendom's members, their WhatsApp
-- groups and their tickets the way a queen works hers, without being admin or founder. Decided
-- 2026-09-26: the reach of a queen in every queendom; the vault as a list only (no reveal, no add);
-- no members' money; no ticket alerts. The app enforces those three limits (lib/elaya/access.ts:
-- canUseMemberVault, canSeeMemberFinance; the alert recipients are per queendom seat), this
-- migration gives the reach. Until now a position always named exactly one queendom.
--
-- What:
--   1. 'joker_head' joins the allowed sia_role values. 0194 wrote that list as an inline CHECK
--      with a generated name, so it is found by what it says and re-added under a stable name.
--   2. profiles_sia_role_needs_queendom: every position names its queendom EXCEPT the Joker head,
--      who never has one.
--   3. One active Joker head in the whole company. The idx_profiles_one_ prefix makes the app read
--      a clash as "That seat already has an active holder", as it does for the queen and joker.
--   4. can_access_member_queendom(): an active concierge Joker head passes for every queendom.
--      The NULL guard stays, so a member or a ticket with no queendom is still admin/founder
--      only. Every member, Sia ticket and intake policy calls this one function, so no policy
--      text changes. The search_path is the one 0210/0211 gave it.
--
-- The seat is keyed on sia_role, never on a NULL queendom_id: every account outside concierge has
-- a NULL queendom, and a concierge account nobody has seated must keep seeing nothing.
-- Apply together with 0243 (nobody changes their own seat): without it a concierge account could
-- make itself the Joker head through the database API while the seat is empty.

-- 1. The allowed values (idempotent: a re-run drops the stable-named CHECK too, then re-adds it).
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%sia_role%'
      AND pg_get_constraintdef(oid) NOT LIKE '%queendom_id%'
      AND pg_get_constraintdef(oid) NOT LIKE '%domain%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c);
  END LOOP;
END
$$;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_sia_role_values
  CHECK (sia_role IN ('queen', 'bishop', 'genie', 'joker', 'joker_head'));

-- 2. A position names its queendom, except the company-wide seat, which never has one.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sia_role_needs_queendom;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_sia_role_needs_queendom
  CHECK (sia_role IS NULL OR ((sia_role = 'joker_head') = (queendom_id IS NULL)));

-- 3. One active Joker head (a deactivated one must not block naming the next).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_one_joker_head
  ON public.profiles (sia_role) WHERE sia_role = 'joker_head' AND is_active;

-- 4. The gate: the 0202 body plus the Joker head.
CREATE OR REPLACE FUNCTION public.can_access_member_queendom(p_queendom uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, gia, member AS $$
  SELECT get_user_role() IN ('admin', 'founder')
      OR (p_queendom IS NOT NULL AND (
            p_queendom = get_user_queendom()
         OR EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid()
                AND p.is_active
                AND p.domain = 'concierge'
                AND p.sia_role = 'joker_head')));
$$;
REVOKE ALL ON FUNCTION public.can_access_member_queendom(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_member_queendom(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_member_queendom(uuid) IS
  'May the caller reach this queendom? admin/founder: any; a seated concierge teammate: their own; the active concierge Joker head (0244): any queendom. NULL queendom: admin/founder only. The TS twins: canAccessMember (lib/elaya/access.ts) and getSiaViewerScope (sia-access.ts).';

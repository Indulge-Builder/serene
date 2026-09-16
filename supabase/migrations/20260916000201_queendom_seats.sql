-- 0201 — Queendom seats: one truth for "who holds which seat", and the roster fields
-- on the profile become the way a Concierge account is created.
--
-- Why: 0194 gave every profile a queendom + a Sia role AND gave sia.queendoms three seat
-- columns (queen_id / bishop_id / joker_id). Two places for one fact drift, and nothing ever
-- wrote the seat columns (verified: all NULL, no reader in src/ or scripts/). The profile row
-- is the truth; a seat holder is derived (profiles WHERE queendom_id = X AND sia_role = 'queen').
-- Decided with the founder 2026-09-16: queendom + Sia role are a nullable layer ON TOP of the
-- platform role — Tech / Finance / Onboarding / Shop simply leave them empty.
--
-- What:
--   1. drop the three seat columns from sia.queendoms
--   2. CHECKs on profiles: the two Sia fields only in the concierge domain; a Sia role always
--      names its queendom
--   3. one holder per single seat (queen / bishop / joker) per queendom — genies are many
--   4. handle_new_user() also copies sia_role + queendom_id from the signup metadata, so an
--      invite lands with its seat in one transaction (the 0125 job_title pattern)

ALTER TABLE sia.queendoms
  DROP COLUMN IF EXISTS queen_id,
  DROP COLUMN IF EXISTS bishop_id,
  DROP COLUMN IF EXISTS joker_id;

-- Sia fields belong to the concierge domain only. Idempotent (drop-then-add).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sia_fields_concierge_only;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_sia_fields_concierge_only
  CHECK ((sia_role IS NULL AND queendom_id IS NULL) OR domain = 'concierge');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_sia_role_needs_queendom;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_sia_role_needs_queendom
  CHECK (sia_role IS NULL OR queendom_id IS NOT NULL);

-- One queen, one bishop, one joker per queendom (active accounts only — a deactivated queen
-- must not block naming her successor).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_one_queen_per_queendom
  ON public.profiles (queendom_id) WHERE sia_role = 'queen' AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_one_bishop_per_queendom
  ON public.profiles (queendom_id) WHERE sia_role = 'bishop' AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_one_joker_per_queendom
  ON public.profiles (queendom_id) WHERE sia_role = 'joker' AND is_active;

-- The signup trigger: body identical to 0125 plus the two Sia fields. Bad metadata is
-- impossible in practice (the actions Zod-validate first); a stray value still fails the
-- INSERT loudly rather than creating a half-set profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, domain, job_title, sia_role, queendom_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'agent'::user_role
    ),
    COALESCE(
      (NEW.raw_user_meta_data->>'domain')::app_domain,
      'concierge'::app_domain
    ),
    NULLIF(NEW.raw_user_meta_data->>'job_title', ''),
    NULLIF(NEW.raw_user_meta_data->>'sia_role', ''),
    NULLIF(NEW.raw_user_meta_data->>'queendom_id', '')::uuid
  );
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.profiles.sia_role IS
  'The Concierge position (queen | bishop | genie | joker). NULL outside the concierge domain. The seat holders of a queendom are derived from this column — there is no other record of them.';
COMMENT ON COLUMN public.profiles.queendom_id IS
  'The queendom this Concierge account works in. NULL outside the concierge domain; required when sia_role is set.';

-- ─────────────────────────────────────────────────────────
-- handle_new_user(): also persist job_title from invite metadata
-- ─────────────────────────────────────────────────────────
-- The invite flow (inviteUserByEmail) stores full_name / role / domain /
-- job_title in auth.users.raw_user_meta_data. The on-signup trigger only
-- copied the first three into public.profiles, silently dropping job_title for
-- every invited user. (The password-mode createUser path set job_title via a
-- follow-up updateProfileFields call, so only invites were affected.)
--
-- This adds job_title to the INSERT. It is nullable on profiles, so a NULL
-- (no job title supplied at invite time) is fine. Idempotent CREATE OR REPLACE;
-- the body is otherwise byte-identical to the original definition.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, domain, job_title)
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
    NULLIF(NEW.raw_user_meta_data->>'job_title', '')
  );
  RETURN NEW;
END;
$$;

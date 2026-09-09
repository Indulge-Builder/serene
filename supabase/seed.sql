-- LOCAL DEVELOPMENT ONLY. This file is run by the Supabase CLI after migrations
-- on `supabase start` / `supabase db reset`. It is NEVER run by `supabase db
-- push`, so nothing here can ever reach production.
--
-- WHY IT EXISTS
-- The local Postgres image ships hardened ALTER DEFAULT PRIVILEGES: a table
-- created by a migration (owner `postgres`) in schema `public` grants only
-- TRUNCATE / REFERENCES / TRIGGER / MAINTAIN to anon, authenticated and
-- service_role — no SELECT, INSERT, UPDATE or DELETE. Production was built
-- before that hardening and carries the full grants, which is why the app works
-- there and every query here failed with:
--
--   permission denied for table profiles
--
-- So this is purely a local-environment gap, not an application bug and not
-- something production needs. Re-stating the grants here makes the local
-- database match production's privilege model.
--
-- WHAT IS DELIBERATELY NOT GRANTED
-- FUNCTIONS. Postgres grants EXECUTE on functions to PUBLIC by default, and the
-- migrations that matter override that explicitly: the Q-13 "revoked tier" RPCs
-- (get_vendor_score_inputs, get_budget_summary, get_agent_usage, the oversight
-- RPCs …) REVOKE EXECUTE from PUBLIC/anon/authenticated so they are service-role
-- only. A blanket GRANT ON ALL FUNCTIONS would silently undo every one of those
-- revokes locally, and local would then pass tests that production would fail.
-- Never add a function grant to this file.
--
-- Row Level Security is untouched by any of this. These grants are the coarse
-- layer; the RLS policies in the migrations remain the actual access control,
-- exactly as on production. service_role bypasses RLS here just as it does on
-- Supabase, which is what the admin client relies on.

-- Existing objects (every table the migrations just created).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Anything created later in the same session (kept in step with the above).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

-- The Sia schema follows the same rule (its tables are service-role only, which
-- is how the migrations already scope them).
GRANT USAGE ON SCHEMA sia TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sia TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- A LOGIN.
--
-- `supabase db reset` truncates auth.users, and nothing else recreates it, so a
-- freshly reset database has ZERO profiles and no way to sign in — the app comes
-- up on /login with no valid credentials in existence. Everyone who resets hits
-- this, so the fix belongs here rather than in a script each person has to know
-- about.
--
-- The password is written with pgcrypto exactly as GoTrue writes it (bcrypt),
-- and the matching auth.identities row is what makes email/password sign-in
-- resolve. `handle_new_user` fires on the INSERT and builds the public.profiles
-- row from raw_user_meta_data, which is why role/domain are set there and not by
-- a follow-up UPDATE.
--
-- FOUNDER because that is the role with the widest surface (/vendors is
-- admin/founder only, per the 0182-0185 RLS) — a reset database should be able
-- to reach every page without a second account being made by hand.
--
-- Local only, by construction: this file is run by `supabase start` /
-- `supabase db reset` and is NEVER run by `supabase db push`, so this credential
-- cannot reach production. Guarded on NOT EXISTS so a re-run is a no-op and an
-- edited password is never silently reverted.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  uid uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'tech@indulge.global') THEN
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'tech@indulge.global', crypt('Serene@12345', gen_salt('bf')), now(),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ethan Alvares","role":"founder","domain":"concierge","job_title":"Tech"}'::jsonb,
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at
  ) VALUES (
    uid::text, uid,
    jsonb_build_object('sub', uid::text, 'email', 'tech@indulge.global',
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  RAISE NOTICE 'Seeded login: tech@indulge.global / Serene@12345 (founder)';
END
$$;

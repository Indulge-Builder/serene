-- Migration 0000: the two base enums — `user_role` and `app_domain`.
--
-- WHY THIS FILE EXISTS
-- Migration 0001 (`profiles`) uses `user_role` on its very first CREATE TABLE and
-- `app_domain` a few lines later, but NO migration in the history ever created
-- either type. On production they have always existed — they were created
-- out-of-band, before/outside the migration files (the same drift the
-- `docs/architecture/migrations.md` ledger note describes for 0065–0108). So
-- production has been correct all along and is completely unaffected by this
-- file; what was broken is the ability to build the schema FROM SCRATCH, which
-- is exactly what a local `supabase start` / `supabase db reset` does. Without
-- this file the very first migration fails with:
--
--   ERROR: type "user_role" does not exist (SQLSTATE 42704)
--
-- WHY A NEW FILE RATHER THAN AN EDIT TO 0001
-- Rule A-14: a migration that has run in production is never edited. The types
-- must exist BEFORE 0001 runs, and migrations apply in timestamp order, so the
-- fix has to be a file that sorts ahead of `20260526000001` — hence `...000000`.
--
-- SAFE ON PRODUCTION
-- Every statement is idempotent: if the type already exists (production, and any
-- local database built before this file landed) the DO block swallows the
-- duplicate and changes nothing. Applying this to production would create no
-- object and alter no data — it only records its ledger row.
--
-- VALUES AND ORDER ARE COPIED FROM PRODUCTION
-- Taken verbatim from the generated `src/lib/types/database.ts` `public.Enums`
-- block (which is generated from the live database), including the ORDER of the
-- labels — enum label order defines sort order, so it is part of the contract.
-- Never reorder these; a new value is added with ALTER TYPE in a new migration.

DO $$
BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'founder',
    'admin',
    'manager',
    'agent',
    'guest'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already present (production) — no-op
END
$$;

DO $$
BEGIN
  CREATE TYPE public.app_domain AS ENUM (
    'concierge',
    'onboarding',
    'finance',
    'marketing',
    'tech',
    'shop',
    'b2b',
    'house',
    'legacy'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already present (production) — no-op
END
$$;

COMMENT ON TYPE public.user_role IS
  'The authorization role axis (Rule 09 — authorization reads only from public.profiles).';
COMMENT ON TYPE public.app_domain IS
  'The business-domain axis. Gia domains (onboarding/shop/house/legacy) are the subset in GIA_DOMAINS.';

-- Migration 0156: retire the 'cosmos', 'coffee', and 'macha' themes.
--
-- Runs AFTER 0154 (added coffee) and 0155 (added macha/martini/candy) — both
-- authored earlier the same day and possibly never applied; the sequence is
-- kept append-only (A-14) rather than editing those files. Final vocabulary:
-- earth / air / water / fire / martini / candy — the SQL mirror of THEME_KEYS
-- in src/lib/constants/themes.ts (keep the two in sync).
--
-- ORDER IS LOAD-BEARING: any profile still on a retired theme must be moved
-- to the default BEFORE the narrowed CHECK is added, or the ALTER fails.
-- ('cosmos' has existed since Phase 5, so live rows are expected; 'coffee'/
-- 'macha' rows can only exist if 0154/0155 ran — handled all the same.)
--
-- No RLS change — theme is a cosmetic self-update field under the existing
-- profiles_update policy (0001). App side: a retired value in a stale cookie
-- or unregenerated cache fails isThemeKey() and falls back to DEFAULT_THEME.

UPDATE public.profiles
  SET theme = 'earth'
  WHERE theme IN ('cosmos', 'coffee', 'macha');

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_theme_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN ('earth', 'air', 'water', 'fire', 'martini', 'candy'));

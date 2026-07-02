-- Migration 0154: extend the profiles.theme CHECK with the new 'coffee' theme.
--
-- The theme CHECK (inline in migration 0001, autonamed profiles_theme_check)
-- is the SQL mirror of THEME_KEYS in src/lib/constants/themes.ts — keep the
-- two in sync (the app-icon 0121 note documents this precedent).
-- Coffee palette lives in src/styles/design-tokens.css ([data-theme="coffee"])
-- and docs/design/DESIGN-DNA.md (Theme 06).
--
-- No RLS change — theme is a cosmetic self-update field under the existing
-- profiles_update policy (0001), same posture as app_icon (0121).

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_theme_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN ('earth', 'air', 'water', 'fire', 'cosmos', 'coffee'));

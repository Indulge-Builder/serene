-- Migration 0155: extend the profiles.theme CHECK with the pastel trio —
-- 'macha', 'martini', 'candy' (themes 07–09, added 2026-07-02).
--
-- Same posture as 0154 (coffee) / 0121 (app_icon): the CHECK is the SQL
-- mirror of THEME_KEYS in src/lib/constants/themes.ts — keep the two in
-- sync. Palettes live in src/styles/design-tokens.css and
-- docs/design/DESIGN-DNA.md (Themes 07–09). No RLS change — theme is a
-- cosmetic self-update field under the existing profiles_update policy.

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_theme_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN (
    'earth', 'air', 'water', 'fire', 'cosmos',
    'coffee', 'macha', 'martini', 'candy'
  ));

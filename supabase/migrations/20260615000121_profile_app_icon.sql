-- Migration 0121: profiles.app_icon — the user's chosen PWA homescreen icon.
--
-- Mirrors profiles.theme exactly (migration 0001): an enum-validated text
-- column, NOT NULL with a default, persisted like any other preference. NO new
-- RLS — the existing profiles_update policy (0001) already lets a user write
-- their own non-authorization fields (theme/timezone/app_icon all qualify; the
-- WITH CHECK guard only protects role/domain). Self-update only, unchanged.
--
-- The CHECK list is the SQL mirror of ICON_KEYS in
-- src/lib/constants/app-icons.ts — keep the two in sync. When a new icon key
-- ships, a new migration must extend this CHECK (the theme CHECK precedent).

ALTER TABLE profiles
  ADD COLUMN app_icon text NOT NULL DEFAULT 'icon-1'
    CHECK (app_icon IN ('icon-1','icon-2','icon-3','icon-4'));

-- Not added to log_profile_changes() — app_icon is a cosmetic preference, the
-- same posture as theme/timezone (neither is audited). Intentional omission.

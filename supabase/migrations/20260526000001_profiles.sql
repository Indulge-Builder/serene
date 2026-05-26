-- Migration 0001: Profiles table, RLS, helper functions, triggers, audit log
-- The identity and authorization foundation of the entire system.

-- ─────────────────────────────────────────────────────────
-- Helper: update_updated_at()
-- Reusable trigger function for updated_at columns.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- profiles table
-- ─────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id                  uuid PRIMARY KEY
                      REFERENCES auth.users(id)
                      ON DELETE CASCADE,

  -- Identity
  full_name           text NOT NULL
                      CHECK (char_length(full_name) BETWEEN 1 AND 100),

  username            text UNIQUE
                      CHECK (char_length(username) BETWEEN 3 AND 30),

  email               text NOT NULL UNIQUE,

  phone               text,              -- E.164 format

  -- Avatar
  avatar_url          text
                      CHECK (char_length(avatar_url) < 500),

  -- Authorization — the two axes
  role                user_role NOT NULL DEFAULT 'agent',
  domain              app_domain NOT NULL DEFAULT 'concierge',

  -- Reporting structure
  job_title           text
                      CHECK (char_length(job_title) < 100),
  reports_to          uuid REFERENCES profiles(id)
                      ON DELETE SET NULL,

  -- Availability flags
  is_active           boolean NOT NULL DEFAULT true,
  is_on_leave         boolean NOT NULL DEFAULT false,

  -- Preferences
  theme               text NOT NULL DEFAULT 'earth'
                      CHECK (theme IN ('earth','air','water','fire','cosmos')),
  timezone            text NOT NULL DEFAULT 'Asia/Kolkata',

  -- Metadata
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role          ON profiles(role);
CREATE INDEX idx_profiles_domain        ON profiles(domain);
CREATE INDEX idx_profiles_domain_active ON profiles(domain) WHERE is_active = true;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────
-- Authorization helper functions
-- SECURITY DEFINER so they bypass RLS (breaks circular dep).
-- SET search_path prevents search path injection.
-- These are the only functions any RLS policy should call.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_domain()
RETURNS app_domain
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT domain FROM profiles WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────
-- RLS on profiles
-- ─────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all profiles
-- (needed for displaying assigned agents, reports_to, etc.)
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can update their own non-authorization fields.
-- Admins and founders can update anyone.
-- WITH CHECK blocks privilege escalation — users cannot write
-- a different role or domain onto any row (including their own).
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR get_user_role() IN ('admin', 'founder')
  )
  WITH CHECK (
    -- Non-admins cannot touch role or domain (even on their own row)
    (
      get_user_role() IN ('admin', 'founder')
    )
    OR
    (
      auth.uid() = id
      AND role    = (SELECT role   FROM profiles WHERE id = auth.uid())
      AND domain  = (SELECT domain FROM profiles WHERE id = auth.uid())
    )
  );

-- No direct INSERT from the application layer.
-- Profiles are created only by the on_auth_user_created trigger.
-- No DELETE policy — profiles are never deleted (soft-deactivate only).

-- ─────────────────────────────────────────────────────────
-- on_auth_user_created trigger
-- Fires when Supabase creates a new auth.users row.
-- Reads role and domain from raw_user_meta_data.
-- This is the ONLY way profiles rows are created.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, domain)
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
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────────────────
-- profile_audit_log table
-- Append-only. Tracks changes to identity and auth fields.
-- Required for SOC 2 / ISO 27001 compliance.
-- ─────────────────────────────────────────────────────────
CREATE TABLE profile_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id)
                ON DELETE RESTRICT,
  changed_by    uuid NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  field_name    text NOT NULL,
  old_value     text,
  new_value     text
);

ALTER TABLE profile_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select"
  ON profile_audit_log FOR SELECT
  USING (get_user_role() IN ('admin', 'founder'));

-- Audit log is written by trigger only — no app-layer INSERT policy.
-- No UPDATE, no DELETE — ever.

-- ─────────────────────────────────────────────────────────
-- Audit trigger on profiles
-- Logs changes to sensitive fields automatically.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _actor uuid;
BEGIN
  -- Use the authenticated user if present, otherwise attribute to the row itself
  -- (covers service-role writes, dashboard edits, and migration scripts).
  _actor := COALESCE(auth.uid(), NEW.id);

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO profile_audit_log (profile_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'role', OLD.role::text, NEW.role::text);
  END IF;

  IF OLD.domain IS DISTINCT FROM NEW.domain THEN
    INSERT INTO profile_audit_log (profile_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'domain', OLD.domain::text, NEW.domain::text);
  END IF;

  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO profile_audit_log (profile_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'is_active', OLD.is_active::text, NEW.is_active::text);
  END IF;

  IF OLD.is_on_leave IS DISTINCT FROM NEW.is_on_leave THEN
    INSERT INTO profile_audit_log (profile_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'is_on_leave', OLD.is_on_leave::text, NEW.is_on_leave::text);
  END IF;

  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    INSERT INTO profile_audit_log (profile_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'full_name', OLD.full_name, NEW.full_name);
  END IF;

  IF OLD.username IS DISTINCT FROM NEW.username THEN
    INSERT INTO profile_audit_log (profile_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'username', OLD.username, NEW.username);
  END IF;

  IF OLD.email IS DISTINCT FROM NEW.email THEN
    INSERT INTO profile_audit_log (profile_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'email', OLD.email, NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_audit
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_profile_changes();

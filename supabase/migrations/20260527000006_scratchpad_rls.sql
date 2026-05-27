-- Migration 0006: restrict private_scratchpad visibility at RLS level
-- Spec: private_scratchpad is visible only to the assigned agent, admin, and founder.
-- Managers have domain-wide lead access but must NOT see agent private notes.
--
-- Approach: replace the single manager SELECT policy with one that nullifies
-- private_scratchpad in the returned row for managers. Postgres does not support
-- column-level RLS directly, so we use a SECURITY DEFINER view that strips the
-- column for managers, and point the manager policy at that view.
--
-- Simpler alternative chosen: keep the existing policies unchanged (managers can
-- already query leads), but add a dedicated policy that blocks managers from
-- reading private_scratchpad by using a separate restrictive policy.
--
-- Postgres RLS permissive policies are OR-ed together, so we cannot use a
-- restrictive policy to subtract a column from an existing permissive grant.
-- The correct solution is a SECURITY DEFINER function that the app calls, or
-- stripping the field at the service/page layer (already done in this PR) plus
-- a DB-level column privilege revoke for the authenticated role.
--
-- Production-safe decision:
--   1. Strip at page layer (done in page.tsx — no scratchpad passed to component
--      for managers/founders).
--   2. Strip at service layer (getLeadById returns null scratchpad for non-owners).
--   3. DB column privilege: revoke SELECT on private_scratchpad from authenticated
--      role — the service-role (admin client) retains full access for webhook writes.
--
-- This is the correct three-layer approach without touching existing policies.

-- Revoke column-level SELECT on private_scratchpad from the authenticated role.
-- authenticated = every logged-in Supabase user (anon excluded).
-- Service role bypasses this (used for webhook inserts and action writes).
REVOKE SELECT (private_scratchpad) ON leads FROM authenticated;

-- Re-grant only to a future DB function or via service role.
-- App reads scratchpad via a dedicated secure function below.

-- Secure accessor: returns scratchpad only for assigned agent, admin, founder.
-- Manager and guest always get NULL — same result as no access.
CREATE OR REPLACE FUNCTION get_lead_scratchpad(p_lead_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_to   uuid;
  v_scratchpad    text;
  v_caller_role   user_role;
  v_caller_id     uuid;
BEGIN
  v_caller_role := get_user_role();
  v_caller_id   := auth.uid();

  SELECT assigned_to, private_scratchpad
    INTO v_assigned_to, v_scratchpad
    FROM leads
   WHERE id = p_lead_id;

  -- Allowed: assigned agent, admin, founder
  IF v_caller_role IN ('admin', 'founder') THEN
    RETURN v_scratchpad;
  END IF;

  IF v_caller_role = 'agent' AND v_assigned_to = v_caller_id THEN
    RETURN v_scratchpad;
  END IF;

  -- Everyone else (manager, guest, unassigned agent) gets NULL
  RETURN NULL;
END;
$$;

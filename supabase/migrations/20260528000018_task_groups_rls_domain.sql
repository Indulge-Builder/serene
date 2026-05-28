-- ============================================================
-- Migration 0018 — task_groups RLS: domain enforcement on SELECT and UPDATE
-- ============================================================
-- A-09 violation fix: the SELECT and UPDATE policies on task_groups granted
-- manager role unrestricted cross-domain access. A manager in the concierge
-- domain could read and mutate task_groups rows belonging to finance domain
-- because the domain column was not referenced in the USING clause.
--
-- Fix:
--   SELECT — manager must satisfy get_user_domain()::text = domain.
--             admin and founder retain full visibility.
--   UPDATE — same domain constraint applied to USING and WITH CHECK.
--
-- Type note: task_groups.domain is text (migration 0017).
-- get_user_domain() returns app_domain (enum, migration 0001).
-- PostgreSQL will not implicitly cast app_domain → text, so an explicit
-- ::text cast is required on the function call side.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SELECT policy — replace with domain-scoped version
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "task_groups_select" ON task_groups;

CREATE POLICY "task_groups_select"
  ON task_groups FOR SELECT
  USING (
    created_by = auth.uid()
    OR get_user_role() IN ('admin', 'founder')
    OR (get_user_role() = 'manager' AND get_user_domain()::text = domain)
  );

-- ─────────────────────────────────────────────────────────────
-- UPDATE policy — replace with domain-scoped version
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "task_groups_update" ON task_groups;

CREATE POLICY "task_groups_update"
  ON task_groups FOR UPDATE
  USING (
    created_by = auth.uid()
    OR get_user_role() IN ('admin', 'founder')
    OR (get_user_role() = 'manager' AND get_user_domain()::text = domain)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR get_user_role() IN ('admin', 'founder')
    OR (get_user_role() = 'manager' AND get_user_domain()::text = domain)
  );

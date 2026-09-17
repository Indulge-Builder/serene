-- 0212 — HOTFIX: restore the `profiles` embed for tables that moved out of `public`.
--
-- The bug: PostgREST resolves a resource embed only WITHIN the schema of the request
-- (PGRST200, "no relationship between 'leads' and 'profiles' in the schema 'gia'"). After
-- 0210/0211 every query shaped `giaDb(...).from('leads').select('*, assignee:profiles!…')`
-- returned an error instead of rows, so the leads list, the lead dossier, deals, the SLA
-- reads and one member read came back empty. Found in production 2026-09-17: the rehearsal
-- exercised the DATABASE (rows, policies, functions, routines) but never the app's own
-- queries, which is exactly where the breakage was.
--
-- The fix: a `profiles` VIEW inside each moved schema. PostgREST traces a view's columns
-- back to their base table, so the existing cross-schema foreign keys
-- (gia.leads.assigned_to → public.profiles.id) resolve again and every embed works with no
-- application change.
--
-- SECURITY: `security_invoker = true` (PG15+) makes the view run as the CALLER, so
-- public.profiles' RLS applies exactly as it did through the embed. Without it a view runs
-- with its owner's rights and would expose every profile — never drop this setting.
--
-- Read-only by construction: only SELECT is granted, so the view can never become a second
-- way to write a profile.

CREATE OR REPLACE VIEW gia.profiles WITH (security_invoker = true) AS
  SELECT * FROM public.profiles;

CREATE OR REPLACE VIEW member.profiles WITH (security_invoker = true) AS
  SELECT * FROM public.profiles;

REVOKE ALL ON gia.profiles    FROM authenticated, service_role;
REVOKE ALL ON member.profiles FROM authenticated, service_role;
GRANT SELECT ON gia.profiles    TO authenticated, service_role;
GRANT SELECT ON member.profiles TO authenticated, service_role;

COMMENT ON VIEW gia.profiles IS
  'Read-only mirror of public.profiles so PostgREST can embed it from gia tables; '
  'cross-schema embeds are not supported. security_invoker keeps RLS with the caller.';
COMMENT ON VIEW member.profiles IS
  'Read-only mirror of public.profiles so PostgREST can embed it from member tables; '
  'cross-schema embeds are not supported. security_invoker keeps RLS with the caller.';

NOTIFY pgrst, 'reload schema';

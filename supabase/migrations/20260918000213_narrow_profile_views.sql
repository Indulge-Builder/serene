-- 0213 — Narrow the gia/member `profiles` views to exactly what the app joins: id + name.
--
-- 0212 (the hotfix) mirrored every column of public.profiles into gia.profiles and
-- member.profiles so PostgREST could embed it from the moved schemas. Every one of the 21
-- embeds that needs it asks for `full_name` and nothing else (checked 2026-09-18), so the
-- other columns — email, phone, avatar, job title, timezone and the rest — were a second
-- read path with no reader. RLS already limited which ROWS came back; this limits which
-- COLUMNS exist at all. The view is now a staff-name lookup, not a copy of profiles.
--
-- `id` stays because PostgREST traces it to public.profiles.id to find the foreign keys
-- (leads.assigned_to, lead_notes.author_id, …); without it no embed resolves.
--
-- CREATE OR REPLACE cannot drop view columns, so each view is dropped and recreated in
-- this one transaction; nothing in the database depends on either view.
-- security_invoker stays on (RLS runs as the caller) and only SELECT is granted.

DROP VIEW IF EXISTS gia.profiles;
CREATE VIEW gia.profiles WITH (security_invoker = true) AS
  SELECT id, full_name FROM public.profiles;

DROP VIEW IF EXISTS member.profiles;
CREATE VIEW member.profiles WITH (security_invoker = true) AS
  SELECT id, full_name FROM public.profiles;

REVOKE ALL ON gia.profiles    FROM authenticated, service_role;
REVOKE ALL ON member.profiles FROM authenticated, service_role;
GRANT SELECT ON gia.profiles    TO authenticated, service_role;
GRANT SELECT ON member.profiles TO authenticated, service_role;

COMMENT ON VIEW gia.profiles IS
  'Staff-name lookup (id, full_name) so PostgREST can embed profiles from gia tables; '
  'cross-schema embeds are not supported. security_invoker keeps RLS with the caller. '
  'Add a column only when a gia embed needs it.';
COMMENT ON VIEW member.profiles IS
  'Staff-name lookup (id, full_name) so PostgREST can embed profiles from member tables; '
  'cross-schema embeds are not supported. security_invoker keeps RLS with the caller. '
  'Add a column only when a member embed needs it.';

NOTIFY pgrst, 'reload schema';

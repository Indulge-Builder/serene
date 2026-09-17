-- 0211 — The member twin moves to its own schema: public.members + public.member_* → member.<same names>.
--
-- Plan: docs/architecture/schema-restructure-plan.md (§2.2, §10). Technique: 0210 (Gia) and
-- 0172 (the wag_ tables). Same rules: one catalog relabel per relation, no data copied, one
-- transaction, rehearsed on a container copy of the live schema BEFORE it is pushed.
--
-- Two deliberate deviations from the plan text, both for consistency with 0210:
--   * table names are kept (member.member_facts, not member.facts) — gia kept lead_notes;
--     a rename can follow later as a pure catalog change if the founder wants it;
--   * the three gate functions (member_visible, can_access_member_queendom, get_user_queendom)
--     STAY in public: the sia.tickets policies and the RPC surface keep working unchanged, and
--     their bodies resolve `members` through the widened search path below.
--
-- What moves: members + member_access_log, member_anticipations, member_chunks,
-- member_documents, member_events (+ its 39 monthly partitions + member_events_default),
-- member_facts, member_health_events, member_health_policy, member_people, member_relations,
-- member_snapshot — 52 relations on 2026-09-17. Partitions are moved one by one (0172).
-- Foreign keys from gia.deals, sia.tickets / ticket_events / extraction_runs / wag_groups /
-- wag_contacts, freshdesk.tickets / contacts and public.vendor_engagements point at the
-- relation, not the name, and hold.

-- ── 1. The schema and who may enter it ───────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS member;
GRANT USAGE ON SCHEMA member TO authenticated, service_role;
-- anon deliberately not granted.

-- ── 2. Move every member relation (parents + partitions), guarded and reported ─
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relkind IN ('p', 'r')
      AND (c.relname = 'members' OR c.relname LIKE 'member\_%')
    ORDER BY c.relkind DESC, c.relname   -- parents ('p') first, then plain/partition tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA member', r.relname);
    n := n + 1;
  END LOOP;
  IF n = 0 AND to_regclass('member.members') IS NULL THEN
    RAISE EXCEPTION 'member move: found no member relations in public and none in member';
  END IF;
  RAISE NOTICE 'member move: % relation(s) moved', n;
END
$$;

-- ── 3. Grants: what the tables had in public, and the same for future tables ──
GRANT ALL ON ALL TABLES    IN SCHEMA member TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA member TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA member GRANT ALL ON TABLES    TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA member GRANT ALL ON SEQUENCES TO authenticated, service_role;

-- ── 4. Function search paths: append `member` to whatever the routine already has ──
-- Live check 2026-09-17: only member_visible and can_access_member_queendom read the member
-- tables from a function body (bare names, path `public, gia`). The loop is the same as 0210,
-- so every routine in public that can already see gia can now see member too.
DO $$
DECLARE
  r record;
  n int := 0;
  cur text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           (SELECT c FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%') AS sp
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    cur := CASE WHEN r.sp IS NULL THEN 'public' ELSE substr(r.sp, length('search_path=') + 1) END;
    CONTINUE WHEN cur !~ '(^|,)\s*"?public"?\s*(,|$)';
    CONTINUE WHEN cur  ~ '(^|,)\s*"?member"?\s*(,|$)';
    EXECUTE format('ALTER ROUTINE public.%I(%s) SET search_path = %s', r.proname, r.args, cur || ', member');
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'member move: search_path widened on % routine(s)', n;
END
$$;

-- ── 5. Expose the schema on the REST path and reload PostgREST ────────────────
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, sia, freshdesk, gia, member';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

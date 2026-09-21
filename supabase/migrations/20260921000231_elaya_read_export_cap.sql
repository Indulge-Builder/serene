-- 0231: the analyst runner's row cap rises from 500 to 5,000 (MCP connector Phase 2, the export).
--
-- elaya_read.run() (0223) clamps p_max_rows to 500. The chat tool never asks for more than 300 and
-- keeps its own clamp in code. The connector's export_rows tool hands a founder or admin up to
-- 5,000 rows as CSV so Claude or ChatGPT can analyse them in their sandboxes. Every other lock
-- of 0223 stands untouched: the query still runs AS elaya_reader over the cleaned views only, in
-- a READ ONLY transaction, as one wrapped SELECT, under the statement timeout, and is logged.
-- CREATE OR REPLACE keeps the owner (elaya_reader) and the grants (postgres, service_role).

CREATE OR REPLACE FUNCTION elaya_read.run(p_sql text, p_max_rows int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elaya_read, pg_catalog
AS $$
DECLARE
  v_sql   text := btrim(coalesce(p_sql, ''));
  v_flat  text;
  v_limit int  := least(greatest(coalesce(p_max_rows, 200), 1), 5000);
  v_rows  jsonb;
  v_count int;
BEGIN
  v_sql := regexp_replace(v_sql, ';\s*$', '');
  v_flat := lower(replace(v_sql, '"', ''));
  IF length(v_sql) = 0 OR length(v_sql) > 8000 THEN RAISE EXCEPTION 'query is empty or too long'; END IF;
  IF v_flat !~ '^\s*(select|with)\M' THEN RAISE EXCEPTION 'only a single SELECT (or WITH ... SELECT) is allowed'; END IF;
  IF position(';' IN v_sql) > 0 OR position('--' IN v_sql) > 0 OR position('/*' IN v_sql) > 0 THEN
    RAISE EXCEPTION 'no semicolons or comments: send one plain SELECT';
  END IF;
  IF v_flat ~ '\m(public|auth|vault|storage|gia|sia|member|freshdesk|extensions|net|cron|pgsodium|realtime|supabase_functions)\s*\.\s*[a-z_]' THEN
    RAISE EXCEPTION 'only the views of the catalog may be read: do not schema-qualify names, and do not use a table alias named public/auth/gia/sia/member/freshdesk';
  END IF;
  IF v_flat ~ '\m(pg_sleep\w*|pg_read_\w+|pg_ls_\w+|pg_stat_file|lo_\w+|dblink\w*|set_config|pg_terminate_backend|pg_cancel_backend|pg_advisory\w*|nextval|setval|pg_reload_conf|query_to_xml\w*|table_to_xml\w*|database_to_xml\w*)\M' THEN
    RAISE EXCEPTION 'that function is not allowed';
  END IF;

  PERFORM set_config('transaction_read_only', 'on', true);

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb), count(*)::int FROM (SELECT * FROM (%s) elaya_inner LIMIT %s) q',
    v_sql, v_limit + 1
  ) INTO v_rows, v_count;

  IF v_count > v_limit THEN
    v_rows := (SELECT jsonb_agg(e) FROM (SELECT e FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(e, n) WHERE n <= v_limit ORDER BY n) s);
  END IF;
  RETURN jsonb_build_object('rows', v_rows, 'row_count', least(v_count, v_limit), 'truncated', v_count > v_limit, 'row_cap', v_limit);
END;
$$;

-- Re-stated so the posture is visible here too (CREATE OR REPLACE already preserves both).
ALTER FUNCTION elaya_read.run(text, int) OWNER TO elaya_reader;
REVOKE ALL ON FUNCTION elaya_read.run(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION elaya_read.run(text, int) TO postgres, service_role;

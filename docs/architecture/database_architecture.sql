--
-- PostgreSQL database dump
--

\restrict AXz0o1vkMPPV9EsP6vH9NlS6QaaUFRVUjbphX6EqNbhPie6M6JYmowNZ5PLgFIs

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO supabase_admin;

--
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION pg_cron; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA extensions;


ALTER SCHEMA extensions OWNER TO postgres;

--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql;


ALTER SCHEMA graphql OWNER TO supabase_admin;

--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql_public;


ALTER SCHEMA graphql_public OWNER TO supabase_admin;

--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: pgbouncer
--

CREATE SCHEMA pgbouncer;


ALTER SCHEMA pgbouncer OWNER TO pgbouncer;

--
-- Name: pgmq; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA pgmq;


ALTER SCHEMA pgmq OWNER TO postgres;

--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA realtime;


ALTER SCHEMA realtime OWNER TO supabase_admin;

--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA storage;


ALTER SCHEMA storage OWNER TO supabase_admin;

--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA supabase_migrations;


ALTER SCHEMA supabase_migrations OWNER TO postgres;

--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA vault;


ALTER SCHEMA vault OWNER TO supabase_admin;

--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: pgmq; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgmq WITH SCHEMA pgmq;


--
-- Name: EXTENSION pgmq; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgmq IS 'A lightweight message queue. Like AWS SQS and RSMQ but on Postgres.';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


ALTER TYPE auth.aal_level OWNER TO supabase_auth_admin;

--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


ALTER TYPE auth.code_challenge_method OWNER TO supabase_auth_admin;

--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


ALTER TYPE auth.factor_status OWNER TO supabase_auth_admin;

--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


ALTER TYPE auth.factor_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


ALTER TYPE auth.oauth_authorization_status OWNER TO supabase_auth_admin;

--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


ALTER TYPE auth.oauth_client_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


ALTER TYPE auth.oauth_registration_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


ALTER TYPE auth.oauth_response_type OWNER TO supabase_auth_admin;

--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


ALTER TYPE auth.one_time_token_type OWNER TO supabase_auth_admin;

--
-- Name: app_domain; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.app_domain AS ENUM (
    'concierge',
    'onboarding',
    'finance',
    'marketing',
    'tech',
    'shop',
    'b2b',
    'house',
    'legacy'
);


ALTER TYPE public.app_domain OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'founder',
    'admin',
    'manager',
    'agent',
    'guest'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- Name: action; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


ALTER TYPE realtime.action OWNER TO supabase_admin;

--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


ALTER TYPE realtime.equality_op OWNER TO supabase_admin;

--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


ALTER TYPE realtime.user_defined_filter OWNER TO supabase_admin;

--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


ALTER TYPE realtime.wal_column OWNER TO supabase_admin;

--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


ALTER TYPE realtime.wal_rls OWNER TO supabase_admin;

--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


ALTER TYPE storage.buckettype OWNER TO supabase_storage_admin;

--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


ALTER FUNCTION auth.jwt() OWNER TO supabase_auth_admin;

--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_cron_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
begin
    if not exists (
        select 1
        from pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


ALTER FUNCTION extensions.grant_pg_graphql_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_net_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_ddl_watch() OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_drop_watch() OWNER TO supabase_admin;

--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


ALTER FUNCTION extensions.set_graphql_placeholder() OWNER TO supabase_admin;

--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: supabase_admin
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


ALTER FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) OWNER TO supabase_admin;

--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: supabase_admin
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


ALTER FUNCTION pgbouncer.get_auth(p_usename text) OWNER TO supabase_admin;

--
-- Name: add_lead_call_note(uuid, uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_lead_call_note(p_lead_id uuid, p_author_id uuid, p_content text, p_call_outcome text, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status          text;
  v_call_count      int;
  v_assigned_to     uuid;
  v_domain          text;
  v_new_call_count  int;
  v_auto_advance    boolean;
  v_note_id         uuid;
BEGIN
  -- 1. Fetch current lead state
  SELECT status, call_count, assigned_to, domain
    INTO v_status, v_call_count, v_assigned_to, v_domain
    FROM leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- 2. Insert note (append-only — A-11)
  INSERT INTO lead_notes (lead_id, author_id, content, call_outcome)
  VALUES (p_lead_id, p_author_id, p_content, p_call_outcome)
  RETURNING id INTO v_note_id;

  -- 3. Compute derived values
  v_new_call_count := COALESCE(v_call_count, 0) + 1;
  v_auto_advance   := (v_status = 'new');

  -- 4. Single UPDATE on leads
  UPDATE leads
     SET call_count        = v_new_call_count,
         last_call_outcome = p_call_outcome,
         last_activity_at  = p_now,
         status            = CASE WHEN v_auto_advance THEN 'touched' ELSE status END,
         status_changed_at = CASE WHEN v_auto_advance THEN p_now ELSE status_changed_at END
   WHERE id = p_lead_id;

  -- 5. Log call_logged activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'call_logged',
    jsonb_build_object('outcome', p_call_outcome, 'call_count', v_new_call_count)
  );

  -- 6. Log note_added activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'note_added',
    jsonb_build_object('call_outcome', p_call_outcome)
  );

  -- 7. Conditionally log status_changed activity (new → touched only)
  IF v_auto_advance THEN
    INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
    VALUES (
      p_lead_id,
      p_author_id,
      'status_changed',
      jsonb_build_object('old_status', 'new', 'new_status', 'touched')
    );
  END IF;

  -- 8. Return data the action layer needs for SLA side-effects
  RETURN jsonb_build_object(
    'note_id',          v_note_id,
    'new_call_count',   v_new_call_count,
    'did_auto_advance', v_auto_advance,
    'assigned_to',      v_assigned_to,
    'domain',           v_domain,
    'old_status',       v_status
  );
END;
$$;


ALTER FUNCTION public.add_lead_call_note(p_lead_id uuid, p_author_id uuid, p_content text, p_call_outcome text, p_now timestamp with time zone) OWNER TO postgres;

--
-- Name: add_lead_plain_note(uuid, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_lead_plain_note(p_lead_id uuid, p_author_id uuid, p_content text, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_note_id  uuid;
BEGIN
  -- Verify lead exists
  IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- Insert note with no call outcome (append-only — A-11)
  INSERT INTO lead_notes (lead_id, author_id, content, call_outcome)
  VALUES (p_lead_id, p_author_id, p_content, NULL)
  RETURNING id INTO v_note_id;

  -- Update last_activity_at on the lead
  UPDATE leads
     SET last_activity_at = p_now
   WHERE id = p_lead_id;

  -- Log note_added activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (
    p_lead_id,
    p_author_id,
    'note_added',
    jsonb_build_object('manual', true)
  );

  RETURN jsonb_build_object('note_id', v_note_id);
END;
$$;


ALTER FUNCTION public.add_lead_plain_note(p_lead_id uuid, p_author_id uuid, p_content text, p_now timestamp with time zone) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: task_remarks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_remarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    status_change text,
    is_suppressed boolean DEFAULT false NOT NULL,
    suppressed_by uuid,
    suppressed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_remarks_status_change_check CHECK ((status_change = ANY (ARRAY['to_do'::text, 'in_progress'::text, 'in_review'::text, 'completed'::text, 'error'::text, 'cancelled'::text])))
);


ALTER TABLE public.task_remarks OWNER TO postgres;

--
-- Name: add_task_remark_with_status(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_task_remark_with_status(p_task_id uuid, p_author_id uuid, p_content text, p_status_change text DEFAULT NULL::text) RETURNS public.task_remarks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_task   record;
  v_remark task_remarks;
BEGIN
  SELECT id, status
    INTO v_task
    FROM tasks
   WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;

  IF p_status_change IS NOT NULL AND v_task.status != p_status_change THEN
    UPDATE tasks
       SET status       = p_status_change,
           completed_at = CASE
                            WHEN p_status_change = 'completed' THEN now()
                            ELSE NULL
                          END,
           updated_at   = now()
     WHERE id = p_task_id;
  END IF;

  INSERT INTO task_remarks (task_id, author_id, content, status_change)
  VALUES (p_task_id, p_author_id, p_content, p_status_change)
  RETURNING * INTO v_remark;

  RETURN v_remark;
END;
$$;


ALTER FUNCTION public.add_task_remark_with_status(p_task_id uuid, p_author_id uuid, p_content text, p_status_change text) OWNER TO postgres;

--
-- Name: can_access_wa_conversation(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_access_wa_conversation(p_lead_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM leads l
    WHERE l.id = p_lead_id
      AND l.archived_at IS NULL
      AND (
        (get_user_role() = 'agent'   AND l.assigned_to = auth.uid())
        OR (get_user_role() = 'manager' AND l.domain = get_user_domain())
        OR get_user_role() IN ('admin', 'founder')
      )
  );
$$;


ALTER FUNCTION public.can_access_wa_conversation(p_lead_id uuid) OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assigned_to uuid NOT NULL,
    created_by uuid NOT NULL,
    module text NOT NULL,
    task_type text NOT NULL,
    status text DEFAULT 'to_do'::text NOT NULL,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'normal'::text NOT NULL,
    task_category text DEFAULT 'personal'::text NOT NULL,
    group_id uuid,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT tasks_attachments_is_array CHECK ((jsonb_typeof(attachments) = 'array'::text)),
    CONSTRAINT tasks_category_check CHECK ((task_category = ANY (ARRAY['personal'::text, 'group_subtask'::text, 'gia_followup'::text]))),
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'normal'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['to_do'::text, 'in_progress'::text, 'in_review'::text, 'completed'::text, 'error'::text, 'cancelled'::text])))
);


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: create_lead_gia_task(uuid, uuid, uuid, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_lead_gia_task(p_lead_id uuid, p_assigned_to uuid, p_created_by uuid, p_task_type text, p_title text, p_description text DEFAULT NULL::text, p_priority text DEFAULT 'normal'::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS SETOF public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_task_id uuid;
BEGIN
  -- 1. Insert the task row
  INSERT INTO tasks (
    assigned_to,
    created_by,
    module,
    task_type,
    title,
    description,
    priority,
    due_at,
    status,
    task_category
  )
  VALUES (
    p_assigned_to,
    p_created_by,
    'gia',
    p_task_type,
    p_title,
    p_description,
    p_priority,
    p_due_at,
    'to_do',
    'gia_followup'
  )
  RETURNING id INTO v_task_id;

  -- 2. Insert the companion task_gia_meta row (same transaction)
  --    A tasks row without a task_gia_meta row is invisible on all Gia surfaces.
  INSERT INTO task_gia_meta (task_id, lead_id)
  VALUES (v_task_id, p_lead_id);

  -- 3. Return the full tasks row so the action can wire up the Trigger.dev reminder
  RETURN QUERY SELECT * FROM tasks WHERE id = v_task_id;
END;
$$;


ALTER FUNCTION public.create_lead_gia_task(p_lead_id uuid, p_assigned_to uuid, p_created_by uuid, p_task_type text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone) OWNER TO postgres;

--
-- Name: generate_lead_slug(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_lead_slug(p_first_name text, p_last_name text, p_phone text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  base      text;
  last4     text;
  candidate text;
  counter   int := 1;
BEGIN
  last4 := right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 4);
  base  := lower(regexp_replace(
             concat_ws('-',
               regexp_replace(trim(coalesce(p_first_name, '')), '\s+', '-', 'g'),
               regexp_replace(trim(coalesce(p_last_name,  '')), '\s+', '-', 'g')
             ),
             '[^a-z0-9\-]', '', 'g'
           ));

  candidate := base || '-' || last4;

  -- Loop until a free slot is found
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM leads WHERE slug = candidate
    );
    counter   := counter + 1;
    candidate := base || '-' || last4 || '-' || counter;
  END LOOP;

  RETURN candidate;
END;
$$;


ALTER FUNCTION public.generate_lead_slug(p_first_name text, p_last_name text, p_phone text) OWNER TO postgres;

--
-- Name: get_active_lead_by_phone(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_active_lead_by_phone(p_phone text) RETURNS TABLE(id uuid, first_name text, last_name text, phone text, status text, assigned_to uuid, domain public.app_domain, slug text, archived_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    l.id,
    l.first_name,
    l.last_name,
    l.phone,
    l.status,
    l.assigned_to,
    l.domain,
    l.slug,
    l.archived_at
  FROM leads l
  WHERE l.phone       = p_phone
    AND l.archived_at IS NULL
    AND l.status      IN ('new', 'touched', 'in_discussion', 'nurturing')
  ORDER BY l.created_at DESC
  LIMIT 1;
$$;


ALTER FUNCTION public.get_active_lead_by_phone(p_phone text) OWNER TO postgres;

--
-- Name: get_agent_recent_activity(text, public.app_domain, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_agent_recent_activity(p_role text, p_domain public.app_domain, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          la.id,
        'action_type', la.action_type,
        'details',     la.details,
        'created_at',  la.created_at,
        'lead_id',     la.lead_id,
        'actor_id',    la.actor_id,
        'lead_name',   CASE
                         WHEN l.first_name IS NOT NULL
                         THEN TRIM(l.first_name || ' ' || COALESCE(l.last_name, ''))
                         ELSE NULL
                       END
      )
      ORDER BY la.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM lead_activities la
  LEFT JOIN leads l ON l.id = la.lead_id
  WHERE
    CASE
      WHEN p_role IN ('admin', 'founder') THEN TRUE
      WHEN p_role = 'manager'             THEN l.domain = p_domain
      ELSE                                     la.actor_id = p_user_id
    END
  ORDER BY la.created_at DESC
  LIMIT 25;

  RETURN v_result;
END;
$$;


ALTER FUNCTION public.get_agent_recent_activity(p_role text, p_domain public.app_domain, p_user_id uuid) OWNER TO postgres;

--
-- Name: get_campaign_agent_distribution(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_campaign_agent_distribution(p_campaign text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(agent_id uuid, full_name text, lead_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    l.assigned_to                  AS agent_id,
    p.full_name                    AS full_name,
    COUNT(*)                       AS lead_count
  FROM leads l
  JOIN profiles p ON p.id = l.assigned_to
  WHERE l.archived_at IS NULL
    AND l.utm_campaign = p_campaign
    AND l.assigned_to IS NOT NULL
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <= p_date_to)
  GROUP BY l.assigned_to, p.full_name
  ORDER BY lead_count DESC;
$$;


ALTER FUNCTION public.get_campaign_agent_distribution(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) OWNER TO postgres;

--
-- Name: get_campaign_detail_metrics(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_campaign_detail_metrics(p_campaign text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(campaign_name text, total_leads bigint, status_new bigint, status_touched bigint, status_in_discussion bigint, status_won bigint, status_nurturing bigint, status_lost bigint, status_junk bigint, outcome_rnr bigint, outcome_switched_off bigint, outcome_converted bigint, avg_hours_to_first_touch double precision)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    l.utm_campaign                                                       AS campaign_name,
    COUNT(*)                                                             AS total_leads,
    COUNT(*) FILTER (WHERE l.status = 'new')                            AS status_new,
    COUNT(*) FILTER (WHERE l.status = 'touched')                        AS status_touched,
    COUNT(*) FILTER (WHERE l.status = 'in_discussion')                  AS status_in_discussion,
    COUNT(*) FILTER (WHERE l.status = 'won')                            AS status_won,
    COUNT(*) FILTER (WHERE l.status = 'nurturing')                      AS status_nurturing,
    COUNT(*) FILTER (WHERE l.status = 'lost')                           AS status_lost,
    COUNT(*) FILTER (WHERE l.status = 'junk')                           AS status_junk,
    COUNT(*) FILTER (WHERE l.last_call_outcome = 'rnr')                 AS outcome_rnr,
    COUNT(*) FILTER (WHERE l.last_call_outcome = 'switched_off')        AS outcome_switched_off,
    COUNT(*) FILTER (WHERE l.last_call_outcome = 'converted')           AS outcome_converted,
    AVG(
      EXTRACT(EPOCH FROM (ft.first_touched_at - l.created_at)) / 3600.0
    )                                                                    AS avg_hours_to_first_touch
  FROM leads l
  LEFT JOIN LATERAL (
    SELECT MIN(la.created_at) AS first_touched_at
    FROM lead_activities la
    WHERE la.lead_id = l.id
      AND la.action_type = 'status_changed'
      AND la.details->>'new_status' = 'touched'
  ) ft ON true
  WHERE l.archived_at IS NULL
    AND l.utm_campaign = p_campaign
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <= p_date_to)
  GROUP BY l.utm_campaign;
$$;


ALTER FUNCTION public.get_campaign_detail_metrics(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) OWNER TO postgres;

--
-- Name: get_campaign_metrics(public.app_domain, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_campaign_metrics(p_domain public.app_domain DEFAULT NULL::public.app_domain, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(campaign_name text, domain text, total_leads bigint, status_new bigint, status_touched bigint, status_in_discussion bigint, status_won bigint, status_nurturing bigint, status_lost bigint, status_junk bigint, outcome_rnr bigint, outcome_switched_off bigint, outcome_converted bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    utm_campaign                                                    AS campaign_name,
    domain::text                                                    AS domain,
    COUNT(*)                                                        AS total_leads,
    COUNT(*) FILTER (WHERE status = 'new')                         AS status_new,
    COUNT(*) FILTER (WHERE status = 'touched')                     AS status_touched,
    COUNT(*) FILTER (WHERE status = 'in_discussion')               AS status_in_discussion,
    COUNT(*) FILTER (WHERE status = 'won')                         AS status_won,
    COUNT(*) FILTER (WHERE status = 'nurturing')                   AS status_nurturing,
    COUNT(*) FILTER (WHERE status = 'lost')                        AS status_lost,
    COUNT(*) FILTER (WHERE status = 'junk')                        AS status_junk,
    COUNT(*) FILTER (WHERE last_call_outcome = 'rnr')              AS outcome_rnr,
    COUNT(*) FILTER (WHERE last_call_outcome = 'switched_off')     AS outcome_switched_off,
    COUNT(*) FILTER (WHERE last_call_outcome = 'converted')        AS outcome_converted
  FROM leads
  WHERE archived_at IS NULL
    AND utm_campaign IS NOT NULL
    AND (p_domain IS NULL OR domain = p_domain)
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to   IS NULL OR created_at <= p_date_to)
  GROUP BY utm_campaign, domain
  ORDER BY total_leads DESC;
$$;


ALTER FUNCTION public.get_campaign_metrics(p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) OWNER TO postgres;

--
-- Name: get_campaign_pipeline_refresh(text, public.app_domain, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_campaign_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH campaign_rows AS (
    SELECT
      utm_campaign AS campaign,
      status
    FROM leads
    WHERE archived_at IS NULL
      AND utm_campaign IS NOT NULL
      AND (
        CASE
          WHEN p_role = 'manager' THEN domain = p_domain
          ELSE TRUE
        END
      )
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to   IS NULL OR created_at <  p_date_to)
  ),
  campaign_agg AS (
    SELECT
      campaign,
      SUM(cnt)::int AS total,
      jsonb_object_agg(status, cnt) AS mix
    FROM (
      SELECT campaign, status, COUNT(*)::int AS cnt
      FROM campaign_rows
      GROUP BY campaign, status
    ) sub
    GROUP BY campaign
    ORDER BY total DESC
    LIMIT 12
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'campaign', campaign,
        'total',    total,
        'mix',      mix
      )
      ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM campaign_agg;

  RETURN v_result;
END;
$$;


ALTER FUNCTION public.get_campaign_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) OWNER TO postgres;

--
-- Name: get_dashboard_summary(text, public.app_domain, uuid, public.app_domain, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_dashboard_summary(p_role text, p_domain public.app_domain, p_user_id uuid, p_initial_domain public.app_domain DEFAULT NULL::public.app_domain, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_now              timestamptz := now();
  v_result           jsonb;
  v_agent_tasks      jsonb;
  v_activity         jsonb;
  v_lead_status      jsonb;
  v_campaigns        jsonb;
  v_cold_leads_count int;
BEGIN

  -- ─────────────────────────────────────────────────────────────────
  -- 1. Agent Tasks — all categories, active statuses only
  --    ALWAYS computed; date filter does NOT apply.
  -- ─────────────────────────────────────────────────────────────────
  WITH task_rows AS (
    SELECT
      t.id,
      t.title,
      t.task_category,
      t.task_type,
      t.priority,
      t.status,
      t.due_at,
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < v_now THEN true ELSE false END AS is_overdue,
      CASE
        WHEN t.task_category = 'gia_followup' THEN
          TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, ''))
        WHEN t.task_category = 'group_subtask' THEN
          tg.title
        ELSE
          NULL
      END AS context_label,
      CASE
        WHEN t.task_category = 'gia_followup' THEN tgm.lead_id::text
        ELSE NULL
      END AS lead_id
    FROM tasks t
    LEFT JOIN task_gia_meta tgm ON tgm.task_id = t.id AND t.task_category = 'gia_followup'
    LEFT JOIN leads l            ON l.id = tgm.lead_id
    LEFT JOIN task_groups tg     ON tg.id = t.group_id AND t.task_category = 'group_subtask'
    WHERE t.assigned_to = p_user_id
      AND t.status IN ('to_do', 'in_progress', 'in_review')
    ORDER BY
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < v_now THEN 0 ELSE 1 END ASC,
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END ASC,
      t.due_at ASC NULLS LAST
    LIMIT 30
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',            r.id,
        'title',         r.title,
        'task_category', r.task_category,
        'task_type',     r.task_type,
        'priority',      r.priority,
        'status',        r.status,
        'due_at',        r.due_at,
        'is_overdue',    r.is_overdue,
        'context_label', r.context_label,
        'lead_id',       r.lead_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_agent_tasks
  FROM task_rows r;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Live Lead Activity — role-scoped
  --    ALWAYS computed; date filter does NOT apply.
  -- ─────────────────────────────────────────────────────────────────
  WITH activity_rows AS (
    SELECT
      la.id,
      la.action_type,
      la.details,
      la.created_at,
      la.lead_id,
      la.actor_id,
      l.first_name,
      l.last_name
    FROM lead_activities la
    LEFT JOIN leads l ON l.id = la.lead_id
    WHERE
      CASE
        WHEN p_role IN ('admin', 'founder') THEN true
        WHEN p_role = 'manager'             THEN l.domain = p_domain
        ELSE                                     la.actor_id = p_user_id
      END
    ORDER BY la.created_at DESC
    LIMIT 25
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          r.id,
        'action_type', r.action_type,
        'details',     r.details,
        'created_at',  r.created_at,
        'lead_id',     r.lead_id,
        'actor_id',    r.actor_id,
        'lead_name',   CASE
                         WHEN r.first_name IS NOT NULL
                         THEN TRIM(r.first_name || ' ' || COALESCE(r.last_name, ''))
                         ELSE NULL
                       END
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_activity
  FROM activity_rows r;

  -- ─────────────────────────────────────────────────────────────────
  -- Role branch: agents skip pipeline/campaign/cold-leads CTEs.
  -- ─────────────────────────────────────────────────────────────────
  IF p_role = 'agent' THEN
    RETURN jsonb_build_object(
      'agent_tasks',       v_agent_tasks,
      'agent_activity',    v_activity,
      'lead_status',       jsonb_build_object('totals', '[]'::jsonb, 'byAgent', '[]'::jsonb),
      'campaigns',         '[]'::jsonb,
      'cold_leads_count',  0
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- 3. Lead Status Summary — date filter applied to created_at
  -- ─────────────────────────────────────────────────────────────────
  WITH lead_rows AS (
    SELECT
      l.status,
      l.assigned_to,
      pr.full_name AS agent_name
    FROM leads l
    LEFT JOIN profiles pr ON pr.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND (
        CASE
          WHEN p_role = 'manager'
            THEN l.domain = p_domain
          WHEN p_initial_domain IS NOT NULL
            THEN l.domain = p_initial_domain
          ELSE
            TRUE
        END
      )
      AND (p_date_from IS NULL OR l.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR l.created_at <  p_date_to)
  ),
  status_totals AS (
    SELECT
      status,
      COUNT(*)::int AS cnt
    FROM lead_rows
    GROUP BY status
  ),
  agent_counts AS (
    SELECT
      assigned_to,
      MAX(agent_name) AS agent_name,
      COUNT(*)::int AS total,
      jsonb_object_agg(status, cnt) AS counts
    FROM (
      SELECT assigned_to, agent_name, status, COUNT(*)::int AS cnt
      FROM lead_rows
      WHERE assigned_to IS NOT NULL
      GROUP BY assigned_to, agent_name, status
    ) sub
    GROUP BY assigned_to
  )
  SELECT jsonb_build_object(
    'totals', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt) ORDER BY
        CASE status
          WHEN 'new'           THEN 1
          WHEN 'touched'       THEN 2
          WHEN 'in_discussion' THEN 3
          WHEN 'nurturing'     THEN 4
          WHEN 'won'           THEN 5
          WHEN 'lost'          THEN 6
          WHEN 'junk'          THEN 7
          ELSE 8
        END
      ) FROM status_totals WHERE cnt > 0),
      '[]'::jsonb
    ),
    'byAgent', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'agent_id',   assigned_to,
          'agent_name', agent_name,
          'counts',     counts,
          'total',      total
        )
        ORDER BY total DESC
      ) FROM agent_counts),
      '[]'::jsonb
    )
  )
  INTO v_lead_status;

  -- ─────────────────────────────────────────────────────────────────
  -- 4. Campaigns — date filter applied to created_at
  -- ─────────────────────────────────────────────────────────────────
  WITH campaign_rows AS (
    SELECT
      utm_campaign AS campaign,
      status
    FROM leads
    WHERE archived_at IS NULL
      AND utm_campaign IS NOT NULL
      AND (
        CASE
          WHEN p_role = 'manager'
            THEN domain = p_domain
          WHEN p_initial_domain IS NOT NULL
            THEN domain = p_initial_domain
          ELSE
            TRUE
        END
      )
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to   IS NULL OR created_at <  p_date_to)
  ),
  campaign_agg AS (
    SELECT
      campaign,
      COUNT(*)::int AS total,
      jsonb_object_agg(status, cnt) AS mix
    FROM (
      SELECT campaign, status, COUNT(*)::int AS cnt
      FROM campaign_rows
      GROUP BY campaign, status
    ) sub
    GROUP BY campaign
    ORDER BY total DESC
    LIMIT 12
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'campaign', campaign,
        'total',    total,
        'mix',      mix
      )
      ORDER BY total DESC
    ),
    '[]'::jsonb
  )
  INTO v_campaigns
  FROM campaign_agg;

  -- ─────────────────────────────────────────────────────────────────
  -- 5. Cold leads count
  --    Threshold: 5 days — matches COLD_LEAD_THRESHOLD_DAYS constant.
  --    NULL last_activity_at is intentionally excluded (< never matches NULL).
  --    Date filter (p_date_from/p_date_to) intentionally NOT applied here;
  --    "going cold" is a live state, not a cohort metric.
  -- ─────────────────────────────────────────────────────────────────
  SELECT COUNT(*)::int
  INTO v_cold_leads_count
  FROM leads l
  WHERE l.archived_at IS NULL
    AND l.status NOT IN ('won', 'lost', 'junk')
    AND l.last_activity_at < v_now - interval '5 days'
    AND (
      p_role IN ('admin', 'founder')
      OR (p_role = 'manager' AND l.domain = p_domain)
    );

  -- ─────────────────────────────────────────────────────────────────
  -- Assemble result
  -- ─────────────────────────────────────────────────────────────────
  v_result := jsonb_build_object(
    'agent_tasks',      v_agent_tasks,
    'agent_activity',   v_activity,
    'lead_status',      v_lead_status,
    'campaigns',        v_campaigns,
    'cold_leads_count', v_cold_leads_count
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION public.get_dashboard_summary(p_role text, p_domain public.app_domain, p_user_id uuid, p_initial_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) OWNER TO postgres;

--
-- Name: get_deals_summary(text, text, text, uuid, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_deals_summary(p_role text, p_caller_domain text, p_filter_domain text DEFAULT NULL::text, p_agent_id uuid DEFAULT NULL::uuid, p_deal_type text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(total_deals integer, total_revenue numeric, membership_count integer, retail_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::int                                                  AS total_deals,
    COALESCE(SUM(d.deal_amount), 0)                               AS total_revenue,
    COUNT(*) FILTER (WHERE d.deal_type = 'membership')::int       AS membership_count,
    COUNT(*) FILTER (WHERE d.deal_type = 'retail')::int           AS retail_count
  FROM public.deals d
  WHERE d.archived_at IS NULL
    -- ── Role-level gates (A-09 / Q-13: manager gate uses p_caller_domain only) ──
    AND CASE
          WHEN p_role = 'agent'   THEN d.assigned_to = p_agent_id
          WHEN p_role = 'manager' THEN d.domain = p_caller_domain::app_domain
          ELSE TRUE                   -- admin / founder: optional slice below
        END
    -- ── Admin/founder optional domain slice (p_filter_domain — user-supplied) ──
    -- This branch is NEVER reached for manager (already gated above).
    AND (
      p_role IN ('admin', 'founder') IS FALSE
      OR p_filter_domain IS NULL
      OR d.domain = p_filter_domain::app_domain
    )
    -- ── Admin/founder optional agent slice ──
    AND (
      p_role IN ('admin', 'founder') IS FALSE
      OR p_agent_id IS NULL
      OR d.assigned_to = p_agent_id
    )
    -- ── Optional deal-type filter ──
    AND (p_deal_type IS NULL OR d.deal_type = p_deal_type)
    -- ── Date range — applied to won_at ──
    AND (p_date_from IS NULL OR d.won_at >= p_date_from)
    AND (p_date_to   IS NULL OR d.won_at <= p_date_to);
END;
$$;


ALTER FUNCTION public.get_deals_summary(p_role text, p_caller_domain text, p_filter_domain text, p_agent_id uuid, p_deal_type text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) OWNER TO postgres;

--
-- Name: get_domain_health_metrics(public.app_domain[], timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_domain_health_metrics(p_domains public.app_domain[], p_date_from timestamp with time zone, p_date_to timestamp with time zone) RETURNS TABLE(domain public.app_domain, total_leads bigint, leads_won bigint, leads_lost bigint, calls_logged bigint, in_discussion bigint, nurturing bigint, total_calls_made bigint, total_revenue numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH

  -- driving row source: one row per requested domain
  domains AS (
    SELECT UNNEST(p_domains) AS d
  ),

  -- cohort: leads created in range (touch rate denominator, lead lifecycle metric)
  cohort AS (
    SELECT domain, COUNT(*) AS total_leads
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- closures: won/lost counts filtered by status_changed_at (lead lifecycle metric)
  -- revenue is no longer here — it comes from public.deals below
  closures AS (
    SELECT
      domain,
      COUNT(*) FILTER (WHERE status = 'won')  AS leads_won,
      COUNT(*) FILTER (WHERE status = 'lost') AS leads_lost
    FROM   leads
    WHERE  archived_at IS NULL
      AND  status IN ('won', 'lost')
      AND  status_changed_at >= p_date_from
      AND  status_changed_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- revenue: from public.deals filtered by won_at (deals system)
  revenue AS (
    SELECT
      domain,
      COALESCE(SUM(deal_amount), 0) AS total_revenue
    FROM   deals
    WHERE  archived_at IS NULL
      AND  won_at >= p_date_from
      AND  won_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- pipeline: live snapshot — no date filter
  pipeline AS (
    SELECT
      domain,
      COUNT(*) FILTER (WHERE status = 'in_discussion') AS in_discussion,
      COUNT(*) FILTER (WHERE status = 'nurturing')     AS nurturing
    FROM   leads
    WHERE  archived_at IS NULL
      AND  status IN ('in_discussion', 'nurturing')
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  ),

  -- calls: lead_notes with call_outcome set, joined to leads for domain
  calls AS (
    SELECT
      l.domain,
      COUNT(*) AS calls_logged
    FROM   lead_notes ln
    JOIN   leads      l  ON l.id = ln.lead_id
    WHERE  l.archived_at   IS NULL
      AND  ln.call_outcome IS NOT NULL
      AND  ln.created_at   >= p_date_from
      AND  ln.created_at   <= p_date_to
      AND  l.domain = ANY(p_domains)
    GROUP  BY l.domain
  ),

  -- total_calls_made: SUM(call_count) on cohort leads (created_at in range)
  calls_made AS (
    SELECT
      domain,
      COALESCE(SUM(call_count), 0) AS total_calls_made
    FROM   leads
    WHERE  archived_at IS NULL
      AND  created_at >= p_date_from
      AND  created_at <= p_date_to
      AND  domain = ANY(p_domains)
    GROUP  BY domain
  )

  SELECT
    domains.d                                    AS domain,
    COALESCE(cohort.total_leads,          0)     AS total_leads,
    COALESCE(closures.leads_won,          0)     AS leads_won,
    COALESCE(closures.leads_lost,         0)     AS leads_lost,
    COALESCE(calls.calls_logged,          0)     AS calls_logged,
    COALESCE(pipeline.in_discussion,      0)     AS in_discussion,
    COALESCE(pipeline.nurturing,          0)     AS nurturing,
    COALESCE(calls_made.total_calls_made, 0)     AS total_calls_made,
    COALESCE(revenue.total_revenue,       0)     AS total_revenue
  FROM    domains
  LEFT JOIN cohort      ON cohort.domain      = domains.d
  LEFT JOIN closures    ON closures.domain    = domains.d
  LEFT JOIN revenue     ON revenue.domain     = domains.d
  LEFT JOIN pipeline    ON pipeline.domain    = domains.d
  LEFT JOIN calls       ON calls.domain       = domains.d
  LEFT JOIN calls_made  ON calls_made.domain  = domains.d;
$$;


ALTER FUNCTION public.get_domain_health_metrics(p_domains public.app_domain[], p_date_from timestamp with time zone, p_date_to timestamp with time zone) OWNER TO postgres;

--
-- Name: get_gia_tasks(uuid, text, public.app_domain); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_gia_tasks(p_user_id uuid, p_role text, p_domain public.app_domain) RETURNS TABLE(id uuid, assigned_to uuid, created_by uuid, module text, task_type text, title text, description text, status text, priority text, task_category text, group_id uuid, due_at timestamp with time zone, completed_at timestamp with time zone, attachments jsonb, tags text[], created_at timestamp with time zone, updated_at timestamp with time zone, lead_id uuid, lead_first_name text, lead_last_name text, lead_phone text, lead_slug text, lead_domain public.app_domain)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.assigned_to,
    t.created_by,
    t.module,
    t.task_type,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.task_category,
    t.group_id,
    t.due_at,
    t.completed_at,
    t.attachments,
    t.tags,
    t.created_at,
    t.updated_at,
    m.lead_id,
    l.first_name  AS lead_first_name,
    l.last_name   AS lead_last_name,
    l.phone       AS lead_phone,
    l.slug        AS lead_slug,
    l.domain      AS lead_domain
  FROM tasks t
  INNER JOIN task_gia_meta m ON m.task_id = t.id
  INNER JOIN leads          l ON l.id     = m.lead_id
  WHERE
    t.task_category = 'gia_followup'
    AND (
      CASE
        WHEN p_role = 'agent'
          THEN t.assigned_to = p_user_id
        ELSE
          l.domain = p_domain
      END
    )
  ORDER BY
    CASE
      WHEN t.status IN ('to_do', 'in_progress', 'in_review') THEN 0
      ELSE 1
    END ASC,
    t.due_at ASC NULLS LAST,
    t.created_at ASC;
END;
$$;


ALTER FUNCTION public.get_gia_tasks(p_user_id uuid, p_role text, p_domain public.app_domain) OWNER TO postgres;

--
-- Name: get_group_task_summaries(text[], text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_group_task_summaries(p_status text[] DEFAULT NULL::text[], p_priority text[] DEFAULT NULL::text[]) RETURNS TABLE(id uuid, title text, description text, priority text, status text, due_at timestamp with time zone, created_by uuid, domain text, created_at timestamp with time zone, updated_at timestamp with time zone, subtask_total bigint, subtask_completed bigint, assignee_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    tg.id,
    tg.title,
    tg.description,
    tg.priority,
    tg.status,
    tg.due_at,
    tg.created_by,
    tg.domain::text,
    tg.created_at,
    tg.updated_at,
    COUNT(t.id)                                                                  AS subtask_total,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')                           AS subtask_completed,
    array_agg(DISTINCT t.assigned_to) FILTER (WHERE t.assigned_to IS NOT NULL)  AS assignee_ids
  FROM task_groups tg
  LEFT JOIN tasks t
    ON t.group_id = tg.id
   AND t.task_category = 'group_subtask'
  WHERE
    -- Flat visibility: creator OR subtask assignee — no role/domain branching.
    -- auth.uid() resolves from the calling session JWT inside SECURITY DEFINER.
    (
      tg.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM tasks sub
        WHERE sub.group_id = tg.id
          AND sub.assigned_to = auth.uid()
          AND sub.task_category = 'group_subtask'
      )
    )
    AND (p_status   IS NULL OR tg.status   = ANY(p_status))
    AND (p_priority IS NULL OR tg.priority = ANY(p_priority))
  GROUP BY
    tg.id, tg.title, tg.description, tg.priority, tg.status,
    tg.due_at, tg.created_by, tg.domain, tg.created_at, tg.updated_at
  ORDER BY tg.created_at DESC;
$$;


ALTER FUNCTION public.get_group_task_summaries(p_status text[], p_priority text[]) OWNER TO postgres;

--
-- Name: get_lead_pipeline_refresh(text, public.app_domain); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH lead_rows AS (
    SELECT
      l.status,
      l.assigned_to,
      pr.full_name AS agent_name
    FROM leads l
    LEFT JOIN profiles pr ON pr.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND (
        CASE
          WHEN p_role = 'manager' THEN l.domain = p_domain
          ELSE TRUE  -- admin/founder: no domain filter
        END
      )
  ),
  status_totals AS (
    SELECT
      status,
      COUNT(*)::int AS cnt
    FROM lead_rows
    GROUP BY status
  ),
  agent_counts AS (
    SELECT
      assigned_to,
      MAX(agent_name) AS agent_name,
      COUNT(*)::int AS total,
      jsonb_object_agg(status, cnt) AS counts
    FROM (
      SELECT assigned_to, agent_name, status, COUNT(*)::int AS cnt
      FROM lead_rows
      WHERE assigned_to IS NOT NULL
      GROUP BY assigned_to, agent_name, status
    ) sub
    GROUP BY assigned_to
  )
  SELECT jsonb_build_object(
    'totals', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt) ORDER BY
        CASE status
          WHEN 'new'           THEN 1
          WHEN 'touched'       THEN 2
          WHEN 'in_discussion' THEN 3
          WHEN 'nurturing'     THEN 4
          WHEN 'won'           THEN 5
          WHEN 'lost'          THEN 6
          WHEN 'junk'          THEN 7
          ELSE 8
        END
      ) FROM status_totals WHERE cnt > 0),
      '[]'::jsonb
    ),
    'byAgent', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'agent_id',   assigned_to,
          'agent_name', agent_name,
          'counts',     counts,
          'total',      total
        )
        ORDER BY total DESC
      ) FROM agent_counts),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain) OWNER TO postgres;

--
-- Name: get_lead_pipeline_refresh(text, public.app_domain, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH lead_rows AS (
    SELECT
      l.status,
      l.assigned_to,
      pr.full_name AS agent_name
    FROM leads l
    LEFT JOIN profiles pr ON pr.id = l.assigned_to
    WHERE l.archived_at IS NULL
      AND (
        CASE
          WHEN p_role = 'manager' THEN l.domain = p_domain
          ELSE TRUE
        END
      )
      AND (p_date_from IS NULL OR l.created_at >= p_date_from)
      AND (p_date_to   IS NULL OR l.created_at <  p_date_to)
  ),
  status_totals AS (
    SELECT
      status,
      COUNT(*)::int AS cnt
    FROM lead_rows
    GROUP BY status
  ),
  agent_counts AS (
    SELECT
      assigned_to,
      MAX(agent_name) AS agent_name,
      SUM(cnt)::int AS total,
      jsonb_object_agg(status, cnt) AS counts
    FROM (
      SELECT assigned_to, agent_name, status, COUNT(*)::int AS cnt
      FROM lead_rows
      WHERE assigned_to IS NOT NULL
      GROUP BY assigned_to, agent_name, status
    ) sub
    GROUP BY assigned_to
  )
  SELECT jsonb_build_object(
    'totals', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt) ORDER BY
        CASE status
          WHEN 'new'           THEN 1
          WHEN 'touched'       THEN 2
          WHEN 'in_discussion' THEN 3
          WHEN 'nurturing'     THEN 4
          WHEN 'won'           THEN 5
          WHEN 'lost'          THEN 6
          WHEN 'junk'          THEN 7
          ELSE 8
        END
      ) FROM status_totals WHERE cnt > 0),
      '[]'::jsonb
    ),
    'byAgent', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'agent_id',   assigned_to,
          'agent_name', agent_name,
          'counts',     counts,
          'total',      total
        )
        ORDER BY total DESC
      ) FROM agent_counts),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) OWNER TO postgres;

--
-- Name: get_leads_status_counts(uuid, timestamp with time zone, timestamp with time zone, text, text, text, text[], text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_leads_status_counts(p_agent_id uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_campaign text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_outcomes text[] DEFAULT NULL::text[], p_statuses text[] DEFAULT NULL::text[]) RETURNS TABLE(status text, cnt bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role   text := get_user_role();
  v_domain app_domain := get_user_domain();
BEGIN
  RETURN QUERY
  SELECT
    l.status::text,
    COUNT(*)::bigint
  FROM leads l
  WHERE
    l.archived_at IS NULL

    -- Role/domain constraints — mirrors RLS SELECT policies exactly
    AND CASE
      WHEN v_role = 'agent'   THEN l.assigned_to = auth.uid()
      WHEN v_role = 'manager' THEN l.domain = v_domain
      ELSE TRUE  -- admin / founder: no domain restriction
    END

    -- Optional: agent_id filter (manager/admin/founder only — agent role constraint already wins)
    AND (p_agent_id IS NULL OR l.assigned_to = p_agent_id)

    -- Optional: date range
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <  p_date_to)

    -- Optional: campaign
    AND (p_campaign IS NULL OR l.utm_campaign = p_campaign)

    -- Optional: search — parameterised LIKE via CONCAT (never string concatenation)
    AND (
      p_search IS NULL
      OR l.first_name ILIKE '%' || p_search || '%'
      OR l.last_name  ILIKE '%' || p_search || '%'
      OR l.phone      ILIKE '%' || p_search || '%'
    )

    -- Optional: source
    AND (p_source IS NULL OR l.source = p_source)

    -- Optional: last_call_outcome — treat empty array as "no filter"
    AND (
      p_outcomes IS NULL
      OR array_length(p_outcomes, 1) IS NULL
      OR array_length(p_outcomes, 1) = 0
      OR l.last_call_outcome::text = ANY(p_outcomes)
    )

    -- Optional: status filter — treat empty array as "no filter"
    AND (
      p_statuses IS NULL
      OR array_length(p_statuses, 1) IS NULL
      OR array_length(p_statuses, 1) = 0
      OR l.status::text = ANY(p_statuses)
    )

  GROUP BY l.status;
END;
$$;


ALTER FUNCTION public.get_leads_status_counts(p_agent_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_campaign text, p_search text, p_source text, p_outcomes text[], p_statuses text[]) OWNER TO postgres;

--
-- Name: get_next_round_robin_agent(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_next_round_robin_agent(p_domain text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  -- Step 1: pick from agents that HAVE a routing config row.
  -- Lock the routing config row to serialize concurrent picks.
  -- SKIP LOCKED: if another concurrent call already locked this agent's row,
  -- skip it and pick the next — no blocking, no deadlock.
  SELECT p.id
    INTO v_agent_id
    FROM agent_routing_config arc
    JOIN profiles p ON p.id = arc.agent_id
    LEFT JOIN (
      SELECT assigned_to, MAX(assigned_at) AS last_assigned_at
        FROM leads
       WHERE archived_at IS NULL
         AND assigned_to IS NOT NULL
       GROUP BY assigned_to
    ) last ON last.assigned_to = p.id
   WHERE p.domain      = p_domain::app_domain
     AND p.role        = 'agent'
     AND p.is_active   = true
     AND p.is_on_leave = false
     AND arc.is_active = true
   ORDER BY last.last_assigned_at ASC NULLS FIRST, p.id ASC
   LIMIT 1
   FOR UPDATE OF arc SKIP LOCKED;

  -- Step 2: if no agent with a config row was found, fall back to agents
  -- without a routing config row (treated as active by default).
  -- These are rare (trigger failure / pre-migration agents) so no lock needed.
  IF v_agent_id IS NULL THEN
    SELECT p.id
      INTO v_agent_id
      FROM profiles p
      LEFT JOIN agent_routing_config arc ON arc.agent_id = p.id
      LEFT JOIN (
        SELECT assigned_to, MAX(assigned_at) AS last_assigned_at
          FROM leads
         WHERE archived_at IS NULL
           AND assigned_to IS NOT NULL
         GROUP BY assigned_to
      ) last ON last.assigned_to = p.id
     WHERE p.domain      = p_domain::app_domain
       AND p.role        = 'agent'
       AND p.is_active   = true
       AND p.is_on_leave = false
       AND arc.agent_id  IS NULL   -- no routing config row exists
     ORDER BY last.last_assigned_at ASC NULLS FIRST, p.id ASC
     LIMIT 1;
  END IF;

  RETURN v_agent_id;  -- NULL if pool is empty
END;
$$;


ALTER FUNCTION public.get_next_round_robin_agent(p_domain text) OWNER TO postgres;

--
-- Name: get_personal_tasks(uuid, text[], text[], text[], timestamp with time zone, integer, uuid, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_personal_tasks(p_user_id uuid, p_status text[] DEFAULT NULL::text[], p_priority text[] DEFAULT NULL::text[], p_tags text[] DEFAULT NULL::text[], p_due_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 51, p_cursor_id uuid DEFAULT NULL::uuid, p_cursor_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_has_due_at boolean DEFAULT NULL::boolean) RETURNS SETOF public.tasks
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT *
  FROM tasks
  WHERE task_category = 'personal'
    AND assigned_to   = p_user_id
    -- ── Standard filters ──────────────────────────────────────────────────
    AND (p_status     IS NULL OR status   = ANY(p_status))
    AND (p_priority   IS NULL OR priority = ANY(p_priority))
    AND (p_tags       IS NULL OR tags     @> p_tags)
    AND (p_due_before IS NULL OR due_at  <= p_due_before)
    -- ── Cursor condition ──────────────────────────────────────────────────
    -- Three distinct cases depending on whether a cursor is present and
    -- whether the cursor row had a deadline. Cases are explicit WHEN branches
    -- (not collapsed) to prevent inter-case row leakage.
    AND CASE
          -- Case 1: No cursor — first page, all rows pass.
          WHEN p_cursor_id IS NULL THEN
            TRUE

          -- Case 2: Cursor row had a deadline (due_at IS NOT NULL).
          -- Return rows that sort after the cursor in (due_at ASC NULLS LAST, id ASC):
          --   • later due_at                           → row comes after
          --   • same due_at but later id               → same bucket, later position
          --   • no deadline (NULL)                     → NULL always sorts last, so all
          --                                               no-deadline rows come after any
          --                                               row with a deadline
          WHEN p_cursor_has_due_at = TRUE THEN
            due_at > p_cursor_due_at
            OR (due_at = p_cursor_due_at AND id > p_cursor_id)
            OR due_at IS NULL

          -- Case 3: Cursor row had no deadline (due_at IS NULL).
          -- All rows with a deadline already appeared on a prior page.
          -- Only remaining no-deadline rows after the cursor id are valid.
          WHEN p_cursor_has_due_at = FALSE THEN
            due_at IS NULL AND id > p_cursor_id

          -- Safety fallback (should never be reached given the caller always
          -- passes either NULL or a boolean for p_cursor_has_due_at).
          ELSE TRUE
        END
  ORDER BY
    due_at ASC NULLS LAST,
    CASE priority
      WHEN 'urgent' THEN 1
      WHEN 'high'   THEN 2
      ELSE               3
    END ASC,
    id ASC
  LIMIT p_limit;
$$;


ALTER FUNCTION public.get_personal_tasks(p_user_id uuid, p_status text[], p_priority text[], p_tags text[], p_due_before timestamp with time zone, p_limit integer, p_cursor_id uuid, p_cursor_due_at timestamp with time zone, p_cursor_has_due_at boolean) OWNER TO postgres;

--
-- Name: get_user_domain(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_user_domain() RETURNS public.app_domain
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT domain FROM profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION public.get_user_domain() OWNER TO postgres;

--
-- Name: get_user_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_user_role() RETURNS public.user_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION public.get_user_role() OWNER TO postgres;

--
-- Name: get_wa_unread_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_wa_unread_count() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COUNT(*)::integer
  FROM whatsapp_conversations wc
  LEFT JOIN whatsapp_conversation_reads wcr
    ON wcr.conversation_id = wc.id
    AND wcr.agent_id = auth.uid()
  WHERE wc.status = 'open'
    AND (
      wcr.last_read_at IS NULL
      OR wc.last_message_at > wcr.last_read_at
    )
    AND can_access_wa_conversation(wc.lead_id)
$$;


ALTER FUNCTION public.get_wa_unread_count() OWNER TO postgres;

--
-- Name: handle_agent_routing_config(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_agent_routing_config() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- INSERT case: new agent profile
  IF (TG_OP = 'INSERT' AND NEW.role = 'agent') THEN
    INSERT INTO agent_routing_config (agent_id, is_active)
    VALUES (NEW.id, true)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;

  -- UPDATE case: role changed to agent (e.g. promoted/changed)
  IF (TG_OP = 'UPDATE' AND NEW.role = 'agent' AND OLD.role <> 'agent') THEN
    INSERT INTO agent_routing_config (agent_id, is_active)
    VALUES (NEW.id, true)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.handle_agent_routing_config() OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: log_profile_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_profile_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _actor uuid;
BEGIN
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


ALTER FUNCTION public.log_profile_changes() OWNER TO postgres;

--
-- Name: log_task_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_task_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _actor uuid;
BEGIN
  -- Prefer the authenticated session user.
  -- auth.uid() is NULL for service-role writes (e.g. Trigger.dev callbacks,
  -- admin bulk operations). In that case fall back to NEW.assigned_to as a
  -- best-effort attribution. Known limitation: a reassignment write by service
  -- role will record the NEW assignee as the changer, not the actual initiator.
  -- This is documented here and in CLAUDE.md. Do not add a changed_by column
  -- to tasks to "fix" this — the complexity is not worth it.
  _actor := COALESCE(auth.uid(), NEW.assigned_to);

  -- Log only these six fields. All other columns are intentionally excluded:
  --   task_category: immutable after creation.
  --   group_id:      immutable after creation.
  --   created_at:    metadata, not business state.
  --   updated_at:    derived, not business state.
  --   completed_at:  derived from status transition, already captured via status.

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'title', OLD.title, NEW.title);
  END IF;

  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'description', OLD.description, NEW.description);
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'status', OLD.status, NEW.status);
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'priority', OLD.priority, NEW.priority);
  END IF;

  IF OLD.due_at IS DISTINCT FROM NEW.due_at THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'due_at', OLD.due_at::text, NEW.due_at::text);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO task_audit_log (task_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, _actor, 'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.log_task_changes() OWNER TO postgres;

--
-- Name: set_lead_slug(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_lead_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.phone IS NOT NULL THEN
    NEW.slug := generate_lead_slug(NEW.first_name, NEW.last_name, NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_lead_slug() OWNER TO postgres;

--
-- Name: update_lead_status(uuid, uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_lead_status(p_lead_id uuid, p_actor_id uuid, p_status text, p_reason text DEFAULT NULL::text, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old_status  text;
  v_assigned_to uuid;
  v_domain      text;
  v_first_name  text;
  v_last_name   text;
  v_task_id     uuid;
  v_details     jsonb;
BEGIN
  -- 1. Fetch current lead state
  SELECT status, assigned_to, domain, first_name, last_name
    INTO v_old_status, v_assigned_to, v_domain, v_first_name, v_last_name
    FROM leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  -- 2. Early return if status unchanged
  IF v_old_status = p_status THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  -- 3. Update lead: status, status_changed_at, last_activity_at
  UPDATE leads
     SET status            = p_status,
         status_changed_at = p_now,
         last_activity_at  = p_now
   WHERE id = p_lead_id;

  -- 4. Persist resolution_reason to column:
  --    - junk/lost with a reason → write the reason
  --    - in_discussion (revive from junk) → clear it
  --    - p_reason IS NULL and not a revive → no-op (column unchanged)
  IF p_reason IS NOT NULL THEN
    UPDATE leads SET resolution_reason = p_reason WHERE id = p_lead_id;
  ELSIF p_status = 'in_discussion' THEN
    UPDATE leads SET resolution_reason = NULL WHERE id = p_lead_id;
  END IF;

  -- 5. Build activity details (include reason if provided)
  v_details := jsonb_build_object('old_status', v_old_status, 'new_status', p_status);
  IF p_reason IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('reason', p_reason);
  END IF;

  -- 6. Log status_changed activity
  INSERT INTO lead_activities (lead_id, actor_id, action_type, details)
  VALUES (p_lead_id, p_actor_id, 'status_changed', v_details);

  -- 7. Nurturing: auto-create follow-up task + task_gia_meta (3 months out)
  --    title is NOT NULL (migration 0017) and task_category must be 'gia_followup'
  IF p_status = 'nurturing' THEN
    INSERT INTO tasks (
      title,
      assigned_to,
      created_by,
      module,
      task_type,
      task_category,
      status,
      due_at
    )
    VALUES (
      'Nurturing follow-up',
      COALESCE(v_assigned_to, p_actor_id),
      p_actor_id,
      'gia',
      'other',
      'gia_followup',
      'to_do',
      p_now + INTERVAL '3 months'
    )
    RETURNING id INTO v_task_id;

    INSERT INTO task_gia_meta (task_id, lead_id, call_outcome)
    VALUES (v_task_id, p_lead_id, NULL);
  END IF;

  -- 8. Return data the action layer needs for notifications and SLA side-effects
  RETURN jsonb_build_object(
    'changed',      true,
    'old_status',   v_old_status,
    'new_status',   p_status,
    'assigned_to',  v_assigned_to,
    'domain',       v_domain,
    'first_name',   v_first_name,
    'last_name',    v_last_name
  );
END;
$$;


ALTER FUNCTION public.update_lead_status(p_lead_id uuid, p_actor_id uuid, p_status text, p_reason text, p_now timestamp with time zone) OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$$;


ALTER FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) OWNER TO supabase_admin;

--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


ALTER FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) OWNER TO supabase_admin;

--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


ALTER FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) OWNER TO supabase_admin;

--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


ALTER FUNCTION realtime."cast"(val text, type_ regtype) OWNER TO supabase_admin;

--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


ALTER FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) OWNER TO supabase_admin;

--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


ALTER FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) OWNER TO supabase_admin;

--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


ALTER FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) OWNER TO supabase_admin;

--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$$;


ALTER FUNCTION realtime.quote_wal2json(entity regclass) OWNER TO supabase_admin;

--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


ALTER FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) OWNER TO supabase_admin;

--
-- Name: send_binary(bytea, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


ALTER FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) OWNER TO supabase_admin;

--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    col_names text[] = coalesce(
            array_agg(c.column_name order by c.ordinal_position),
            '{}'::text[]
        )
        from
            information_schema.columns c
        where
            format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                format('%I.%I', c.table_schema, c.table_name)::regclass,
                c.column_name,
                'SELECT'
            );
    table_col_names text[] = coalesce(
            array_agg(pa.attname),
            '{}'::text[]
        )
        from
            pg_attribute pa
        where
            pa.attrelid = new.entity
            and pa.attnum > 0;
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        -- Filtered column is valid
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        -- Type is sanitized and safe for string interpolation
        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;
        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        else
            -- raises an exception if value is not coercable to type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    -- Validate that selected_columns reference columns the role can SELECT
    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint on
    -- (subscription_id, entity, filters) can't be tricked by a different filter order
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value),
        '{}'
    ) from unnest(new.filters) f;

    -- Normalize selected_columns order so ARRAY['a','b'] and ARRAY['b','a'] are
    -- treated as the same subscription group in apply_rls
    new.selected_columns = (
        select array_agg(c order by c)
        from unnest(new.selected_columns) c
    );

    return new;
end;
$$;


ALTER FUNCTION realtime.subscription_check_filters() OWNER TO supabase_admin;

--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


ALTER FUNCTION realtime.to_regrole(role_name text) OWNER TO supabase_admin;

--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


ALTER FUNCTION realtime.topic() OWNER TO supabase_realtime_admin;

--
-- Name: wal2json_escape_identifier(text); Type: FUNCTION; Schema: realtime; Owner: supabase_admin
--

CREATE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$$;


ALTER FUNCTION realtime.wal2json_escape_identifier(name text) OWNER TO supabase_admin;

--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


ALTER FUNCTION storage.allow_any_operation(expected_operations text[]) OWNER TO supabase_storage_admin;

--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


ALTER FUNCTION storage.allow_only_operation(expected_operation text) OWNER TO supabase_storage_admin;

--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) OWNER TO supabase_storage_admin;

--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


ALTER FUNCTION storage.enforce_bucket_name_length() OWNER TO supabase_storage_admin;

--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION storage.extension(name text) OWNER TO supabase_storage_admin;

--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION storage.filename(name text) OWNER TO supabase_storage_admin;

--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


ALTER FUNCTION storage.foldername(name text) OWNER TO supabase_storage_admin;

--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


ALTER FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) OWNER TO supabase_storage_admin;

--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION storage.get_size_by_bucket() OWNER TO supabase_storage_admin;

--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer, next_key_token text, next_upload_token text) OWNER TO supabase_storage_admin;

--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer, start_after text, next_token text, sort_order text) OWNER TO supabase_storage_admin;

--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION storage.operation() OWNER TO supabase_storage_admin;

--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION storage.protect_delete() OWNER TO supabase_storage_admin;

--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text) OWNER TO supabase_storage_admin;

--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


ALTER FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) OWNER TO supabase_storage_admin;

--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


ALTER FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer, levels integer, start_after text, sort_order text, sort_column text, sort_column_after text) OWNER TO supabase_storage_admin;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


ALTER FUNCTION storage.update_updated_at_column() OWNER TO supabase_storage_admin;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE auth.audit_log_entries OWNER TO supabase_auth_admin;

--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


ALTER TABLE auth.custom_oauth_providers OWNER TO supabase_auth_admin;

--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


ALTER TABLE auth.flow_state OWNER TO supabase_auth_admin;

--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE auth.identities OWNER TO supabase_auth_admin;

--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE auth.instances OWNER TO supabase_auth_admin;

--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


ALTER TABLE auth.mfa_amr_claims OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


ALTER TABLE auth.mfa_challenges OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


ALTER TABLE auth.mfa_factors OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


ALTER TABLE auth.oauth_authorizations OWNER TO supabase_auth_admin;

--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE auth.oauth_client_states OWNER TO supabase_auth_admin;

--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


ALTER TABLE auth.oauth_clients OWNER TO supabase_auth_admin;

--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


ALTER TABLE auth.oauth_consents OWNER TO supabase_auth_admin;

--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


ALTER TABLE auth.one_time_tokens OWNER TO supabase_auth_admin;

--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


ALTER TABLE auth.refresh_tokens OWNER TO supabase_auth_admin;

--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: supabase_auth_admin
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.refresh_tokens_id_seq OWNER TO supabase_auth_admin;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: supabase_auth_admin
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


ALTER TABLE auth.saml_providers OWNER TO supabase_auth_admin;

--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


ALTER TABLE auth.saml_relay_states OWNER TO supabase_auth_admin;

--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


ALTER TABLE auth.schema_migrations OWNER TO supabase_auth_admin;

--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;

--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


ALTER TABLE auth.sso_domains OWNER TO supabase_auth_admin;

--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


ALTER TABLE auth.sso_providers OWNER TO supabase_auth_admin;

--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


ALTER TABLE auth.users OWNER TO supabase_auth_admin;

--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


ALTER TABLE auth.webauthn_challenges OWNER TO supabase_auth_admin;

--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


ALTER TABLE auth.webauthn_credentials OWNER TO supabase_auth_admin;

--
-- Name: ad_creatives; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ad_creatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_key text NOT NULL,
    ad_name text,
    video_url text NOT NULL,
    thumbnail_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ad_creatives_campaign_key_normalised CHECK ((campaign_key = lower(TRIM(BOTH FROM campaign_key))))
);


ALTER TABLE public.ad_creatives OWNER TO postgres;

--
-- Name: agent_routing_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_routing_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    shift_start time without time zone,
    shift_end time without time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    shift_days integer[]
);


ALTER TABLE public.agent_routing_config OWNER TO postgres;

--
-- Name: COLUMN agent_routing_config.shift_days; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.agent_routing_config.shift_days IS 'JS day-of-week array (0=Sun…6=Sat). NULL = use global BUSINESS_HOURS.
   Min 1 element when set. Stored and displayed Mon-first (1-6,0) in UI.';


--
-- Name: deals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    client_id uuid,
    contact_name text NOT NULL,
    contact_phone text NOT NULL,
    contact_email text,
    domain public.app_domain NOT NULL,
    deal_amount numeric(12,2) NOT NULL,
    deal_type text NOT NULL,
    deal_duration text,
    assigned_to uuid,
    won_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text,
    CONSTRAINT deals_deal_amount_check CHECK (((deal_amount > (0)::numeric) AND (deal_amount <= (100000000)::numeric))),
    CONSTRAINT deals_deal_duration_check CHECK (((deal_duration IS NULL) OR (deal_duration = ANY (ARRAY['3_months'::text, '6_months'::text, '1_year'::text])))),
    CONSTRAINT deals_deal_type_check CHECK ((deal_type = ANY (ARRAY['membership'::text, 'retail'::text]))),
    CONSTRAINT deals_membership_duration_check CHECK (((deal_type <> 'membership'::text) OR (deal_duration IS NOT NULL))),
    CONSTRAINT deals_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['meta'::text, 'google'::text, 'website'::text, 'whatsapp'::text, 'referral'::text, 'ypo'::text, 'events'::text]))))
);


ALTER TABLE public.deals OWNER TO postgres;

--
-- Name: TABLE deals; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.deals IS 'All writes via SECURITY DEFINER RPCs only. Direct INSERT/DELETE blocked by
   RLS policy gap — this is intentional. See supabase/migrations/0094.';


--
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    action_type text NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lead_activities OWNER TO postgres;

--
-- Name: TABLE lead_activities; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.lead_activities IS 'Append-only activity log. Valid action_type values:
   lead_created | status_changed | note_added | agent_assigned |
   call_logged  | duplicate_submission';


--
-- Name: COLUMN lead_activities.action_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.lead_activities.action_type IS 'lead_created | status_changed | note_added | agent_assigned | call_logged | duplicate_submission | sla_breach';


--
-- Name: lead_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    call_outcome text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lead_notes OWNER TO postgres;

--
-- Name: lead_raw_payloads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_raw_payloads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    source text NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    ingestion_error text
);


ALTER TABLE public.lead_raw_payloads OWNER TO postgres;

--
-- Name: COLUMN lead_raw_payloads.ingestion_error; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.lead_raw_payloads.ingestion_error IS 'Null on success. Error reason string when ingestion failed. Never updated after set.';


--
-- Name: lead_sla_timers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_sla_timers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    rule_code text NOT NULL,
    scheduled_fire_at timestamp with time zone NOT NULL,
    trigger_run_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    fired_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_sla_timers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'fired'::text, 'cancelled'::text])))
);


ALTER TABLE public.lead_sla_timers OWNER TO postgres;

--
-- Name: leads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text,
    email text,
    phone text,
    domain public.app_domain NOT NULL,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    status text DEFAULT 'new'::text NOT NULL,
    lead_intent text,
    source text,
    medium text,
    utm_campaign text,
    form_data jsonb,
    call_count integer DEFAULT 0 NOT NULL,
    last_call_outcome text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    previous_lead_id uuid,
    personal_details jsonb,
    status_changed_at timestamp with time zone,
    last_activity_at timestamp with time zone,
    slug text,
    resolution_reason text,
    attribution jsonb,
    city text
);


ALTER TABLE public.leads OWNER TO postgres;

--
-- Name: COLUMN leads.personal_details; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.leads.personal_details IS 'Agent-collected biographical/preference enrichment. Mutable. Keys are open-ended.';


--
-- Name: COLUMN leads.attribution; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.leads.attribution IS 'Full attribution snapshot at ingestion time. Immutable after insert.
   Contains all UTM and platform fields available from the webhook payload:
   utm_source, utm_medium, utm_campaign, utm_content, platform, ad_name,
   campaign_id, and any other attribution fields present on the normalized
   payload. The flat columns (source, medium, utm_campaign) are indexed
   and used for filtering. This column is the complete historical record
   for future analysis. Never updated after the lead row is created.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    action_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_action_url_check CHECK (((action_url IS NULL) OR (action_url !~~ 'http%'::text))),
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['lead_assigned'::text, 'lead_won'::text, 'task_due'::text, 'task_assigned'::text, 'mention'::text, 'system'::text, 'sla_breach_agent'::text, 'sla_breach_manager'::text])))
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: profile_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profile_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    changed_by uuid NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text
);


ALTER TABLE public.profile_audit_log OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    username text,
    email text NOT NULL,
    phone text,
    avatar_url text,
    role public.user_role DEFAULT 'agent'::public.user_role NOT NULL,
    domain public.app_domain DEFAULT 'concierge'::public.app_domain NOT NULL,
    job_title text,
    reports_to uuid,
    is_active boolean DEFAULT true NOT NULL,
    is_on_leave boolean DEFAULT false NOT NULL,
    theme text DEFAULT 'earth'::text NOT NULL,
    timezone text DEFAULT 'Asia/Kolkata'::text NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_avatar_url_check CHECK ((char_length(avatar_url) < 500)),
    CONSTRAINT profiles_full_name_check CHECK (((char_length(full_name) >= 1) AND (char_length(full_name) <= 100))),
    CONSTRAINT profiles_job_title_check CHECK ((char_length(job_title) < 100)),
    CONSTRAINT profiles_theme_check CHECK ((theme = ANY (ARRAY['earth'::text, 'air'::text, 'water'::text, 'fire'::text, 'cosmos'::text]))),
    CONSTRAINT profiles_username_check CHECK (((char_length(username) >= 3) AND (char_length(username) <= 30)))
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: task_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    changed_by uuid NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.task_audit_log OWNER TO postgres;

--
-- Name: task_gia_meta; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_gia_meta (
    task_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    call_outcome text
);


ALTER TABLE public.task_gia_meta OWNER TO postgres;

--
-- Name: task_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'to_do'::text NOT NULL,
    due_at timestamp with time zone,
    created_by uuid NOT NULL,
    domain public.app_domain NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_groups_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'normal'::text]))),
    CONSTRAINT task_groups_status_check CHECK ((status = ANY (ARRAY['to_do'::text, 'in_progress'::text, 'in_review'::text, 'completed'::text, 'error'::text, 'cancelled'::text])))
);


ALTER TABLE public.task_groups OWNER TO postgres;

--
-- Name: whatsapp_conversation_reads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_conversation_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.whatsapp_conversation_reads OWNER TO postgres;

--
-- Name: whatsapp_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    wa_id text NOT NULL,
    phone text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    last_message_at timestamp with time zone,
    bot_active boolean DEFAULT true NOT NULL,
    bot_paused_by uuid,
    bot_paused_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])))
);


ALTER TABLE public.whatsapp_conversations OWNER TO postgres;

--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    direction text NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    wa_message_id text,
    message_type text NOT NULL,
    content text,
    media_url text,
    media_mime_type text,
    status text DEFAULT 'sent'::text,
    status_at timestamp with time zone,
    is_bot boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT whatsapp_messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'document'::text, 'audio'::text, 'template'::text]))),
    CONSTRAINT whatsapp_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['lead'::text, 'agent'::text, 'bot'::text]))),
    CONSTRAINT whatsapp_messages_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);


ALTER TABLE public.whatsapp_messages OWNER TO postgres;

--
-- Name: whatsapp_notification_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_notification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    lead_id uuid,
    recipient_id uuid,
    recipient_phone text NOT NULL,
    agent_name text,
    lead_name text,
    lead_phone text,
    domain public.app_domain,
    gupshup_status integer,
    gupshup_body text,
    delivered boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_notification_logs_type_check CHECK ((type = ANY (ARRAY['agent_assignment'::text, 'founder_alert'::text, 'sla_breach'::text, 'lead_initiation'::text])))
);


ALTER TABLE public.whatsapp_notification_logs OWNER TO postgres;

--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea
)
PARTITION BY RANGE (inserted_at);


ALTER TABLE realtime.messages OWNER TO supabase_realtime_admin;

--
-- Name: messages_2026_06_05; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_06_05 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea
);


ALTER TABLE realtime.messages_2026_06_05 OWNER TO supabase_admin;

--
-- Name: messages_2026_06_06; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_06_06 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_06_06 OWNER TO supabase_admin;

--
-- Name: messages_2026_06_07; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_06_07 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_06_07 OWNER TO supabase_admin;

--
-- Name: messages_2026_06_08; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_06_08 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_06_08 OWNER TO supabase_admin;

--
-- Name: messages_2026_06_09; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_06_09 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_06_09 OWNER TO supabase_admin;

--
-- Name: messages_2026_06_10; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_06_10 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_06_10 OWNER TO supabase_admin;

--
-- Name: messages_2026_06_11; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.messages_2026_06_11 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_06_11 OWNER TO supabase_admin;

--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


ALTER TABLE realtime.schema_migrations OWNER TO supabase_admin;

--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    selected_columns text[],
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


ALTER TABLE realtime.subscription OWNER TO supabase_admin;

--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;

--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: supabase_storage_admin
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE storage.buckets_analytics OWNER TO supabase_storage_admin;

--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.buckets_vectors OWNER TO supabase_storage_admin;

--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE storage.migrations OWNER TO supabase_storage_admin;

--
-- Name: objects; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


ALTER TABLE storage.objects OWNER TO supabase_storage_admin;

--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: supabase_storage_admin
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


ALTER TABLE storage.s3_multipart_uploads OWNER TO supabase_storage_admin;

--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.s3_multipart_uploads_parts OWNER TO supabase_storage_admin;

--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.vector_indexes OWNER TO supabase_storage_admin;

--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: postgres
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;

--
-- Name: messages_2026_06_05; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_06_05 FOR VALUES FROM ('2026-06-05 00:00:00') TO ('2026-06-06 00:00:00');


--
-- Name: messages_2026_06_06; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_06_06 FOR VALUES FROM ('2026-06-06 00:00:00') TO ('2026-06-07 00:00:00');


--
-- Name: messages_2026_06_07; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_06_07 FOR VALUES FROM ('2026-06-07 00:00:00') TO ('2026-06-08 00:00:00');


--
-- Name: messages_2026_06_08; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_06_08 FOR VALUES FROM ('2026-06-08 00:00:00') TO ('2026-06-09 00:00:00');


--
-- Name: messages_2026_06_09; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_06_09 FOR VALUES FROM ('2026-06-09 00:00:00') TO ('2026-06-10 00:00:00');


--
-- Name: messages_2026_06_10; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_06_10 FOR VALUES FROM ('2026-06-10 00:00:00') TO ('2026-06-11 00:00:00');


--
-- Name: messages_2026_06_11; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_06_11 FOR VALUES FROM ('2026-06-11 00:00:00') TO ('2026-06-12 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: ad_creatives ad_creatives_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_creatives
    ADD CONSTRAINT ad_creatives_pkey PRIMARY KEY (id);


--
-- Name: agent_routing_config agent_routing_config_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_routing_config
    ADD CONSTRAINT agent_routing_config_agent_id_key UNIQUE (agent_id);


--
-- Name: agent_routing_config agent_routing_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_routing_config
    ADD CONSTRAINT agent_routing_config_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- Name: lead_notes lead_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_pkey PRIMARY KEY (id);


--
-- Name: lead_raw_payloads lead_raw_payloads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_raw_payloads
    ADD CONSTRAINT lead_raw_payloads_pkey PRIMARY KEY (id);


--
-- Name: lead_sla_timers lead_sla_timers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_sla_timers
    ADD CONSTRAINT lead_sla_timers_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profile_audit_log profile_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profile_audit_log
    ADD CONSTRAINT profile_audit_log_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: task_audit_log task_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_audit_log
    ADD CONSTRAINT task_audit_log_pkey PRIMARY KEY (id);


--
-- Name: task_gia_meta task_gia_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_gia_meta
    ADD CONSTRAINT task_gia_meta_pkey PRIMARY KEY (task_id);


--
-- Name: task_groups task_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_groups
    ADD CONSTRAINT task_groups_pkey PRIMARY KEY (id);


--
-- Name: task_remarks task_remarks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_remarks
    ADD CONSTRAINT task_remarks_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_conversation_reads whatsapp_conversation_reads_conversation_id_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversation_reads
    ADD CONSTRAINT whatsapp_conversation_reads_conversation_id_agent_id_key UNIQUE (conversation_id, agent_id);


--
-- Name: whatsapp_conversation_reads whatsapp_conversation_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversation_reads
    ADD CONSTRAINT whatsapp_conversation_reads_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_conversations whatsapp_conversations_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_lead_id_key UNIQUE (lead_id);


--
-- Name: whatsapp_conversations whatsapp_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_conversations whatsapp_conversations_wa_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_wa_id_key UNIQUE (wa_id);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_notification_logs whatsapp_notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_logs
    ADD CONSTRAINT whatsapp_notification_logs_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_06_05 messages_2026_06_05_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_06_05
    ADD CONSTRAINT messages_2026_06_05_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_06_06 messages_2026_06_06_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_06_06
    ADD CONSTRAINT messages_2026_06_06_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_06_07 messages_2026_06_07_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_06_07
    ADD CONSTRAINT messages_2026_06_07_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_06_08 messages_2026_06_08_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_06_08
    ADD CONSTRAINT messages_2026_06_08_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_06_09 messages_2026_06_09_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_06_09
    ADD CONSTRAINT messages_2026_06_09_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_06_10 messages_2026_06_10_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_06_10
    ADD CONSTRAINT messages_2026_06_10_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_06_11 messages_2026_06_11_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.messages_2026_06_11
    ADD CONSTRAINT messages_2026_06_11_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages messages_payload_exclusive; Type: CHECK CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE realtime.messages
    ADD CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL))) NOT VALID;


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: postgres
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: idx_users_created_at_desc; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_email ON auth.users USING btree (email);


--
-- Name: idx_users_last_sign_in_at_desc; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);


--
-- Name: idx_users_name; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: deals_assigned_to_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deals_assigned_to_idx ON public.deals USING btree (assigned_to) WHERE (archived_at IS NULL);


--
-- Name: deals_contact_phone_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deals_contact_phone_idx ON public.deals USING btree (contact_phone);


--
-- Name: deals_domain_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deals_domain_idx ON public.deals USING btree (domain) WHERE (archived_at IS NULL);


--
-- Name: deals_lead_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deals_lead_id_idx ON public.deals USING btree (lead_id);


--
-- Name: deals_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deals_source_idx ON public.deals USING btree (source) WHERE ((archived_at IS NULL) AND (source IS NOT NULL));


--
-- Name: deals_won_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deals_won_at_idx ON public.deals USING btree (won_at DESC) WHERE (archived_at IS NULL);


--
-- Name: idx_ad_creatives_campaign_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ad_creatives_campaign_key ON public.ad_creatives USING btree (campaign_key);


--
-- Name: idx_agent_routing_config_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agent_routing_config_active ON public.agent_routing_config USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_agent_routing_config_agent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agent_routing_config_agent_id ON public.agent_routing_config USING btree (agent_id);


--
-- Name: idx_lead_activities_actor_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_activities_actor_status ON public.lead_activities USING btree (actor_id, action_type, created_at DESC);


--
-- Name: idx_lead_activities_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_activities_lead_id ON public.lead_activities USING btree (lead_id, created_at DESC);


--
-- Name: idx_lead_notes_author_outcome; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_notes_author_outcome ON public.lead_notes USING btree (author_id, created_at DESC);


--
-- Name: idx_lead_notes_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_notes_lead_id ON public.lead_notes USING btree (lead_id, created_at DESC);


--
-- Name: idx_lead_raw_payloads_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_raw_payloads_lead_id ON public.lead_raw_payloads USING btree (lead_id);


--
-- Name: idx_lead_raw_payloads_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_raw_payloads_source ON public.lead_raw_payloads USING btree (source, received_at DESC);


--
-- Name: idx_lead_sla_timers_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_sla_timers_lead_id ON public.lead_sla_timers USING btree (lead_id);


--
-- Name: idx_lead_sla_timers_lead_rule; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_sla_timers_lead_rule ON public.lead_sla_timers USING btree (lead_id, rule_code);


--
-- Name: idx_lead_sla_timers_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_sla_timers_pending ON public.lead_sla_timers USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_leads_assigned_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_assigned_status_created ON public.leads USING btree (assigned_to, status, created_at DESC) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_assigned_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_assigned_to ON public.leads USING btree (assigned_to) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_assigned_to_assigned_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_assigned_to_assigned_at ON public.leads USING btree (assigned_to, assigned_at DESC) WHERE ((archived_at IS NULL) AND (assigned_to IS NOT NULL));


--
-- Name: idx_leads_campaign_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_campaign_domain ON public.leads USING btree (utm_campaign, domain) WHERE ((archived_at IS NULL) AND (utm_campaign IS NOT NULL));


--
-- Name: idx_leads_campaign_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_campaign_status ON public.leads USING btree (utm_campaign, status) WHERE ((archived_at IS NULL) AND (utm_campaign IS NOT NULL));


--
-- Name: idx_leads_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_created_at ON public.leads USING btree (created_at DESC) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_domain_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_domain_status ON public.leads USING btree (domain, status) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_last_activity_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_last_activity_at ON public.leads USING btree (last_activity_at) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_last_call_outcome; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_last_call_outcome ON public.leads USING btree (last_call_outcome) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_phone ON public.leads USING btree (phone);


--
-- Name: idx_leads_phone_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_phone_active ON public.leads USING btree (phone) WHERE ((archived_at IS NULL) AND (phone IS NOT NULL) AND (phone <> ''::text));


--
-- Name: idx_leads_phone_text; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_phone_text ON public.leads USING btree (phone text_pattern_ops) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_previous_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_previous_lead_id ON public.leads USING btree (previous_lead_id) WHERE (previous_lead_id IS NOT NULL);


--
-- Name: idx_leads_resolution_reason; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_resolution_reason ON public.leads USING btree (resolution_reason) WHERE ((status = ANY (ARRAY['junk'::text, 'lost'::text])) AND (archived_at IS NULL));


--
-- Name: idx_leads_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_leads_slug ON public.leads USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: idx_leads_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_source ON public.leads USING btree (source) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_status_changed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_status_changed_at ON public.leads USING btree (status_changed_at) WHERE (archived_at IS NULL);


--
-- Name: idx_leads_utm_campaign; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_utm_campaign ON public.leads USING btree (utm_campaign) WHERE (archived_at IS NULL);


--
-- Name: idx_notifications_recipient_all; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_recipient_all ON public.notifications USING btree (recipient_id, created_at DESC);


--
-- Name: idx_notifications_recipient_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_recipient_unread ON public.notifications USING btree (recipient_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: idx_profiles_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_domain ON public.profiles USING btree (domain);


--
-- Name: idx_profiles_domain_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_domain_active ON public.profiles USING btree (domain) WHERE (is_active = true);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_task_audit_log_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_audit_log_task_id ON public.task_audit_log USING btree (task_id, changed_at DESC);


--
-- Name: idx_task_gia_meta_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_gia_meta_lead_id ON public.task_gia_meta USING btree (lead_id);


--
-- Name: idx_task_groups_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_groups_created_by ON public.task_groups USING btree (created_by);


--
-- Name: idx_task_groups_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_groups_domain ON public.task_groups USING btree (domain) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text]));


--
-- Name: idx_task_remarks_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_remarks_task_id ON public.task_remarks USING btree (task_id, created_at);


--
-- Name: idx_tasks_agent_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_agent_active ON public.tasks USING btree (assigned_to, task_category, due_at) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text, 'error'::text]));


--
-- Name: idx_tasks_assigned_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to, due_at) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text, 'error'::text]));


--
-- Name: idx_tasks_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_category ON public.tasks USING btree (task_category) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text]));


--
-- Name: idx_tasks_group_assignee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_group_assignee ON public.tasks USING btree (group_id, assigned_to) WHERE (task_category = 'group_subtask'::text);


--
-- Name: idx_tasks_group_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_group_id ON public.tasks USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: idx_tasks_module; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_module ON public.tasks USING btree (module, assigned_to) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text, 'error'::text]));


--
-- Name: idx_tasks_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_priority ON public.tasks USING btree (priority, due_at) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text]));


--
-- Name: idx_tasks_tags_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_tags_active ON public.tasks USING btree (assigned_to) INCLUDE (tags) WHERE ((task_category = 'personal'::text) AND (status <> ALL (ARRAY['completed'::text, 'cancelled'::text, 'error'::text])));


--
-- Name: idx_tasks_tags_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_tags_gin ON public.tasks USING gin (tags) WHERE (task_category = 'personal'::text);


--
-- Name: idx_wa_conversations_last_message; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wa_conversations_last_message ON public.whatsapp_conversations USING btree (last_message_at DESC) WHERE (status = 'open'::text);


--
-- Name: idx_wa_conversations_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wa_conversations_lead_id ON public.whatsapp_conversations USING btree (lead_id);


--
-- Name: idx_wa_messages_conversation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wa_messages_conversation_id ON public.whatsapp_messages USING btree (conversation_id, created_at);


--
-- Name: idx_wa_messages_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wa_messages_lead_id ON public.whatsapp_messages USING btree (lead_id, created_at DESC);


--
-- Name: idx_wa_messages_wa_message_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_wa_messages_wa_message_id ON public.whatsapp_messages USING btree (wa_message_id) WHERE (wa_message_id IS NOT NULL);


--
-- Name: idx_wa_notif_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wa_notif_logs_created_at ON public.whatsapp_notification_logs USING btree (created_at DESC);


--
-- Name: idx_wa_notif_logs_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wa_notif_logs_lead_id ON public.whatsapp_notification_logs USING btree (lead_id);


--
-- Name: idx_wa_reads_agent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wa_reads_agent_id ON public.whatsapp_conversation_reads USING btree (agent_id);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_06_05_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_06_05_inserted_at_topic_idx ON realtime.messages_2026_06_05 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_06_06_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_06_06_inserted_at_topic_idx ON realtime.messages_2026_06_06 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_06_07_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_06_07_inserted_at_topic_idx ON realtime.messages_2026_06_07 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_06_08_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_06_08_inserted_at_topic_idx ON realtime.messages_2026_06_08 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_06_09_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_06_09_inserted_at_topic_idx ON realtime.messages_2026_06_09 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_06_10_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_06_10_inserted_at_topic_idx ON realtime.messages_2026_06_10 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_06_11_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE INDEX messages_2026_06_11_inserted_at_topic_idx ON realtime.messages_2026_06_11 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_selec; Type: INDEX; Schema: realtime; Owner: supabase_admin
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]));


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2026_06_05_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_06_05_inserted_at_topic_idx;


--
-- Name: messages_2026_06_05_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_06_05_pkey;


--
-- Name: messages_2026_06_06_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_06_06_inserted_at_topic_idx;


--
-- Name: messages_2026_06_06_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_06_06_pkey;


--
-- Name: messages_2026_06_07_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_06_07_inserted_at_topic_idx;


--
-- Name: messages_2026_06_07_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_06_07_pkey;


--
-- Name: messages_2026_06_08_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_06_08_inserted_at_topic_idx;


--
-- Name: messages_2026_06_08_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_06_08_pkey;


--
-- Name: messages_2026_06_09_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_06_09_inserted_at_topic_idx;


--
-- Name: messages_2026_06_09_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_06_09_pkey;


--
-- Name: messages_2026_06_10_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_06_10_inserted_at_topic_idx;


--
-- Name: messages_2026_06_10_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_06_10_pkey;


--
-- Name: messages_2026_06_11_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_06_11_inserted_at_topic_idx;


--
-- Name: messages_2026_06_11_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_06_11_pkey;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: supabase_auth_admin
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: agent_routing_config agent_routing_config_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER agent_routing_config_updated_at BEFORE UPDATE ON public.agent_routing_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: leads leads_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles on_agent_profile_created; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_agent_profile_created AFTER INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_agent_routing_config();


--
-- Name: profiles profiles_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER profiles_audit AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.log_profile_changes();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: task_groups task_groups_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER task_groups_updated_at BEFORE UPDATE ON public.task_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tasks tasks_audit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tasks_audit AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.log_task_changes();


--
-- Name: tasks tasks_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: leads trg_lead_slug; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_lead_slug BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_lead_slug();


--
-- Name: whatsapp_conversations whatsapp_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER whatsapp_conversations_updated_at BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: supabase_admin
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_routing_config agent_routing_config_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_routing_config
    ADD CONSTRAINT agent_routing_config_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: deals deals_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: deals deals_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: lead_activities lead_activities_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: lead_activities lead_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: lead_notes lead_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: lead_notes lead_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: lead_raw_payloads lead_raw_payloads_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_raw_payloads
    ADD CONSTRAINT lead_raw_payloads_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: lead_sla_timers lead_sla_timers_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_sla_timers
    ADD CONSTRAINT lead_sla_timers_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: leads leads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: leads leads_previous_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_previous_lead_id_fkey FOREIGN KEY (previous_lead_id) REFERENCES public.leads(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_audit_log profile_audit_log_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profile_audit_log
    ADD CONSTRAINT profile_audit_log_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_reports_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_reports_to_fkey FOREIGN KEY (reports_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: task_audit_log task_audit_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_audit_log
    ADD CONSTRAINT task_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id);


--
-- Name: task_audit_log task_audit_log_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_audit_log
    ADD CONSTRAINT task_audit_log_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_gia_meta task_gia_meta_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_gia_meta
    ADD CONSTRAINT task_gia_meta_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: task_gia_meta task_gia_meta_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_gia_meta
    ADD CONSTRAINT task_gia_meta_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_groups task_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_groups
    ADD CONSTRAINT task_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: task_remarks task_remarks_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_remarks
    ADD CONSTRAINT task_remarks_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: task_remarks task_remarks_suppressed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_remarks
    ADD CONSTRAINT task_remarks_suppressed_by_fkey FOREIGN KEY (suppressed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: task_remarks task_remarks_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_remarks
    ADD CONSTRAINT task_remarks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: tasks tasks_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.task_groups(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversation_reads whatsapp_conversation_reads_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversation_reads
    ADD CONSTRAINT whatsapp_conversation_reads_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversation_reads whatsapp_conversation_reads_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversation_reads
    ADD CONSTRAINT whatsapp_conversation_reads_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_bot_paused_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_bot_paused_by_fkey FOREIGN KEY (bot_paused_by) REFERENCES public.profiles(id);


--
-- Name: whatsapp_conversations whatsapp_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: whatsapp_notification_logs whatsapp_notification_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_logs
    ADD CONSTRAINT whatsapp_notification_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: whatsapp_notification_logs whatsapp_notification_logs_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_notification_logs
    ADD CONSTRAINT whatsapp_notification_logs_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_creatives; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_creatives ad_creatives_delete_admin_founder; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ad_creatives_delete_admin_founder ON public.ad_creatives FOR DELETE TO authenticated USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: ad_creatives ad_creatives_insert_admin_founder; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ad_creatives_insert_admin_founder ON public.ad_creatives FOR INSERT TO authenticated WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: ad_creatives ad_creatives_select_authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ad_creatives_select_authenticated ON public.ad_creatives FOR SELECT TO authenticated USING (true);


--
-- Name: ad_creatives ad_creatives_update_admin_founder; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ad_creatives_update_admin_founder ON public.ad_creatives FOR UPDATE TO authenticated USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: agent_routing_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.agent_routing_config ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_audit_log audit_log_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY audit_log_select ON public.profile_audit_log FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: deals deals_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deals_admin_select ON public.deals FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: deals deals_agent_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deals_agent_select ON public.deals FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND (assigned_to = auth.uid())));


--
-- Name: deals deals_manager_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deals_manager_select ON public.deals FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND (domain = ( SELECT public.get_user_domain() AS get_user_domain))));


--
-- Name: lead_activities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_activities lead_activities_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lead_activities_select ON public.lead_activities FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_activities.lead_id) AND (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND (l.assigned_to = auth.uid())) OR ((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND (l.domain = ( SELECT public.get_user_domain() AS get_user_domain))) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))) AND (l.archived_at IS NULL)))));


--
-- Name: lead_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_notes lead_notes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lead_notes_select ON public.lead_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_notes.lead_id) AND (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND (l.assigned_to = auth.uid())) OR ((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND (l.domain = ( SELECT public.get_user_domain() AS get_user_domain))) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))) AND (l.archived_at IS NULL)))));


--
-- Name: lead_raw_payloads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lead_raw_payloads ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_raw_payloads lead_raw_payloads_admin_founder_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lead_raw_payloads_admin_founder_select ON public.lead_raw_payloads FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: lead_sla_timers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lead_sla_timers ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_sla_timers lead_sla_timers_admin_founder_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lead_sla_timers_admin_founder_select ON public.lead_sla_timers FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: lead_sla_timers lead_sla_timers_agent_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lead_sla_timers_agent_select ON public.lead_sla_timers FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_sla_timers.lead_id) AND (l.assigned_to = auth.uid()) AND (l.archived_at IS NULL))))));


--
-- Name: lead_sla_timers lead_sla_timers_manager_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lead_sla_timers_manager_select ON public.lead_sla_timers FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_sla_timers.lead_id) AND (l.domain = ( SELECT public.get_user_domain() AS get_user_domain)) AND (l.archived_at IS NULL))))));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_admin_founder_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY leads_admin_founder_select ON public.leads FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])) AND (archived_at IS NULL)));


--
-- Name: leads leads_agent_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY leads_agent_select ON public.leads FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND (assigned_to = auth.uid()) AND (archived_at IS NULL)));


--
-- Name: leads leads_manager_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY leads_manager_select ON public.leads FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND (domain = ( SELECT public.get_user_domain() AS get_user_domain)) AND (archived_at IS NULL)));


--
-- Name: leads leads_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY leads_update ON public.leads FOR UPDATE USING (((archived_at IS NULL) AND (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND (assigned_to = auth.uid())) OR ((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND (domain = ( SELECT public.get_user_domain() AS get_user_domain))) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING ((recipient_id = auth.uid()));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING ((recipient_id = auth.uid())) WITH CHECK ((recipient_id = auth.uid()));


--
-- Name: profile_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (((auth.uid() = id) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])))) WITH CHECK (((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])) OR ((auth.uid() = id) AND (role = ( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid()))) AND (domain = ( SELECT profiles_1.domain
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid()))))));


--
-- Name: agent_routing_config routing_config_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY routing_config_select ON public.agent_routing_config FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: agent_routing_config routing_config_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY routing_config_update ON public.agent_routing_config FOR UPDATE USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: task_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: task_audit_log task_audit_log_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_audit_log_select ON public.task_audit_log FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: task_gia_meta; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_gia_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: task_gia_meta task_gia_meta_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_gia_meta_select ON public.task_gia_meta FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_gia_meta.task_id) AND (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND (t.assigned_to = auth.uid())) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role])))))));


--
-- Name: task_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: task_groups task_groups_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_groups_delete ON public.task_groups FOR DELETE USING ((created_by = auth.uid()));


--
-- Name: task_groups task_groups_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_groups_insert ON public.task_groups FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: task_groups task_groups_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_groups_select ON public.task_groups FOR SELECT USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tasks
  WHERE ((tasks.group_id = task_groups.id) AND (tasks.assigned_to = auth.uid()) AND (tasks.task_category = 'group_subtask'::text))))));


--
-- Name: task_groups task_groups_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_groups_update ON public.task_groups FOR UPDATE USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tasks
  WHERE ((tasks.group_id = task_groups.id) AND (tasks.assigned_to = auth.uid()) AND (tasks.task_category = 'group_subtask'::text)))))) WITH CHECK (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tasks
  WHERE ((tasks.group_id = task_groups.id) AND (tasks.assigned_to = auth.uid()) AND (tasks.task_category = 'group_subtask'::text))))));


--
-- Name: task_remarks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_remarks ENABLE ROW LEVEL SECURITY;

--
-- Name: task_remarks task_remarks_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_remarks_insert ON public.task_remarks FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_remarks.task_id) AND ((t.assigned_to = auth.uid()) OR (t.created_by = auth.uid()) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))))))));


--
-- Name: task_remarks task_remarks_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_remarks_select ON public.task_remarks FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_remarks.task_id) AND ((t.assigned_to = auth.uid()) OR (t.created_by = auth.uid()) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role])))))));


--
-- Name: task_remarks task_remarks_suppression_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_remarks_suppression_update ON public.task_remarks FOR UPDATE USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))) WITH CHECK ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_agent_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_agent_select ON public.tasks FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND ((assigned_to = auth.uid()) OR (created_by = auth.uid()))));


--
-- Name: tasks tasks_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated USING (((task_category = 'personal'::text) AND (created_by = auth.uid()) AND (assigned_to = auth.uid()) AND (status = ANY (ARRAY['to_do'::text, 'in_progress'::text]))));


--
-- Name: tasks tasks_delete_privileged; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_delete_privileged ON public.tasks FOR DELETE TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: tasks tasks_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND (assigned_to = auth.uid()) AND (task_category = 'personal'::text)));


--
-- Name: tasks tasks_manager_admin_founder_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_manager_admin_founder_select ON public.tasks FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: tasks tasks_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_update ON public.tasks FOR UPDATE USING ((((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND (assigned_to = auth.uid())) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))));


--
-- Name: whatsapp_conversations wa_conversations_admin_founder_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_conversations_admin_founder_select ON public.whatsapp_conversations FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: whatsapp_conversations wa_conversations_agent_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_conversations_agent_select ON public.whatsapp_conversations FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND public.can_access_wa_conversation(lead_id)));


--
-- Name: whatsapp_conversations wa_conversations_manager_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_conversations_manager_select ON public.whatsapp_conversations FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND public.can_access_wa_conversation(lead_id)));


--
-- Name: whatsapp_conversations wa_conversations_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_conversations_update ON public.whatsapp_conversations FOR UPDATE USING ((((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND public.can_access_wa_conversation(lead_id)) OR ((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND public.can_access_wa_conversation(lead_id)) OR (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))));


--
-- Name: whatsapp_messages wa_messages_admin_founder_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_messages_admin_founder_select ON public.whatsapp_messages FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: whatsapp_messages wa_messages_agent_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_messages_agent_select ON public.whatsapp_messages FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'agent'::public.user_role) AND public.can_access_wa_conversation(lead_id)));


--
-- Name: whatsapp_messages wa_messages_manager_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_messages_manager_select ON public.whatsapp_messages FOR SELECT USING (((( SELECT public.get_user_role() AS get_user_role) = 'manager'::public.user_role) AND public.can_access_wa_conversation(lead_id)));


--
-- Name: whatsapp_messages wa_messages_outbound_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_messages_outbound_insert ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (((direction = 'outbound'::text) AND (sender_type = 'agent'::text) AND (sender_id = auth.uid()) AND public.can_access_wa_conversation(lead_id) AND (( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['agent'::public.user_role, 'manager'::public.user_role, 'admin'::public.user_role, 'founder'::public.user_role]))));


--
-- Name: whatsapp_notification_logs wa_notif_logs_admin_founder_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_notif_logs_admin_founder_select ON public.whatsapp_notification_logs FOR SELECT USING ((( SELECT public.get_user_role() AS get_user_role) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role])));


--
-- Name: whatsapp_conversation_reads wa_reads_agent_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_reads_agent_insert ON public.whatsapp_conversation_reads FOR INSERT WITH CHECK ((agent_id = auth.uid()));


--
-- Name: whatsapp_conversation_reads wa_reads_agent_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_reads_agent_select ON public.whatsapp_conversation_reads FOR SELECT USING ((agent_id = auth.uid()));


--
-- Name: whatsapp_conversation_reads wa_reads_agent_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wa_reads_agent_update ON public.whatsapp_conversation_reads FOR UPDATE USING ((agent_id = auth.uid()));


--
-- Name: whatsapp_conversation_reads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_conversation_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_notification_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_notification_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects ad_creatives_storage_delete; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY ad_creatives_storage_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'ad-creatives'::text) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))));


--
-- Name: objects ad_creatives_storage_insert; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY ad_creatives_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'ad-creatives'::text) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'founder'::public.user_role]))));


--
-- Name: objects avatars_delete_own; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text)));


--
-- Name: objects avatars_insert_own; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text)));


--
-- Name: objects avatars_public_read; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));


--
-- Name: objects avatars_update_own; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY avatars_update_own ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text))) WITH CHECK (((bucket_id = 'avatars'::text) AND (name = (auth.uid())::text)));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime OWNER TO postgres;

--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: supabase_admin
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime_messages_publication OWNER TO supabase_admin;

--
-- Name: supabase_realtime notifications; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.notifications;


--
-- Name: supabase_realtime task_remarks; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.task_remarks;


--
-- Name: supabase_realtime whatsapp_conversations; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.whatsapp_conversations;


--
-- Name: supabase_realtime whatsapp_messages; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.whatsapp_messages;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: supabase_admin
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT USAGE ON SCHEMA auth TO postgres;


--
-- Name: SCHEMA cron; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA cron TO postgres WITH GRANT OPTION;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA realtime TO postgres;
GRANT USAGE ON SCHEMA realtime TO anon;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT USAGE ON SCHEMA realtime TO service_role;
GRANT ALL ON SCHEMA realtime TO supabase_realtime_admin;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA storage TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- Name: SCHEMA vault; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA vault TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA vault TO service_role;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- Name: FUNCTION jwt(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.jwt() TO postgres;
GRANT ALL ON FUNCTION auth.jwt() TO dashboard_user;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- Name: FUNCTION alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION job_cache_invalidate(); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.job_cache_invalidate() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION schedule(schedule text, command text); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.schedule(schedule text, command text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION schedule(job_name text, schedule text, command text); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.schedule(job_name text, schedule text, command text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION schedule_in_database(job_name text, schedule text, command text, database text, username text, active boolean); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.schedule_in_database(job_name text, schedule text, command text, database text, username text, active boolean) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION unschedule(job_id bigint); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.unschedule(job_id bigint) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION unschedule(job_name text); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.unschedule(job_name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.armor(bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO dashboard_user;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.armor(bytea, text[], text[]) FROM postgres;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO dashboard_user;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.crypt(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO dashboard_user;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.dearmor(text) FROM postgres;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO dashboard_user;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.digest(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.digest(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO dashboard_user;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_random_bytes(integer) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO dashboard_user;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_random_uuid() FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO dashboard_user;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_salt(text) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO dashboard_user;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_salt(text, integer) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO dashboard_user;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.hmac(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.hmac(text, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO dashboard_user;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO dashboard_user;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_key_id(bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v1() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v1mc() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v4() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO dashboard_user;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_nil() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_dns() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_oid() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_url() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_x500() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO dashboard_user;


--
-- Name: FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb); Type: ACL; Schema: graphql_public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;


--
-- Name: FUNCTION pg_reload_conf(); Type: ACL; Schema: pg_catalog; Owner: supabase_admin
--

GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION get_auth(p_usename text); Type: ACL; Schema: pgbouncer; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;


--
-- Name: FUNCTION add_lead_call_note(p_lead_id uuid, p_author_id uuid, p_content text, p_call_outcome text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.add_lead_call_note(p_lead_id uuid, p_author_id uuid, p_content text, p_call_outcome text, p_now timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.add_lead_call_note(p_lead_id uuid, p_author_id uuid, p_content text, p_call_outcome text, p_now timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.add_lead_call_note(p_lead_id uuid, p_author_id uuid, p_content text, p_call_outcome text, p_now timestamp with time zone) TO service_role;


--
-- Name: FUNCTION add_lead_plain_note(p_lead_id uuid, p_author_id uuid, p_content text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.add_lead_plain_note(p_lead_id uuid, p_author_id uuid, p_content text, p_now timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.add_lead_plain_note(p_lead_id uuid, p_author_id uuid, p_content text, p_now timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.add_lead_plain_note(p_lead_id uuid, p_author_id uuid, p_content text, p_now timestamp with time zone) TO service_role;


--
-- Name: TABLE task_remarks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_remarks TO anon;
GRANT ALL ON TABLE public.task_remarks TO authenticated;
GRANT ALL ON TABLE public.task_remarks TO service_role;


--
-- Name: FUNCTION add_task_remark_with_status(p_task_id uuid, p_author_id uuid, p_content text, p_status_change text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.add_task_remark_with_status(p_task_id uuid, p_author_id uuid, p_content text, p_status_change text) TO anon;
GRANT ALL ON FUNCTION public.add_task_remark_with_status(p_task_id uuid, p_author_id uuid, p_content text, p_status_change text) TO authenticated;
GRANT ALL ON FUNCTION public.add_task_remark_with_status(p_task_id uuid, p_author_id uuid, p_content text, p_status_change text) TO service_role;


--
-- Name: FUNCTION can_access_wa_conversation(p_lead_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_access_wa_conversation(p_lead_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_access_wa_conversation(p_lead_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_wa_conversation(p_lead_id uuid) TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: FUNCTION create_lead_gia_task(p_lead_id uuid, p_assigned_to uuid, p_created_by uuid, p_task_type text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_lead_gia_task(p_lead_id uuid, p_assigned_to uuid, p_created_by uuid, p_task_type text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.create_lead_gia_task(p_lead_id uuid, p_assigned_to uuid, p_created_by uuid, p_task_type text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.create_lead_gia_task(p_lead_id uuid, p_assigned_to uuid, p_created_by uuid, p_task_type text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION generate_lead_slug(p_first_name text, p_last_name text, p_phone text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.generate_lead_slug(p_first_name text, p_last_name text, p_phone text) TO anon;
GRANT ALL ON FUNCTION public.generate_lead_slug(p_first_name text, p_last_name text, p_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.generate_lead_slug(p_first_name text, p_last_name text, p_phone text) TO service_role;


--
-- Name: FUNCTION get_active_lead_by_phone(p_phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_active_lead_by_phone(p_phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_active_lead_by_phone(p_phone text) TO anon;
GRANT ALL ON FUNCTION public.get_active_lead_by_phone(p_phone text) TO service_role;


--
-- Name: FUNCTION get_agent_recent_activity(p_role text, p_domain public.app_domain, p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_agent_recent_activity(p_role text, p_domain public.app_domain, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_agent_recent_activity(p_role text, p_domain public.app_domain, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_agent_recent_activity(p_role text, p_domain public.app_domain, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_campaign_agent_distribution(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_campaign_agent_distribution(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_campaign_agent_distribution(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_campaign_agent_distribution(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_campaign_detail_metrics(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_campaign_detail_metrics(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_campaign_detail_metrics(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_campaign_detail_metrics(p_campaign text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_campaign_metrics(p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_campaign_metrics(p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_campaign_metrics(p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_campaign_metrics(p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_campaign_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_campaign_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_campaign_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_campaign_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_dashboard_summary(p_role text, p_domain public.app_domain, p_user_id uuid, p_initial_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_dashboard_summary(p_role text, p_domain public.app_domain, p_user_id uuid, p_initial_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_dashboard_summary(p_role text, p_domain public.app_domain, p_user_id uuid, p_initial_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_summary(p_role text, p_domain public.app_domain, p_user_id uuid, p_initial_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_deals_summary(p_role text, p_caller_domain text, p_filter_domain text, p_agent_id uuid, p_deal_type text, p_date_from timestamp with time zone, p_date_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_deals_summary(p_role text, p_caller_domain text, p_filter_domain text, p_agent_id uuid, p_deal_type text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_deals_summary(p_role text, p_caller_domain text, p_filter_domain text, p_agent_id uuid, p_deal_type text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_deals_summary(p_role text, p_caller_domain text, p_filter_domain text, p_agent_id uuid, p_deal_type text, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_domain_health_metrics(p_domains public.app_domain[], p_date_from timestamp with time zone, p_date_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_domain_health_metrics(p_domains public.app_domain[], p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_domain_health_metrics(p_domains public.app_domain[], p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_domain_health_metrics(p_domains public.app_domain[], p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_gia_tasks(p_user_id uuid, p_role text, p_domain public.app_domain); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_gia_tasks(p_user_id uuid, p_role text, p_domain public.app_domain) TO anon;
GRANT ALL ON FUNCTION public.get_gia_tasks(p_user_id uuid, p_role text, p_domain public.app_domain) TO authenticated;
GRANT ALL ON FUNCTION public.get_gia_tasks(p_user_id uuid, p_role text, p_domain public.app_domain) TO service_role;


--
-- Name: FUNCTION get_group_task_summaries(p_status text[], p_priority text[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_group_task_summaries(p_status text[], p_priority text[]) TO anon;
GRANT ALL ON FUNCTION public.get_group_task_summaries(p_status text[], p_priority text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_group_task_summaries(p_status text[], p_priority text[]) TO service_role;


--
-- Name: FUNCTION get_lead_pipeline_refresh(p_role text, p_domain public.app_domain); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain) TO anon;
GRANT ALL ON FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain) TO authenticated;
GRANT ALL ON FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain) TO service_role;


--
-- Name: FUNCTION get_lead_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_lead_pipeline_refresh(p_role text, p_domain public.app_domain, p_date_from timestamp with time zone, p_date_to timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_leads_status_counts(p_agent_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_campaign text, p_search text, p_source text, p_outcomes text[], p_statuses text[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_leads_status_counts(p_agent_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_campaign text, p_search text, p_source text, p_outcomes text[], p_statuses text[]) TO anon;
GRANT ALL ON FUNCTION public.get_leads_status_counts(p_agent_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_campaign text, p_search text, p_source text, p_outcomes text[], p_statuses text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_leads_status_counts(p_agent_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_campaign text, p_search text, p_source text, p_outcomes text[], p_statuses text[]) TO service_role;


--
-- Name: FUNCTION get_next_round_robin_agent(p_domain text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_next_round_robin_agent(p_domain text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_next_round_robin_agent(p_domain text) TO anon;
GRANT ALL ON FUNCTION public.get_next_round_robin_agent(p_domain text) TO service_role;


--
-- Name: FUNCTION get_personal_tasks(p_user_id uuid, p_status text[], p_priority text[], p_tags text[], p_due_before timestamp with time zone, p_limit integer, p_cursor_id uuid, p_cursor_due_at timestamp with time zone, p_cursor_has_due_at boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_personal_tasks(p_user_id uuid, p_status text[], p_priority text[], p_tags text[], p_due_before timestamp with time zone, p_limit integer, p_cursor_id uuid, p_cursor_due_at timestamp with time zone, p_cursor_has_due_at boolean) TO anon;
GRANT ALL ON FUNCTION public.get_personal_tasks(p_user_id uuid, p_status text[], p_priority text[], p_tags text[], p_due_before timestamp with time zone, p_limit integer, p_cursor_id uuid, p_cursor_due_at timestamp with time zone, p_cursor_has_due_at boolean) TO authenticated;
GRANT ALL ON FUNCTION public.get_personal_tasks(p_user_id uuid, p_status text[], p_priority text[], p_tags text[], p_due_before timestamp with time zone, p_limit integer, p_cursor_id uuid, p_cursor_due_at timestamp with time zone, p_cursor_has_due_at boolean) TO service_role;


--
-- Name: FUNCTION get_user_domain(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_user_domain() TO anon;
GRANT ALL ON FUNCTION public.get_user_domain() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_domain() TO service_role;


--
-- Name: FUNCTION get_user_role(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_user_role() TO anon;
GRANT ALL ON FUNCTION public.get_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_role() TO service_role;


--
-- Name: FUNCTION get_wa_unread_count(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_wa_unread_count() TO anon;
GRANT ALL ON FUNCTION public.get_wa_unread_count() TO authenticated;
GRANT ALL ON FUNCTION public.get_wa_unread_count() TO service_role;


--
-- Name: FUNCTION handle_agent_routing_config(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_agent_routing_config() TO anon;
GRANT ALL ON FUNCTION public.handle_agent_routing_config() TO authenticated;
GRANT ALL ON FUNCTION public.handle_agent_routing_config() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION log_profile_changes(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.log_profile_changes() TO anon;
GRANT ALL ON FUNCTION public.log_profile_changes() TO authenticated;
GRANT ALL ON FUNCTION public.log_profile_changes() TO service_role;


--
-- Name: FUNCTION log_task_changes(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.log_task_changes() TO anon;
GRANT ALL ON FUNCTION public.log_task_changes() TO authenticated;
GRANT ALL ON FUNCTION public.log_task_changes() TO service_role;


--
-- Name: FUNCTION set_lead_slug(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_lead_slug() TO anon;
GRANT ALL ON FUNCTION public.set_lead_slug() TO authenticated;
GRANT ALL ON FUNCTION public.set_lead_slug() TO service_role;


--
-- Name: FUNCTION update_lead_status(p_lead_id uuid, p_actor_id uuid, p_status text, p_reason text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_lead_status(p_lead_id uuid, p_actor_id uuid, p_status text, p_reason text, p_now timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.update_lead_status(p_lead_id uuid, p_actor_id uuid, p_status text, p_reason text, p_now timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.update_lead_status(p_lead_id uuid, p_actor_id uuid, p_status text, p_reason text, p_now timestamp with time zone) TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: FUNCTION apply_rls(wal jsonb, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO service_role;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO supabase_realtime_admin;


--
-- Name: FUNCTION broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO postgres;
GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO dashboard_user;


--
-- Name: FUNCTION build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO postgres;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO anon;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO service_role;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO supabase_realtime_admin;


--
-- Name: FUNCTION "cast"(val text, type_ regtype); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO postgres;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO dashboard_user;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO anon;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO authenticated;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO service_role;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO supabase_realtime_admin;


--
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO service_role;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO supabase_realtime_admin;


--
-- Name: FUNCTION is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO postgres;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO anon;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO service_role;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO supabase_realtime_admin;


--
-- Name: FUNCTION list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO dashboard_user;


--
-- Name: FUNCTION quote_wal2json(entity regclass); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO postgres;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO anon;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO authenticated;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO service_role;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO supabase_realtime_admin;


--
-- Name: FUNCTION send(payload jsonb, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO dashboard_user;


--
-- Name: FUNCTION send_binary(payload bytea, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) TO dashboard_user;


--
-- Name: FUNCTION subscription_check_filters(); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO postgres;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO dashboard_user;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO anon;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO authenticated;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO service_role;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO supabase_realtime_admin;


--
-- Name: FUNCTION to_regrole(role_name text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO postgres;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO anon;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO authenticated;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO service_role;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO supabase_realtime_admin;


--
-- Name: FUNCTION topic(); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.topic() TO postgres;
GRANT ALL ON FUNCTION realtime.topic() TO dashboard_user;


--
-- Name: FUNCTION wal2json_escape_identifier(name text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.wal2json_escape_identifier(name text) TO postgres;
GRANT ALL ON FUNCTION realtime.wal2json_escape_identifier(name text) TO dashboard_user;


--
-- Name: FUNCTION _crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO service_role;


--
-- Name: FUNCTION create_secret(new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: FUNCTION update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.audit_log_entries TO postgres;
GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;


--
-- Name: TABLE custom_oauth_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.custom_oauth_providers TO postgres;
GRANT ALL ON TABLE auth.custom_oauth_providers TO dashboard_user;


--
-- Name: TABLE flow_state; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.flow_state TO postgres;
GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.flow_state TO dashboard_user;


--
-- Name: TABLE identities; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.identities TO dashboard_user;


--
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.instances TO postgres;
GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;


--
-- Name: TABLE mfa_amr_claims; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_amr_claims TO postgres;
GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_amr_claims TO dashboard_user;


--
-- Name: TABLE mfa_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_challenges TO postgres;
GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_challenges TO dashboard_user;


--
-- Name: TABLE mfa_factors; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_factors TO postgres;
GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_factors TO dashboard_user;


--
-- Name: TABLE oauth_authorizations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_authorizations TO postgres;
GRANT ALL ON TABLE auth.oauth_authorizations TO dashboard_user;


--
-- Name: TABLE oauth_client_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_client_states TO postgres;
GRANT ALL ON TABLE auth.oauth_client_states TO dashboard_user;


--
-- Name: TABLE oauth_clients; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_clients TO postgres;
GRANT ALL ON TABLE auth.oauth_clients TO dashboard_user;


--
-- Name: TABLE oauth_consents; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_consents TO postgres;
GRANT ALL ON TABLE auth.oauth_consents TO dashboard_user;


--
-- Name: TABLE one_time_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.one_time_tokens TO postgres;
GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.one_time_tokens TO dashboard_user;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.refresh_tokens TO postgres;
GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- Name: TABLE saml_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_providers TO postgres;
GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_providers TO dashboard_user;


--
-- Name: TABLE saml_relay_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_relay_states TO postgres;
GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_relay_states TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;


--
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sessions TO postgres;
GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sessions TO dashboard_user;


--
-- Name: TABLE sso_domains; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_domains TO postgres;
GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_domains TO dashboard_user;


--
-- Name: TABLE sso_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_providers TO postgres;
GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_providers TO dashboard_user;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;


--
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.webauthn_challenges TO postgres;
GRANT ALL ON TABLE auth.webauthn_challenges TO dashboard_user;


--
-- Name: TABLE webauthn_credentials; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.webauthn_credentials TO postgres;
GRANT ALL ON TABLE auth.webauthn_credentials TO dashboard_user;


--
-- Name: TABLE job; Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT SELECT ON TABLE cron.job TO postgres WITH GRANT OPTION;


--
-- Name: TABLE job_run_details; Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON TABLE cron.job_run_details TO postgres WITH GRANT OPTION;


--
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON TABLE extensions.pg_stat_statements FROM postgres;
GRANT ALL ON TABLE extensions.pg_stat_statements TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE extensions.pg_stat_statements TO dashboard_user;


--
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON TABLE extensions.pg_stat_statements_info FROM postgres;
GRANT ALL ON TABLE extensions.pg_stat_statements_info TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE extensions.pg_stat_statements_info TO dashboard_user;


--
-- Name: TABLE ad_creatives; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ad_creatives TO anon;
GRANT ALL ON TABLE public.ad_creatives TO authenticated;
GRANT ALL ON TABLE public.ad_creatives TO service_role;


--
-- Name: TABLE agent_routing_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.agent_routing_config TO anon;
GRANT ALL ON TABLE public.agent_routing_config TO authenticated;
GRANT ALL ON TABLE public.agent_routing_config TO service_role;


--
-- Name: TABLE deals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.deals TO anon;
GRANT ALL ON TABLE public.deals TO authenticated;
GRANT ALL ON TABLE public.deals TO service_role;


--
-- Name: TABLE lead_activities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lead_activities TO anon;
GRANT ALL ON TABLE public.lead_activities TO authenticated;
GRANT ALL ON TABLE public.lead_activities TO service_role;


--
-- Name: TABLE lead_notes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lead_notes TO anon;
GRANT ALL ON TABLE public.lead_notes TO authenticated;
GRANT ALL ON TABLE public.lead_notes TO service_role;


--
-- Name: TABLE lead_raw_payloads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lead_raw_payloads TO anon;
GRANT ALL ON TABLE public.lead_raw_payloads TO authenticated;
GRANT ALL ON TABLE public.lead_raw_payloads TO service_role;


--
-- Name: TABLE lead_sla_timers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lead_sla_timers TO anon;
GRANT ALL ON TABLE public.lead_sla_timers TO authenticated;
GRANT ALL ON TABLE public.lead_sla_timers TO service_role;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.leads TO anon;
GRANT ALL ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE profile_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profile_audit_log TO anon;
GRANT ALL ON TABLE public.profile_audit_log TO authenticated;
GRANT ALL ON TABLE public.profile_audit_log TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE task_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_audit_log TO anon;
GRANT ALL ON TABLE public.task_audit_log TO authenticated;
GRANT ALL ON TABLE public.task_audit_log TO service_role;


--
-- Name: TABLE task_gia_meta; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_gia_meta TO anon;
GRANT ALL ON TABLE public.task_gia_meta TO authenticated;
GRANT ALL ON TABLE public.task_gia_meta TO service_role;


--
-- Name: TABLE task_groups; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_groups TO anon;
GRANT ALL ON TABLE public.task_groups TO authenticated;
GRANT ALL ON TABLE public.task_groups TO service_role;


--
-- Name: TABLE whatsapp_conversation_reads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.whatsapp_conversation_reads TO anon;
GRANT ALL ON TABLE public.whatsapp_conversation_reads TO authenticated;
GRANT ALL ON TABLE public.whatsapp_conversation_reads TO service_role;


--
-- Name: TABLE whatsapp_conversations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.whatsapp_conversations TO anon;
GRANT ALL ON TABLE public.whatsapp_conversations TO authenticated;
GRANT ALL ON TABLE public.whatsapp_conversations TO service_role;


--
-- Name: TABLE whatsapp_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.whatsapp_messages TO anon;
GRANT ALL ON TABLE public.whatsapp_messages TO authenticated;
GRANT ALL ON TABLE public.whatsapp_messages TO service_role;


--
-- Name: TABLE whatsapp_notification_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.whatsapp_notification_logs TO anon;
GRANT ALL ON TABLE public.whatsapp_notification_logs TO authenticated;
GRANT ALL ON TABLE public.whatsapp_notification_logs TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages TO postgres;
GRANT ALL ON TABLE realtime.messages TO dashboard_user;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO service_role;


--
-- Name: TABLE messages_2026_06_05; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_06_05 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_06_05 TO dashboard_user;


--
-- Name: TABLE messages_2026_06_06; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_06_06 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_06_06 TO dashboard_user;


--
-- Name: TABLE messages_2026_06_07; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_06_07 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_06_07 TO dashboard_user;


--
-- Name: TABLE messages_2026_06_08; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_06_08 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_06_08 TO dashboard_user;


--
-- Name: TABLE messages_2026_06_09; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_06_09 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_06_09 TO dashboard_user;


--
-- Name: TABLE messages_2026_06_10; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_06_10 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_06_10 TO dashboard_user;


--
-- Name: TABLE messages_2026_06_11; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.messages_2026_06_11 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_06_11 TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.schema_migrations TO postgres;
GRANT ALL ON TABLE realtime.schema_migrations TO dashboard_user;
GRANT SELECT ON TABLE realtime.schema_migrations TO anon;
GRANT SELECT ON TABLE realtime.schema_migrations TO authenticated;
GRANT SELECT ON TABLE realtime.schema_migrations TO service_role;
GRANT ALL ON TABLE realtime.schema_migrations TO supabase_realtime_admin;


--
-- Name: TABLE subscription; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.subscription TO postgres;
GRANT ALL ON TABLE realtime.subscription TO dashboard_user;
GRANT SELECT ON TABLE realtime.subscription TO anon;
GRANT SELECT ON TABLE realtime.subscription TO authenticated;
GRANT SELECT ON TABLE realtime.subscription TO service_role;
GRANT ALL ON TABLE realtime.subscription TO supabase_realtime_admin;


--
-- Name: SEQUENCE subscription_id_seq; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO postgres;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO dashboard_user;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO anon;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO service_role;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO supabase_realtime_admin;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

REVOKE ALL ON TABLE storage.buckets FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.buckets TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO postgres WITH GRANT OPTION;


--
-- Name: TABLE buckets_analytics; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.buckets_analytics TO service_role;
GRANT ALL ON TABLE storage.buckets_analytics TO authenticated;
GRANT ALL ON TABLE storage.buckets_analytics TO anon;


--
-- Name: TABLE buckets_vectors; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT SELECT ON TABLE storage.buckets_vectors TO service_role;
GRANT SELECT ON TABLE storage.buckets_vectors TO authenticated;
GRANT SELECT ON TABLE storage.buckets_vectors TO anon;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

REVOKE ALL ON TABLE storage.objects FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.objects TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO postgres WITH GRANT OPTION;


--
-- Name: TABLE s3_multipart_uploads; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;


--
-- Name: TABLE s3_multipart_uploads_parts; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads_parts TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;


--
-- Name: TABLE vector_indexes; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT SELECT ON TABLE storage.vector_indexes TO service_role;
GRANT SELECT ON TABLE storage.vector_indexes TO authenticated;
GRANT SELECT ON TABLE storage.vector_indexes TO anon;


--
-- Name: TABLE secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.secrets TO service_role;


--
-- Name: TABLE decrypted_secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.decrypted_secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.decrypted_secrets TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA cron GRANT ALL ON SEQUENCES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA cron GRANT ALL ON FUNCTIONS TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA cron GRANT ALL ON TABLES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: pgmq; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgmq GRANT SELECT ON SEQUENCES TO pg_monitor;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: pgmq; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgmq GRANT SELECT ON TABLES TO pg_monitor;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO service_role;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


ALTER EVENT TRIGGER issue_graphql_placeholder OWNER TO supabase_admin;

--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


ALTER EVENT TRIGGER issue_pg_cron_access OWNER TO supabase_admin;

--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


ALTER EVENT TRIGGER issue_pg_graphql_access OWNER TO supabase_admin;

--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


ALTER EVENT TRIGGER issue_pg_net_access OWNER TO supabase_admin;

--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin;

--
-- PostgreSQL database dump complete
--

\unrestrict AXz0o1vkMPPV9EsP6vH9NlS6QaaUFRVUjbphX6EqNbhPie6M6JYmowNZ5PLgFIs


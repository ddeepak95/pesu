--
-- PostgreSQL database dump
--

\restrict 1Ds3WuA4JbfQe34HF2EvpPmltSaqKtytTHcaBefbTS1qHCPIVJ7MvMMOsyMrBUY

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

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
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
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


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
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


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
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

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
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


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
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


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
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


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
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


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
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


--
-- Name: accept_student_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_student_invite(p_token text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_hash TEXT;
  v_invite RECORD;
  v_class_public_id TEXT;
  v_is_new_member BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to accept invite';
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT *
  INTO v_invite
  FROM class_student_invites
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
    AND expires_at > timezone('utc'::text, now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite invalid or expired';
  END IF;

  -- Get the class public ID
  SELECT class_id INTO v_class_public_id FROM classes WHERE id = v_invite.class_id;

  -- Check if already enrolled - just return the class (no error)
  IF EXISTS (
    SELECT 1 FROM class_students
    WHERE class_students.class_id = v_invite.class_id
      AND class_students.student_id = auth.uid()
  ) THEN
    RETURN v_class_public_id;
  END IF;

  -- New member - insert into class_students
  -- The trigger trg_class_students_assign_group() will automatically assign to a group via round-robin
  INSERT INTO class_students (class_id, student_id)
  VALUES (v_invite.class_id, auth.uid());
  v_is_new_member := TRUE;

  -- Only increment uses for new members
  IF v_is_new_member THEN
    UPDATE class_student_invites
    SET uses = uses + 1
    WHERE id = v_invite.id;
  END IF;

  RETURN v_class_public_id;
END;
$$;


--
-- Name: accept_teacher_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_teacher_invite(p_token text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_hash TEXT;
  v_invite RECORD;
  v_class_public_id TEXT;
  v_is_new_member BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to accept invite';
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT *
  INTO v_invite
  FROM class_teacher_invites
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
    AND expires_at > timezone('utc'::text, now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite invalid or expired';
  END IF;

  -- Get the class public ID
  SELECT class_id INTO v_class_public_id FROM classes WHERE id = v_invite.class_id;

  -- Check if user is already the owner - just return the class (no error)
  IF EXISTS (SELECT 1 FROM classes WHERE id = v_invite.class_id AND created_by = auth.uid()) THEN
    RETURN v_class_public_id;
  END IF;

  -- Check if already a co-teacher - just return the class (no error)
  IF EXISTS (
    SELECT 1 FROM class_teachers
    WHERE class_teachers.class_id = v_invite.class_id
      AND class_teachers.teacher_id = auth.uid()
  ) THEN
    RETURN v_class_public_id;
  END IF;

  -- New member - insert into class_teachers
  INSERT INTO class_teachers (class_id, teacher_id, role)
  VALUES (v_invite.class_id, auth.uid(), 'co-teacher');
  v_is_new_member := TRUE;

  -- Only increment uses for new members
  IF v_is_new_member THEN
    UPDATE class_teacher_invites
    SET uses = uses + 1
    WHERE id = v_invite.id;
  END IF;

  RETURN v_class_public_id;
END;
$$;


--
-- Name: assign_student_to_group(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_student_to_group(p_class_id uuid, p_student_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_group_id UUID;
BEGIN
  PERFORM ensure_class_groups(p_class_id);

  SELECT g.id
  INTO v_group_id
  FROM class_groups g
  LEFT JOIN class_group_memberships m
    ON m.group_id = g.id
  WHERE g.class_id = p_class_id
  GROUP BY g.id, g.group_index
  ORDER BY COUNT(m.id) ASC, g.group_index ASC
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'No groups available for class';
  END IF;

  INSERT INTO class_group_memberships (class_id, group_id, student_id)
  VALUES (p_class_id, v_group_id, p_student_id)
  ON CONFLICT (class_id, student_id) DO NOTHING;
END;
$$;


--
-- Name: create_student_invite(uuid, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_student_invite(p_class_id uuid, p_expires_at timestamp with time zone DEFAULT (timezone('utc'::text, now()) + '100 years'::interval), p_max_uses integer DEFAULT NULL::integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_is_co_teacher BOOLEAN;
  v_token TEXT;
  v_hash TEXT;
BEGIN
  -- Check if class exists and user is owner or co-teacher
  SELECT 
    EXISTS (SELECT 1 FROM classes WHERE id = p_class_id AND created_by = auth.uid()),
    EXISTS (
      SELECT 1 FROM class_teachers 
      WHERE class_id = p_class_id AND teacher_id = auth.uid()
    )
  INTO v_is_owner, v_is_co_teacher;

  IF NOT v_is_owner AND NOT v_is_co_teacher THEN
    RAISE EXCEPTION 'Only class owner or co-teachers can create student invites';
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  -- Single invite per class: overwrite existing invite (regenerate link).
  INSERT INTO class_student_invites (class_id, token_hash, token, created_by, expires_at, max_uses, uses, revoked_at)
  VALUES (p_class_id, v_hash, v_token, auth.uid(), p_expires_at, p_max_uses, 0, NULL)
  ON CONFLICT (class_id)
  DO UPDATE SET
    token_hash = EXCLUDED.token_hash,
    token = EXCLUDED.token,
    expires_at = EXCLUDED.expires_at,
    max_uses = EXCLUDED.max_uses,
    uses = 0,
    revoked_at = NULL,
    updated_at = timezone('utc'::text, now());

  RETURN v_token;
END;
$$;


--
-- Name: create_teacher_invite(uuid, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_teacher_invite(p_class_id uuid, p_expires_at timestamp with time zone DEFAULT (timezone('utc'::text, now()) + '100 years'::interval), p_max_uses integer DEFAULT NULL::integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_owner UUID;
  v_token TEXT;
  v_hash TEXT;
BEGIN
  SELECT created_by INTO v_owner FROM classes WHERE id = p_class_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only class owner can create teacher invites';
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  -- Single invite per class: overwrite existing invite (regenerate link).
  INSERT INTO class_teacher_invites (class_id, token_hash, token, created_by, expires_at, max_uses, uses, revoked_at)
  VALUES (p_class_id, v_hash, v_token, auth.uid(), p_expires_at, p_max_uses, 0, NULL)
  ON CONFLICT (class_id)
  DO UPDATE SET
    token_hash = EXCLUDED.token_hash,
    token = EXCLUDED.token,
    expires_at = EXCLUDED.expires_at,
    max_uses = EXCLUDED.max_uses,
    uses = 0,
    revoked_at = NULL,
    updated_at = timezone('utc'::text, now());

  RETURN v_token;
END;
$$;


--
-- Name: ensure_class_groups(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_class_groups(p_class_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_group_count INTEGER;
  i INTEGER;
BEGIN
  SELECT group_count INTO v_group_count FROM classes WHERE id = p_class_id;
  IF v_group_count IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  FOR i IN 0..(v_group_count - 1) LOOP
    INSERT INTO class_groups (class_id, group_index, name)
    VALUES (p_class_id, i, 'Group ' || (i + 1))
    ON CONFLICT (class_id, group_index) DO NOTHING;
  END LOOP;
END;
$$;


--
-- Name: get_class_students_with_user_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_class_students_with_user_info(p_class_id uuid) RETURNS TABLE(student_id uuid, joined_at timestamp with time zone, student_email text, student_display_name text, group_id uuid, group_name text, group_index integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.student_id,
    cs.joined_at,
    au.email::TEXT as student_email,
    COALESCE(
      au.raw_user_meta_data->>'display_name',
      au.raw_user_meta_data->>'name',
      au.raw_user_meta_data->>'full_name'
    )::TEXT as student_display_name,
    cgm.group_id,
    cg.name::TEXT as group_name,
    cg.group_index
  FROM class_students cs
  LEFT JOIN auth.users au ON cs.student_id = au.id
  LEFT JOIN class_group_memberships cgm ON cs.class_id = cgm.class_id AND cs.student_id = cgm.student_id
  LEFT JOIN class_groups cg ON cgm.group_id = cg.id
  WHERE cs.class_id = p_class_id
  ORDER BY cs.joined_at DESC;
END;
$$;


--
-- Name: get_class_teachers_with_user_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_class_teachers_with_user_info(p_class_id uuid) RETURNS TABLE(id uuid, class_id uuid, teacher_id uuid, role text, joined_at timestamp with time zone, teacher_email text, teacher_display_name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ct.id,
    ct.class_id,
    ct.teacher_id,
    ct.role,
    ct.joined_at,
    au.email::TEXT as teacher_email,
    COALESCE(
      au.raw_user_meta_data->>'display_name',
      au.raw_user_meta_data->>'name',
      au.raw_user_meta_data->>'full_name'
    )::TEXT as teacher_display_name
  FROM class_teachers ct
  LEFT JOIN auth.users au ON ct.teacher_id = au.id
  WHERE ct.class_id = p_class_id
  ORDER BY ct.joined_at ASC;
END;
$$;


--
-- Name: is_class_co_teacher(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_class_co_teacher(p_class_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_teachers 
    WHERE class_id = p_class_id 
    AND teacher_id = auth.uid()
  );
$$;


--
-- Name: is_class_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_class_owner(p_class_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes 
    WHERE id = p_class_id 
    AND created_by = auth.uid()
  );
$$;


--
-- Name: is_class_student(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_class_student(p_class_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_students 
    WHERE class_id = p_class_id 
    AND student_id = auth.uid()
  );
$$;


--
-- Name: is_student_in_group(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_student_in_group(p_class_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM class_students cs
    JOIN class_group_memberships cgm ON cs.class_id = cgm.class_id AND cs.student_id = cgm.student_id
    WHERE cs.class_id = p_class_id
      AND cs.student_id = auth.uid()
      AND cgm.group_id = p_group_id
  );
$$;


--
-- Name: reconfigure_class_groups(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconfigure_class_groups(p_class_id uuid, p_new_group_count integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_owner UUID;
  v_old_group_count INTEGER;
  i INTEGER;
  v_group RECORD;
  v_student RECORD;
BEGIN
  IF p_new_group_count < 1 THEN
    RAISE EXCEPTION 'group_count must be >= 1';
  END IF;

  SELECT created_by, group_count INTO v_owner, v_old_group_count
  FROM classes
  WHERE id = p_class_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only class owner can change group count';
  END IF;

  IF p_new_group_count = v_old_group_count THEN
    RETURN;
  END IF;

  -- Increasing: create missing groups
  IF p_new_group_count > v_old_group_count THEN
    UPDATE classes SET group_count = p_new_group_count WHERE id = p_class_id;
    PERFORM ensure_class_groups(p_class_id);
    RETURN;
  END IF;

  -- Shrinking: move members from groups >= new_count into remaining groups
  FOR v_group IN
    SELECT id, group_index FROM class_groups
    WHERE class_id = p_class_id
      AND group_index >= p_new_group_count
    ORDER BY group_index ASC
  LOOP
    FOR v_student IN
      SELECT m.student_id
      FROM class_group_memberships m
      WHERE m.class_id = p_class_id
        AND m.group_id = v_group.id
      ORDER BY m.assigned_at ASC
    LOOP
      -- Temporarily delete membership and reassign into remaining groups (balanced)
      DELETE FROM class_group_memberships
      WHERE class_id = p_class_id AND student_id = v_student.student_id;

      PERFORM assign_student_to_group(p_class_id, v_student.student_id);
    END LOOP;

    -- Now safe to delete the group (no memberships remain)
    DELETE FROM class_groups WHERE id = v_group.id;
  END LOOP;

  UPDATE classes SET group_count = p_new_group_count WHERE id = p_class_id;
  PERFORM ensure_class_groups(p_class_id);
END;
$$;


--
-- Name: revoke_student_invite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_student_invite(p_invite_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_class_id UUID;
  v_is_owner BOOLEAN;
  v_is_co_teacher BOOLEAN;
BEGIN
  SELECT class_id INTO v_class_id FROM class_student_invites WHERE id = p_invite_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  -- Check if user is owner or co-teacher
  SELECT 
    EXISTS (SELECT 1 FROM classes WHERE id = v_class_id AND created_by = auth.uid()),
    EXISTS (
      SELECT 1 FROM class_teachers 
      WHERE class_id = v_class_id AND teacher_id = auth.uid()
    )
  INTO v_is_owner, v_is_co_teacher;

  IF NOT v_is_owner AND NOT v_is_co_teacher THEN
    RAISE EXCEPTION 'Only class owner or co-teachers can revoke student invites';
  END IF;

  UPDATE class_student_invites
  SET revoked_at = timezone('utc'::text, now())
  WHERE id = p_invite_id;
END;
$$;


--
-- Name: revoke_teacher_invite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_teacher_invite(p_invite_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_class_id UUID;
  v_owner UUID;
BEGIN
  SELECT class_id INTO v_class_id FROM class_teacher_invites WHERE id = p_invite_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  SELECT created_by INTO v_owner FROM classes WHERE id = v_class_id;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only class owner can revoke teacher invites';
  END IF;

  UPDATE class_teacher_invites
  SET revoked_at = timezone('utc'::text, now())
  WHERE id = p_invite_id;
END;
$$;


--
-- Name: trg_class_students_assign_group(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_class_students_assign_group() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  PERFORM assign_student_to_group(NEW.class_id, NEW.student_id);
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
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
        subs.entity = entity_;

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
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

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
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
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
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
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
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
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

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
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
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


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
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


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
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


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
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


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
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
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
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


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
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
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
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

            -- Set maximum number of entries for in filter
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

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: add_prefixes(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    prefixes text[];
BEGIN
    prefixes := "storage"."get_prefixes"("_name");

    IF array_length(prefixes, 1) > 0 THEN
        INSERT INTO storage.prefixes (name, bucket_id)
        SELECT UNNEST(prefixes) as name, "_bucket_id" ON CONFLICT DO NOTHING;
    END IF;
END;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
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


--
-- Name: delete_leaf_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_rows_deleted integer;
BEGIN
    LOOP
        WITH candidates AS (
            SELECT DISTINCT
                t.bucket_id,
                unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        ),
        uniq AS (
             SELECT
                 bucket_id,
                 name,
                 storage.get_level(name) AS level
             FROM candidates
             WHERE name <> ''
             GROUP BY bucket_id, name
        ),
        leaf AS (
             SELECT
                 p.bucket_id,
                 p.name,
                 p.level
             FROM storage.prefixes AS p
                  JOIN uniq AS u
                       ON u.bucket_id = p.bucket_id
                           AND u.name = p.name
                           AND u.level = p.level
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM storage.objects AS o
                 WHERE o.bucket_id = p.bucket_id
                   AND o.level = p.level + 1
                   AND o.name COLLATE "C" LIKE p.name || '/%'
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM storage.prefixes AS c
                 WHERE c.bucket_id = p.bucket_id
                   AND c.level = p.level + 1
                   AND c.name COLLATE "C" LIKE p.name || '/%'
             )
        )
        DELETE
        FROM storage.prefixes AS p
            USING leaf AS l
        WHERE p.bucket_id = l.bucket_id
          AND p.name = l.name
          AND p.level = l.level;

        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        EXIT WHEN v_rows_deleted = 0;
    END LOOP;
END;
$$;


--
-- Name: delete_prefix(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Check if we can delete the prefix
    IF EXISTS(
        SELECT FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name") + 1
          AND "prefixes"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    )
    OR EXISTS(
        SELECT FROM "storage"."objects"
        WHERE "objects"."bucket_id" = "_bucket_id"
          AND "storage"."get_level"("objects"."name") = "storage"."get_level"("_name") + 1
          AND "objects"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    ) THEN
    -- There are sub-objects, skip deletion
    RETURN false;
    ELSE
        DELETE FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name")
          AND "prefixes"."name" = "_name";
        RETURN true;
    END IF;
END;
$$;


--
-- Name: delete_prefix_hierarchy_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix_hierarchy_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    prefix text;
BEGIN
    prefix := "storage"."get_prefix"(OLD."name");

    IF coalesce(prefix, '') != '' THEN
        PERFORM "storage"."delete_prefix"(OLD."bucket_id", prefix);
    END IF;

    RETURN OLD;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
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


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
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


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
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


--
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
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


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


--
-- Name: lock_top_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.lock_top_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket text;
    v_top text;
BEGIN
    FOR v_bucket, v_top IN
        SELECT DISTINCT t.bucket_id,
            split_part(t.name, '/', 1) AS top
        FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        WHERE t.name <> ''
        ORDER BY 1, 2
        LOOP
            PERFORM pg_advisory_xact_lock(hashtextextended(v_bucket || '/' || v_top, 0));
        END LOOP;
END;
$$;


--
-- Name: objects_delete_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_delete_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket_ids text[];
    v_names      text[];
BEGIN
    IF current_setting('storage.gc.prefixes', true) = '1' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('storage.gc.prefixes', '1', true);

    SELECT COALESCE(array_agg(d.bucket_id), '{}'),
           COALESCE(array_agg(d.name), '{}')
    INTO v_bucket_ids, v_names
    FROM deleted AS d
    WHERE d.name <> '';

    PERFORM storage.lock_top_prefixes(v_bucket_ids, v_names);
    PERFORM storage.delete_leaf_prefixes(v_bucket_ids, v_names);

    RETURN NULL;
END;
$$;


--
-- Name: objects_insert_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_insert_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    NEW.level := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- Name: objects_update_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    -- NEW - OLD (destinations to create prefixes for)
    v_add_bucket_ids text[];
    v_add_names      text[];

    -- OLD - NEW (sources to prune)
    v_src_bucket_ids text[];
    v_src_names      text[];
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NULL;
    END IF;

    -- 1) Compute NEW−OLD (added paths) and OLD−NEW (moved-away paths)
    WITH added AS (
        SELECT n.bucket_id, n.name
        FROM new_rows n
        WHERE n.name <> '' AND position('/' in n.name) > 0
        EXCEPT
        SELECT o.bucket_id, o.name FROM old_rows o WHERE o.name <> ''
    ),
    moved AS (
         SELECT o.bucket_id, o.name
         FROM old_rows o
         WHERE o.name <> ''
         EXCEPT
         SELECT n.bucket_id, n.name FROM new_rows n WHERE n.name <> ''
    )
    SELECT
        -- arrays for ADDED (dest) in stable order
        COALESCE( (SELECT array_agg(a.bucket_id ORDER BY a.bucket_id, a.name) FROM added a), '{}' ),
        COALESCE( (SELECT array_agg(a.name      ORDER BY a.bucket_id, a.name) FROM added a), '{}' ),
        -- arrays for MOVED (src) in stable order
        COALESCE( (SELECT array_agg(m.bucket_id ORDER BY m.bucket_id, m.name) FROM moved m), '{}' ),
        COALESCE( (SELECT array_agg(m.name      ORDER BY m.bucket_id, m.name) FROM moved m), '{}' )
    INTO v_add_bucket_ids, v_add_names, v_src_bucket_ids, v_src_names;

    -- Nothing to do?
    IF (array_length(v_add_bucket_ids, 1) IS NULL) AND (array_length(v_src_bucket_ids, 1) IS NULL) THEN
        RETURN NULL;
    END IF;

    -- 2) Take per-(bucket, top) locks: ALL prefixes in consistent global order to prevent deadlocks
    DECLARE
        v_all_bucket_ids text[];
        v_all_names text[];
    BEGIN
        -- Combine source and destination arrays for consistent lock ordering
        v_all_bucket_ids := COALESCE(v_src_bucket_ids, '{}') || COALESCE(v_add_bucket_ids, '{}');
        v_all_names := COALESCE(v_src_names, '{}') || COALESCE(v_add_names, '{}');

        -- Single lock call ensures consistent global ordering across all transactions
        IF array_length(v_all_bucket_ids, 1) IS NOT NULL THEN
            PERFORM storage.lock_top_prefixes(v_all_bucket_ids, v_all_names);
        END IF;
    END;

    -- 3) Create destination prefixes (NEW−OLD) BEFORE pruning sources
    IF array_length(v_add_bucket_ids, 1) IS NOT NULL THEN
        WITH candidates AS (
            SELECT DISTINCT t.bucket_id, unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(v_add_bucket_ids, v_add_names) AS t(bucket_id, name)
            WHERE name <> ''
        )
        INSERT INTO storage.prefixes (bucket_id, name)
        SELECT c.bucket_id, c.name
        FROM candidates c
        ON CONFLICT DO NOTHING;
    END IF;

    -- 4) Prune source prefixes bottom-up for OLD−NEW
    IF array_length(v_src_bucket_ids, 1) IS NOT NULL THEN
        -- re-entrancy guard so DELETE on prefixes won't recurse
        IF current_setting('storage.gc.prefixes', true) <> '1' THEN
            PERFORM set_config('storage.gc.prefixes', '1', true);
        END IF;

        PERFORM storage.delete_leaf_prefixes(v_src_bucket_ids, v_src_names);
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: objects_update_level_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_level_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Set the new level
        NEW."level" := "storage"."get_level"(NEW."name");
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: objects_update_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_prefixes TEXT[];
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Retrieve old prefixes
        old_prefixes := "storage"."get_prefixes"(OLD."name");

        -- Remove old prefixes that are only used by this object
        WITH all_prefixes as (
            SELECT unnest(old_prefixes) as prefix
        ),
        can_delete_prefixes as (
             SELECT prefix
             FROM all_prefixes
             WHERE NOT EXISTS (
                 SELECT 1 FROM "storage"."objects"
                 WHERE "bucket_id" = OLD."bucket_id"
                   AND "name" <> OLD."name"
                   AND "name" LIKE (prefix || '%')
             )
         )
        DELETE FROM "storage"."prefixes" WHERE name IN (SELECT prefix FROM can_delete_prefixes);

        -- Add new prefixes
        PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    END IF;
    -- Set the new level
    NEW."level" := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: prefixes_delete_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_delete_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket_ids text[];
    v_names      text[];
BEGIN
    IF current_setting('storage.gc.prefixes', true) = '1' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('storage.gc.prefixes', '1', true);

    SELECT COALESCE(array_agg(d.bucket_id), '{}'),
           COALESCE(array_agg(d.name), '{}')
    INTO v_bucket_ids, v_names
    FROM deleted AS d
    WHERE d.name <> '';

    PERFORM storage.lock_top_prefixes(v_bucket_ids, v_names);
    PERFORM storage.delete_leaf_prefixes(v_bucket_ids, v_names);

    RETURN NULL;
END;
$$;


--
-- Name: prefixes_insert_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_insert_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    RETURN NEW;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
declare
    can_bypass_rls BOOLEAN;
begin
    SELECT rolbypassrls
    INTO can_bypass_rls
    FROM pg_roles
    WHERE rolname = coalesce(nullif(current_setting('role', true), 'none'), current_user);

    IF can_bypass_rls THEN
        RETURN QUERY SELECT * FROM storage.search_v1_optimised(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    ELSE
        RETURN QUERY SELECT * FROM storage.search_legacy_v1(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    END IF;
end;
$$;


--
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v1_optimised(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v1_optimised(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select (string_to_array(name, ''/''))[level] as name
           from storage.prefixes
             where lower(prefixes.name) like lower($2 || $3) || ''%''
               and bucket_id = $4
               and level = $1
           order by name ' || v_sort_order || '
     )
     (select name,
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[level] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where lower(objects.name) like lower($2 || $3) || ''%''
       and bucket_id = $4
       and level = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    sort_col text;
    sort_ord text;
    cursor_op text;
    cursor_expr text;
    sort_expr text;
BEGIN
    -- Validate sort_order
    sort_ord := lower(sort_order);
    IF sort_ord NOT IN ('asc', 'desc') THEN
        sort_ord := 'asc';
    END IF;

    -- Determine cursor comparison operator
    IF sort_ord = 'asc' THEN
        cursor_op := '>';
    ELSE
        cursor_op := '<';
    END IF;
    
    sort_col := lower(sort_column);
    -- Validate sort column  
    IF sort_col IN ('updated_at', 'created_at') THEN
        cursor_expr := format(
            '($5 = '''' OR ROW(date_trunc(''milliseconds'', %I), name COLLATE "C") %s ROW(COALESCE(NULLIF($6, '''')::timestamptz, ''epoch''::timestamptz), $5))',
            sort_col, cursor_op
        );
        sort_expr := format(
            'COALESCE(date_trunc(''milliseconds'', %I), ''epoch''::timestamptz) %s, name COLLATE "C" %s',
            sort_col, sort_ord, sort_ord
        );
    ELSE
        cursor_expr := format('($5 = '''' OR name COLLATE "C" %s $5)', cursor_op);
        sort_expr := format('name COLLATE "C" %s', sort_ord);
    END IF;

    RETURN QUERY EXECUTE format(
        $sql$
        SELECT * FROM (
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name,
                    NULL::uuid AS id,
                    updated_at,
                    created_at,
                    NULL::timestamptz AS last_accessed_at,
                    NULL::jsonb AS metadata
                FROM storage.prefixes
                WHERE name COLLATE "C" LIKE $1 || '%%'
                    AND bucket_id = $2
                    AND level = $4
                    AND %s
                ORDER BY %s
                LIMIT $3
            )
            UNION ALL
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name,
                    id,
                    updated_at,
                    created_at,
                    last_accessed_at,
                    metadata
                FROM storage.objects
                WHERE name COLLATE "C" LIKE $1 || '%%'
                    AND bucket_id = $2
                    AND level = $4
                    AND %s
                ORDER BY %s
                LIMIT $3
            )
        ) obj
        ORDER BY %s
        LIMIT $3
        $sql$,
        cursor_expr,    -- prefixes WHERE
        sort_expr,      -- prefixes ORDER BY
        cursor_expr,    -- objects WHERE
        sort_expr,      -- objects ORDER BY
        sort_expr       -- final ORDER BY
    )
    USING prefix, bucket_name, limits, levels, start_after, sort_column_after;
END;
$_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text NOT NULL,
    code_challenge_method auth.code_challenge_method NOT NULL,
    code_challenge text NOT NULL,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'stores metadata for pkce logins';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
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
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id text NOT NULL,
    class_id uuid NOT NULL,
    title text NOT NULL,
    total_points integer NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status text DEFAULT 'active'::text,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    preferred_language text DEFAULT 'en'::text NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    assessment_mode text DEFAULT 'voice'::text NOT NULL,
    class_group_id uuid,
    responder_fields_config jsonb,
    max_attempts integer DEFAULT 1,
    CONSTRAINT assignments_assessment_mode_check CHECK ((assessment_mode = ANY (ARRAY['voice'::text, 'text_chat'::text, 'static_text'::text]))),
    CONSTRAINT assignments_max_attempts_check CHECK ((max_attempts >= 1)),
    CONSTRAINT assignments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deleted'::text]))),
    CONSTRAINT assignments_total_points_check CHECK ((total_points > 0))
);


--
-- Name: COLUMN assignments.questions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assignments.questions IS 'Array of question objects, each containing: order, prompt, total_points, rubric (array), and supporting_content';


--
-- Name: COLUMN assignments.preferred_language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assignments.preferred_language IS 'Preferred language for the assignment (e.g., "en", "ta", "de"). Defaults to the class preferred_language. Should match language codes from supportedLanguages.ts';


--
-- Name: COLUMN assignments.is_public; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assignments.is_public IS 'Whether the assignment is publicly accessible via link (no authentication required)';


--
-- Name: COLUMN assignments.responder_fields_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assignments.responder_fields_config IS 'Configuration for responder details collection in public assignments. Array of field definitions: {field: string, type: "text"|"email"|"tel"|"select", label: string, required: boolean, placeholder?: string, options?: string[]}';


--
-- Name: COLUMN assignments.max_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assignments.max_attempts IS 'Maximum number of attempts allowed per student for this assignment. Defaults to 1 (single attempt).';


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id text,
    assignment_id text NOT NULL,
    question_order integer NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    attempt_number integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['student'::text, 'assistant'::text])))
);


--
-- Name: class_group_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_group_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    group_id uuid NOT NULL,
    student_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: class_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    group_index integer NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT class_groups_group_index_check CHECK ((group_index >= 0))
);


--
-- Name: class_student_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_student_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    token_hash text NOT NULL,
    token text,
    created_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    max_uses integer,
    uses integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT class_student_invites_uses_check CHECK ((uses >= 0))
);


--
-- Name: class_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: class_teacher_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_teacher_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    max_uses integer DEFAULT 1,
    uses integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    token text,
    CONSTRAINT class_teacher_invites_max_uses_check CHECK ((max_uses >= 1)),
    CONSTRAINT class_teacher_invites_uses_check CHECK ((uses >= 0))
);


--
-- Name: class_teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_teachers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    role text NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    CONSTRAINT class_teachers_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'co-teacher'::text])))
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    class_id text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'active'::text NOT NULL,
    preferred_language text DEFAULT 'en'::text NOT NULL,
    group_count integer DEFAULT 1 NOT NULL,
    CONSTRAINT classes_group_count_check CHECK ((group_count >= 1)),
    CONSTRAINT classes_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text])))
);


--
-- Name: COLUMN classes.preferred_language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.classes.preferred_language IS 'Preferred language for the class (e.g., "en", "ta", "de"). Should match language codes from supportedLanguages.ts';


--
-- Name: content_item_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_item_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_item_id uuid NOT NULL,
    group_key text NOT NULL,
    "position" integer,
    due_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: content_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_item_id text NOT NULL,
    class_id uuid NOT NULL,
    type text NOT NULL,
    ref_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    due_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status text DEFAULT 'active'::text,
    class_group_id uuid,
    CONSTRAINT content_items_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deleted'::text]))),
    CONSTRAINT content_items_type_check CHECK ((type = ANY (ARRAY['quiz'::text, 'learning_content'::text, 'formative_assignment'::text])))
);


--
-- Name: learning_contents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_contents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learning_content_id text NOT NULL,
    class_id uuid NOT NULL,
    title text NOT NULL,
    content_type text NOT NULL,
    video_url text,
    body text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status text DEFAULT 'active'::text,
    class_group_id uuid,
    CONSTRAINT learning_contents_content_type_check CHECK ((content_type = ANY (ARRAY['video'::text, 'text'::text, 'mixed'::text]))),
    CONSTRAINT learning_contents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deleted'::text])))
);


--
-- Name: quizzes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quizzes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quiz_id text NOT NULL,
    class_id uuid NOT NULL,
    title text NOT NULL,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_points integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status text DEFAULT 'active'::text,
    class_group_id uuid,
    CONSTRAINT quizzes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deleted'::text]))),
    CONSTRAINT quizzes_total_points_check CHECK ((total_points >= 0))
);


--
-- Name: COLUMN quizzes.questions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quizzes.questions IS 'Array of MCQ question objects: order, prompt, options[{id,text}], correct_option_id, points';


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id text NOT NULL,
    assignment_id text NOT NULL,
    student_name text,
    preferred_language text DEFAULT 'en'::text NOT NULL,
    answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    submitted_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'in_progress'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    submission_mode text DEFAULT 'voice'::text,
    student_id uuid,
    responder_details jsonb,
    CONSTRAINT check_student_identifier CHECK (((student_id IS NOT NULL) OR (responder_details IS NOT NULL))),
    CONSTRAINT submissions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text]))),
    CONSTRAINT submissions_submission_mode_check CHECK ((submission_mode = ANY (ARRAY['voice'::text, 'text_chat'::text, 'static_text'::text, 'mixed'::text])))
);


--
-- Name: TABLE submissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.submissions IS 'Stores student submissions for assignments';


--
-- Name: COLUMN submissions.submission_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.submissions.submission_id IS 'Unique short ID for the submission (8 characters)';


--
-- Name: COLUMN submissions.assignment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.submissions.assignment_id IS 'References assignments.assignment_id';


--
-- Name: COLUMN submissions.student_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.submissions.student_name IS 'Name provided by the student';


--
-- Name: COLUMN submissions.preferred_language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.submissions.preferred_language IS 'Language preference for the submission';


--
-- Name: COLUMN submissions.answers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.submissions.answers IS 'Array of answers: [{ question_order: number, answer_text: string }]';


--
-- Name: COLUMN submissions.submitted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.submissions.submitted_at IS 'Timestamp when the submission was completed';


--
-- Name: COLUMN submissions.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.submissions.status IS 'Current status: in_progress or completed';


--
-- Name: voice_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id text,
    assignment_id text NOT NULL,
    question_order integer NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    audio_file_url text,
    attempt_number integer,
    duration_seconds numeric,
    created_at timestamp with time zone DEFAULT now(),
    interrupted boolean DEFAULT false,
    spoken_at timestamp with time zone,
    generated_content text,
    CONSTRAINT voice_messages_role_check CHECK ((role = ANY (ARRAY['student'::text, 'assistant'::text])))
);


--
-- Name: TABLE voice_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.voice_messages IS 'Stores voice messages with audio file URLs from voice assessment sessions';


--
-- Name: COLUMN voice_messages.submission_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.submission_id IS 'References submissions.submission_id (nullable for messages before submission creation)';


--
-- Name: COLUMN voice_messages.assignment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.assignment_id IS 'References assignments.assignment_id';


--
-- Name: COLUMN voice_messages.question_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.question_order IS 'Order of the question in the assignment (0-indexed or 1-indexed based on assignment structure)';


--
-- Name: COLUMN voice_messages.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.role IS 'Role of the speaker: student or assistant';


--
-- Name: COLUMN voice_messages.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.content IS 'Transcript text of the voice message';


--
-- Name: COLUMN voice_messages.audio_file_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.audio_file_url IS 'URL to the audio file stored in Firebase Storage (nullable for disconnect fallback)';


--
-- Name: COLUMN voice_messages.attempt_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.attempt_number IS 'Attempt number for grouping messages by evaluation attempt';


--
-- Name: COLUMN voice_messages.duration_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.duration_seconds IS 'Duration of the audio recording in seconds (optional)';


--
-- Name: COLUMN voice_messages.interrupted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.interrupted IS 'True if the utterance was interrupted (audio is partial, transcript is full)';


--
-- Name: COLUMN voice_messages.spoken_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.spoken_at IS 'Timestamp when the utterance was spoken (for accurate timing analysis)';


--
-- Name: COLUMN voice_messages.generated_content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_messages.generated_content IS 'Full LLM-generated text for assistant messages (may be longer than content if interrupted)';


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
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
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
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


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
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


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
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
    user_metadata jsonb,
    level integer
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: prefixes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.prefixes (
    bucket_id text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    level integer GENERATED ALWAYS AS (storage.get_level(name)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
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
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
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


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
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


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_assignment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_assignment_id_key UNIQUE (assignment_id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: class_group_memberships class_group_memberships_class_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_group_memberships
    ADD CONSTRAINT class_group_memberships_class_id_student_id_key UNIQUE (class_id, student_id);


--
-- Name: class_group_memberships class_group_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_group_memberships
    ADD CONSTRAINT class_group_memberships_pkey PRIMARY KEY (id);


--
-- Name: class_groups class_groups_class_id_group_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_groups
    ADD CONSTRAINT class_groups_class_id_group_index_key UNIQUE (class_id, group_index);


--
-- Name: class_groups class_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_groups
    ADD CONSTRAINT class_groups_pkey PRIMARY KEY (id);


--
-- Name: class_student_invites class_student_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_student_invites
    ADD CONSTRAINT class_student_invites_pkey PRIMARY KEY (id);


--
-- Name: class_student_invites class_student_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_student_invites
    ADD CONSTRAINT class_student_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: class_students class_students_class_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_students
    ADD CONSTRAINT class_students_class_id_student_id_key UNIQUE (class_id, student_id);


--
-- Name: class_students class_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_students
    ADD CONSTRAINT class_students_pkey PRIMARY KEY (id);


--
-- Name: class_teacher_invites class_teacher_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teacher_invites
    ADD CONSTRAINT class_teacher_invites_pkey PRIMARY KEY (id);


--
-- Name: class_teacher_invites class_teacher_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teacher_invites
    ADD CONSTRAINT class_teacher_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: class_teachers class_teachers_class_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teachers
    ADD CONSTRAINT class_teachers_class_id_teacher_id_key UNIQUE (class_id, teacher_id);


--
-- Name: class_teachers class_teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teachers
    ADD CONSTRAINT class_teachers_pkey PRIMARY KEY (id);


--
-- Name: classes classes_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_class_id_key UNIQUE (class_id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: content_item_overrides content_item_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_item_overrides
    ADD CONSTRAINT content_item_overrides_pkey PRIMARY KEY (id);


--
-- Name: content_items content_items_content_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_items
    ADD CONSTRAINT content_items_content_item_id_key UNIQUE (content_item_id);


--
-- Name: content_items content_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_items
    ADD CONSTRAINT content_items_pkey PRIMARY KEY (id);


--
-- Name: learning_contents learning_contents_learning_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_contents
    ADD CONSTRAINT learning_contents_learning_content_id_key UNIQUE (learning_content_id);


--
-- Name: learning_contents learning_contents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_contents
    ADD CONSTRAINT learning_contents_pkey PRIMARY KEY (id);


--
-- Name: quizzes quizzes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_pkey PRIMARY KEY (id);


--
-- Name: quizzes quizzes_quiz_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_quiz_id_key UNIQUE (quiz_id);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_submission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_submission_id_key UNIQUE (submission_id);


--
-- Name: voice_messages voice_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_messages
    ADD CONSTRAINT voice_messages_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: prefixes prefixes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (bucket_id, level, name);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: chat_messages_submission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_submission_idx ON public.chat_messages USING btree (submission_id, question_order, attempt_number, created_at);


--
-- Name: idx_assignments_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_assignment_id ON public.assignments USING btree (assignment_id);


--
-- Name: idx_assignments_class_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_class_group_id ON public.assignments USING btree (class_group_id);


--
-- Name: idx_assignments_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_class_id ON public.assignments USING btree (class_id);


--
-- Name: idx_assignments_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_created_by ON public.assignments USING btree (created_by);


--
-- Name: idx_assignments_is_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_is_public ON public.assignments USING btree (is_public) WHERE (is_public = true);


--
-- Name: idx_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_status ON public.assignments USING btree (status);


--
-- Name: idx_class_group_memberships_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_group_memberships_class_id ON public.class_group_memberships USING btree (class_id);


--
-- Name: idx_class_group_memberships_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_group_memberships_group_id ON public.class_group_memberships USING btree (group_id);


--
-- Name: idx_class_group_memberships_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_group_memberships_student_id ON public.class_group_memberships USING btree (student_id);


--
-- Name: idx_class_groups_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_groups_class_id ON public.class_groups USING btree (class_id);


--
-- Name: idx_class_student_invites_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_student_invites_class_id ON public.class_student_invites USING btree (class_id);


--
-- Name: idx_class_student_invites_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_student_invites_token_hash ON public.class_student_invites USING btree (token_hash);


--
-- Name: idx_class_student_invites_unique_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_class_student_invites_unique_class_id ON public.class_student_invites USING btree (class_id);


--
-- Name: idx_class_students_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_students_class_id ON public.class_students USING btree (class_id);


--
-- Name: idx_class_students_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_students_student_id ON public.class_students USING btree (student_id);


--
-- Name: idx_class_teacher_invites_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_teacher_invites_class_id ON public.class_teacher_invites USING btree (class_id);


--
-- Name: idx_class_teacher_invites_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_teacher_invites_token_hash ON public.class_teacher_invites USING btree (token_hash);


--
-- Name: idx_class_teacher_invites_unique_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_class_teacher_invites_unique_class_id ON public.class_teacher_invites USING btree (class_id);


--
-- Name: idx_class_teachers_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_teachers_class_id ON public.class_teachers USING btree (class_id);


--
-- Name: idx_class_teachers_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_teachers_teacher_id ON public.class_teachers USING btree (teacher_id);


--
-- Name: idx_classes_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_class_id ON public.classes USING btree (class_id);


--
-- Name: idx_classes_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_created_by ON public.classes USING btree (created_by);


--
-- Name: idx_classes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_status ON public.classes USING btree (status);


--
-- Name: idx_content_item_overrides_content_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_item_overrides_content_item_id ON public.content_item_overrides USING btree (content_item_id);


--
-- Name: idx_content_item_overrides_group_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_item_overrides_group_key ON public.content_item_overrides USING btree (group_key);


--
-- Name: idx_content_items_class_group_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_items_class_group_position ON public.content_items USING btree (class_group_id, "position");


--
-- Name: idx_content_items_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_items_class_id ON public.content_items USING btree (class_id);


--
-- Name: idx_content_items_class_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_items_class_position ON public.content_items USING btree (class_id, "position");


--
-- Name: idx_content_items_ref_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_items_ref_id ON public.content_items USING btree (ref_id);


--
-- Name: idx_content_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_items_status ON public.content_items USING btree (status);


--
-- Name: idx_content_items_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_items_type ON public.content_items USING btree (type);


--
-- Name: idx_content_items_unique_group_position_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_content_items_unique_group_position_active ON public.content_items USING btree (class_group_id, "position") WHERE ((class_group_id IS NOT NULL) AND (status = ANY (ARRAY['active'::text, 'draft'::text])));


--
-- Name: idx_learning_contents_class_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_contents_class_group_id ON public.learning_contents USING btree (class_group_id);


--
-- Name: idx_learning_contents_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_contents_class_id ON public.learning_contents USING btree (class_id);


--
-- Name: idx_learning_contents_learning_content_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_contents_learning_content_id ON public.learning_contents USING btree (learning_content_id);


--
-- Name: idx_learning_contents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_contents_status ON public.learning_contents USING btree (status);


--
-- Name: idx_quizzes_class_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizzes_class_group_id ON public.quizzes USING btree (class_group_id);


--
-- Name: idx_quizzes_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizzes_class_id ON public.quizzes USING btree (class_id);


--
-- Name: idx_quizzes_quiz_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizzes_quiz_id ON public.quizzes USING btree (quiz_id);


--
-- Name: idx_quizzes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizzes_status ON public.quizzes USING btree (status);


--
-- Name: idx_submissions_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_assignment_id ON public.submissions USING btree (assignment_id);


--
-- Name: idx_submissions_responder_details; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_responder_details ON public.submissions USING gin (responder_details);


--
-- Name: idx_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_status ON public.submissions USING btree (status);


--
-- Name: idx_submissions_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_student_id ON public.submissions USING btree (student_id);


--
-- Name: idx_submissions_submission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_submission_id ON public.submissions USING btree (submission_id);


--
-- Name: idx_voice_messages_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_messages_assignment_id ON public.voice_messages USING btree (assignment_id);


--
-- Name: idx_voice_messages_attempt_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_messages_attempt_number ON public.voice_messages USING btree (attempt_number);


--
-- Name: idx_voice_messages_question_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_messages_question_order ON public.voice_messages USING btree (question_order);


--
-- Name: idx_voice_messages_submission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_messages_submission_id ON public.voice_messages USING btree (submission_id);


--
-- Name: idx_voice_messages_submission_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_messages_submission_question ON public.voice_messages USING btree (submission_id, question_order, attempt_number);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_key ON realtime.subscription USING btree (subscription_id, entity, filters);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_name_bucket_level_unique; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level);


--
-- Name: idx_prefixes_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: objects_bucket_id_level_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C");


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: class_students class_students_assign_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER class_students_assign_group AFTER INSERT ON public.class_students FOR EACH ROW EXECUTE FUNCTION public.trg_class_students_assign_group();


--
-- Name: assignments update_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: class_groups update_class_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_class_groups_updated_at BEFORE UPDATE ON public.class_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: class_student_invites update_class_student_invites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_class_student_invites_updated_at BEFORE UPDATE ON public.class_student_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: class_teacher_invites update_class_teacher_invites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_class_teacher_invites_updated_at BEFORE UPDATE ON public.class_teacher_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: content_item_overrides update_content_item_overrides_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_content_item_overrides_updated_at BEFORE UPDATE ON public.content_item_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: content_items update_content_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_content_items_updated_at BEFORE UPDATE ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: learning_contents update_learning_contents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_learning_contents_updated_at BEFORE UPDATE ON public.learning_contents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: quizzes update_quizzes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_quizzes_updated_at BEFORE UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: objects objects_delete_delete_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects objects_insert_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();


--
-- Name: objects objects_update_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();


--
-- Name: prefixes prefixes_create_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();


--
-- Name: prefixes prefixes_delete_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_class_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_class_group_id_fkey FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(submission_id);


--
-- Name: class_group_memberships class_group_memberships_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_group_memberships
    ADD CONSTRAINT class_group_memberships_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_group_memberships class_group_memberships_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_group_memberships
    ADD CONSTRAINT class_group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;


--
-- Name: class_groups class_groups_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_groups
    ADD CONSTRAINT class_groups_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_student_invites class_student_invites_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_student_invites
    ADD CONSTRAINT class_student_invites_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_students class_students_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_students
    ADD CONSTRAINT class_students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_teacher_invites class_teacher_invites_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teacher_invites
    ADD CONSTRAINT class_teacher_invites_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_teachers class_teachers_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teachers
    ADD CONSTRAINT class_teachers_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_teachers class_teachers_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_teachers
    ADD CONSTRAINT class_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: classes classes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: content_item_overrides content_item_overrides_content_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_item_overrides
    ADD CONSTRAINT content_item_overrides_content_item_id_fkey FOREIGN KEY (content_item_id) REFERENCES public.content_items(id) ON DELETE CASCADE;


--
-- Name: content_items content_items_class_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_items
    ADD CONSTRAINT content_items_class_group_id_fkey FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;


--
-- Name: content_items content_items_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_items
    ADD CONSTRAINT content_items_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: learning_contents learning_contents_class_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_contents
    ADD CONSTRAINT learning_contents_class_group_id_fkey FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;


--
-- Name: learning_contents learning_contents_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_contents
    ADD CONSTRAINT learning_contents_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: quizzes quizzes_class_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_class_group_id_fkey FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;


--
-- Name: quizzes quizzes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: prefixes prefixes_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT "prefixes_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments Allow authenticated users to read assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read assignments" ON public.assignments FOR SELECT TO authenticated USING (((status = 'active'::text) AND ((is_public = true) OR (EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = assignments.class_id) AND (classes.created_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.class_teachers
  WHERE ((class_teachers.class_id = assignments.class_id) AND (class_teachers.teacher_id = auth.uid())))))));


--
-- Name: assignments Allow public read access to public assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to public assignments" ON public.assignments FOR SELECT TO anon USING (((is_public = true) AND (status = 'active'::text)));


--
-- Name: chat_messages Allow public to create chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to create chat messages" ON public.chat_messages FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: submissions Allow public to create submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to create submissions" ON public.submissions FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: voice_messages Allow public to create voice messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to create voice messages" ON public.voice_messages FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: chat_messages Allow public to read chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to read chat messages" ON public.chat_messages FOR SELECT TO authenticated, anon USING (true);


--
-- Name: submissions Allow public to read submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to read submissions" ON public.submissions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: voice_messages Allow public to read voice messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to read voice messages" ON public.voice_messages FOR SELECT TO authenticated, anon USING (true);


--
-- Name: submissions Allow public to update submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to update submissions" ON public.submissions FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: voice_messages Allow public to update voice messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to update voice messages" ON public.voice_messages FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: classes Co-teachers can view their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Co-teachers can view their classes" ON public.classes FOR SELECT USING (public.is_class_co_teacher(id));


--
-- Name: class_teacher_invites Owner can create teacher invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can create teacher invites" ON public.class_teacher_invites FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_teacher_invites.class_id) AND (classes.created_by = auth.uid())))));


--
-- Name: class_groups Owner can manage class groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can manage class groups" ON public.class_groups USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_groups.class_id) AND (classes.created_by = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_groups.class_id) AND (classes.created_by = auth.uid())))));


--
-- Name: class_teacher_invites Owner can update teacher invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can update teacher invites" ON public.class_teacher_invites FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_teacher_invites.class_id) AND (classes.created_by = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_teacher_invites.class_id) AND (classes.created_by = auth.uid())))));


--
-- Name: class_teacher_invites Owner can view teacher invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can view teacher invites" ON public.class_teacher_invites FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_teacher_invites.class_id) AND (classes.created_by = auth.uid())))));


--
-- Name: class_teachers Owners can delete class teachers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete class teachers" ON public.class_teachers FOR DELETE USING (public.is_class_owner(class_id));


--
-- Name: classes Owners can manage their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage their classes" ON public.classes USING ((created_by = auth.uid())) WITH CHECK ((created_by = auth.uid()));


--
-- Name: class_teachers Owners can view all class teachers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can view all class teachers" ON public.class_teachers FOR SELECT USING (public.is_class_owner(class_id));


--
-- Name: classes Owners can view their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can view their classes" ON public.classes FOR SELECT USING ((created_by = auth.uid()));


--
-- Name: class_students Student can join class; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student can join class" ON public.class_students FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: class_students Student can view their enrollment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student can view their enrollment" ON public.class_students FOR SELECT USING ((auth.uid() = student_id));


--
-- Name: class_group_memberships Student can view their membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student can view their membership" ON public.class_group_memberships FOR SELECT USING ((auth.uid() = student_id));


--
-- Name: submissions Students can update their own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can update their own submissions" ON public.submissions FOR UPDATE USING ((((student_id IS NOT NULL) AND (student_id = auth.uid())) OR (responder_details IS NOT NULL))) WITH CHECK ((((student_id IS NOT NULL) AND (student_id = auth.uid())) OR (responder_details IS NOT NULL)));


--
-- Name: assignments Students can view assignments for their group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view assignments for their group" ON public.assignments FOR SELECT USING (((class_group_id IS NOT NULL) AND public.is_student_in_group(class_id, class_group_id) AND (status = 'active'::text)));


--
-- Name: content_items Students can view content items for their group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view content items for their group" ON public.content_items FOR SELECT USING (((class_group_id IS NOT NULL) AND public.is_student_in_group(class_id, class_group_id) AND (status = ANY (ARRAY['active'::text, 'draft'::text]))));


--
-- Name: learning_contents Students can view learning contents for their group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view learning contents for their group" ON public.learning_contents FOR SELECT USING (((class_group_id IS NOT NULL) AND public.is_student_in_group(class_id, class_group_id) AND (status = 'active'::text)));


--
-- Name: quizzes Students can view quizzes for their group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view quizzes for their group" ON public.quizzes FOR SELECT USING (((class_group_id IS NOT NULL) AND public.is_student_in_group(class_id, class_group_id) AND (status = 'active'::text)));


--
-- Name: classes Students can view their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their classes" ON public.classes FOR SELECT USING (public.is_class_student(id));


--
-- Name: submissions Students can view their own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own submissions" ON public.submissions FOR SELECT USING ((((student_id IS NOT NULL) AND (student_id = auth.uid())) OR (responder_details IS NOT NULL)));


--
-- Name: assignments Teachers can create assignments for their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can create assignments for their classes" ON public.assignments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = assignments.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: content_item_overrides Teachers can create content item overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can create content item overrides" ON public.content_item_overrides FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.content_items ci
     JOIN public.classes c ON ((c.id = ci.class_id)))
  WHERE ((ci.id = content_item_overrides.content_item_id) AND ((c.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = c.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: content_items Teachers can create content items for their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can create content items for their classes" ON public.content_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = content_items.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: learning_contents Teachers can create learning contents for their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can create learning contents for their classes" ON public.learning_contents FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = learning_contents.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: quizzes Teachers can create quizzes for their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can create quizzes for their classes" ON public.quizzes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = quizzes.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: class_student_invites Teachers can create student invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can create student invites" ON public.class_student_invites FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_student_invites.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: assignments Teachers can delete class assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete class assignments" ON public.assignments FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = assignments.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: content_item_overrides Teachers can delete content item overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete content item overrides" ON public.content_item_overrides FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.content_items ci
     JOIN public.classes c ON ((c.id = ci.class_id)))
  WHERE ((ci.id = content_item_overrides.content_item_id) AND ((c.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = c.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: content_items Teachers can delete their class content items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete their class content items" ON public.content_items FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = content_items.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: learning_contents Teachers can delete their class learning contents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete their class learning contents" ON public.learning_contents FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = learning_contents.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: quizzes Teachers can delete their class quizzes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete their class quizzes" ON public.quizzes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = quizzes.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: class_group_memberships Teachers can manage class memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage class memberships" ON public.class_group_memberships USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_group_memberships.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_group_memberships.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: assignments Teachers can update class assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update class assignments" ON public.assignments FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = assignments.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: content_item_overrides Teachers can update content item overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update content item overrides" ON public.content_item_overrides FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.content_items ci
     JOIN public.classes c ON ((c.id = ci.class_id)))
  WHERE ((ci.id = content_item_overrides.content_item_id) AND ((c.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = c.id) AND (class_teachers.teacher_id = auth.uid()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.content_items ci
     JOIN public.classes c ON ((c.id = ci.class_id)))
  WHERE ((ci.id = content_item_overrides.content_item_id) AND ((c.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = c.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: class_student_invites Teachers can update student invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update student invites" ON public.class_student_invites FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_student_invites.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_student_invites.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: submissions Teachers can update submissions for their class assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update submissions for their class assignments" ON public.submissions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.assignments
     JOIN public.classes ON ((classes.id = assignments.class_id)))
  WHERE ((assignments.assignment_id = submissions.assignment_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.assignments
     JOIN public.classes ON ((classes.id = assignments.class_id)))
  WHERE ((assignments.assignment_id = submissions.assignment_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: content_items Teachers can update their class content items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update their class content items" ON public.content_items FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = content_items.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = content_items.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: learning_contents Teachers can update their class learning contents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update their class learning contents" ON public.learning_contents FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = learning_contents.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = learning_contents.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: quizzes Teachers can update their class quizzes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update their class quizzes" ON public.quizzes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = quizzes.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid()))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = quizzes.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: class_groups Teachers can view class groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view class groups" ON public.class_groups FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_groups.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: class_group_memberships Teachers can view class memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view class memberships" ON public.class_group_memberships FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_group_memberships.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: class_students Teachers can view class students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view class students" ON public.class_students FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_students.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: content_item_overrides Teachers can view content item overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view content item overrides" ON public.content_item_overrides FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.content_items ci
     JOIN public.classes c ON ((c.id = ci.class_id)))
  WHERE ((ci.id = content_item_overrides.content_item_id) AND ((c.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = c.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: class_student_invites Teachers can view student invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view student invites" ON public.class_student_invites FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = class_student_invites.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: submissions Teachers can view submissions for their class assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view submissions for their class assignments" ON public.submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.assignments
     JOIN public.classes ON ((classes.id = assignments.class_id)))
  WHERE ((assignments.assignment_id = submissions.assignment_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: assignments Teachers can view their class assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view their class assignments" ON public.assignments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = assignments.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: content_items Teachers can view their class content items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view their class content items" ON public.content_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = content_items.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: learning_contents Teachers can view their class learning contents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view their class learning contents" ON public.learning_contents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = learning_contents.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: quizzes Teachers can view their class quizzes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view their class quizzes" ON public.quizzes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes
  WHERE ((classes.id = quizzes.class_id) AND ((classes.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.class_teachers
          WHERE ((class_teachers.class_id = classes.id) AND (class_teachers.teacher_id = auth.uid())))))))));


--
-- Name: class_teachers Teachers can view their own class_teachers entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view their own class_teachers entries" ON public.class_teachers FOR SELECT USING ((teacher_id = auth.uid()));


--
-- Name: classes Users can create classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create classes" ON public.classes FOR INSERT WITH CHECK ((created_by = auth.uid()));


--
-- Name: class_teachers Users can delete their class teacher records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their class teacher records" ON public.class_teachers FOR DELETE USING ((teacher_id = auth.uid()));


--
-- Name: classes Users can delete their own classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own classes" ON public.classes FOR DELETE USING ((created_by = auth.uid()));


--
-- Name: class_teachers Users can insert class teacher records for their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert class teacher records for their classes" ON public.class_teachers FOR INSERT WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: classes Users can update their own classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own classes" ON public.classes FOR UPDATE USING ((created_by = auth.uid())) WITH CHECK ((created_by = auth.uid()));


--
-- Name: class_teachers Users can view their class teacher records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their class teacher records" ON public.class_teachers FOR SELECT USING ((teacher_id = auth.uid()));


--
-- Name: classes Users can view their own classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own classes" ON public.classes FOR SELECT USING ((created_by = auth.uid()));


--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: class_group_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_group_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: class_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: class_student_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_student_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: class_students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;

--
-- Name: class_teacher_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_teacher_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: class_teachers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: content_item_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_item_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: content_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_contents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_contents ENABLE ROW LEVEL SECURITY;

--
-- Name: quizzes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

--
-- Name: submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: prefixes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict 1Ds3WuA4JbfQe34HF2EvpPmltSaqKtytTHcaBefbTS1qHCPIVJ7MvMMOsyMrBUY


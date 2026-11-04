-- A stand-in for what Supabase provides, so the migrations and the tests can run
-- in a throwaway local Postgres (scripts/laboratorio/cuentas-sql-de-verdad.mjs).
-- Never run this against a real project: it creates the schema Supabase owns.
--
-- Columns and foreign keys copied from the real project on 2026-11-03,
-- only for the tables the account functions touch and those the tests write to.
-- The rest of `auth` hangs from auth.users by the same cascades and stays empty.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role supabase_auth_admin login;

create schema auth;
grant usage on schema auth to anon, authenticated, supabase_auth_admin;

create type auth.one_time_token_type as enum (
    'confirmation_token', 'reauthentication_token', 'recovery_token',
    'email_change_token_new', 'email_change_token_current', 'phone_change_token'
);
create type auth.aal_level as enum ('aal1', 'aal2', 'aal3');
create type auth.code_challenge_method as enum ('s256', 'plain');

create table auth.users (
    instance_id uuid,
    id uuid primary key,
    aud varchar(255),
    role varchar(255),
    email varchar(255),
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    invited_at timestamptz,
    confirmation_token varchar(255),
    confirmation_sent_at timestamptz,
    recovery_token varchar(255),
    recovery_sent_at timestamptz,
    last_sign_in_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    created_at timestamptz,
    updated_at timestamptz,
    phone text unique default null,
    phone_confirmed_at timestamptz,
    confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
    is_sso_user boolean not null default false,
    deleted_at timestamptz,
    is_anonymous boolean not null default false
);

create table auth.identities (
    provider_id text not null,
    user_id uuid not null references auth.users (id) on delete cascade,
    identity_data jsonb not null,
    provider text not null,
    last_sign_in_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz,
    email text generated always as (lower(identity_data ->> 'email')) stored,
    id uuid primary key default gen_random_uuid(),
    unique (provider_id, provider)
);

create table auth.sessions (
    id uuid primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz,
    updated_at timestamptz,
    aal auth.aal_level,
    user_agent text,
    ip inet
);

-- No foreign key to auth.users, and user_id is text: that is why erase_account
-- deletes from here by hand.
create table auth.refresh_tokens (
    instance_id uuid,
    id bigserial primary key,
    token varchar(255) unique,
    user_id varchar(255),
    revoked boolean,
    created_at timestamptz,
    updated_at timestamptz,
    parent varchar(255),
    session_id uuid references auth.sessions (id) on delete cascade
);

create table auth.one_time_tokens (
    id uuid primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    token_type auth.one_time_token_type not null,
    token_hash text not null check (char_length(token_hash) > 0),
    relates_to text not null,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

-- No foreign key either.
create table auth.flow_state (
    id uuid primary key,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text not null,
    created_at timestamptz,
    updated_at timestamptz,
    authentication_method text not null
);

-- Nor here: the id and the address only live inside the payload.
create table auth.audit_log_entries (
    instance_id uuid,
    id uuid primary key,
    payload json,
    created_at timestamptz,
    ip_address varchar(64) not null default ''
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- What the Auth server may do in the real project: it writes its own tables.
grant select, insert, update, delete on all tables in schema auth to supabase_auth_admin;

-- pg_cron does not exist in a plain Postgres. The harness strips the `create
-- extension` line of the migration and the job lands in this table.
create schema cron;
create table cron.job (
    jobid bigserial primary key,
    schedule text not null,
    command text not null,
    jobname text unique,
    active boolean not null default true
);
create function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint
language sql
as $$
    insert into cron.job (schedule, command, jobname)
    values (p_schedule, p_command, p_name)
    returning jobid;
$$;

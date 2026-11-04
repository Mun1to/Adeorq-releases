-- Three things the account page needs before it can exist, none of which opens
-- anything:
--   1. A lock on the server. Until `private.registro.abierto` is true, the Auth
--      server cannot create a user, whatever page or key is used. Without it the
--      only thing keeping registration closed would be that nobody knows the key.
--   2. Accounts never confirmed are erased after 48 hours, so nobody can hoard
--      names with made-up addresses.
--   3. The owner can erase their own account for real, and that frees the name.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 1. The lock ---------------------------------------------------------------

create table private.registro (
    unica boolean primary key default true check (unica),
    abierto boolean not null default false
);

insert into private.registro default values;

alter table private.registro enable row level security;
revoke all on table private.registro from public, anon, authenticated;

-- It fails closed: only a direct SQL session of the database owner gets past it
-- (the test fixtures in supabase/tests/). The Auth server logs in with its own
-- role, so it stays out until the flag is flipped by hand.
create function private.refuse_signup_while_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if session_user <> 'postgres'
        and not coalesce((select r.abierto from private.registro as r), false)
    then
        raise exception using
            errcode = '42501',
            message = 'El registro todavía no está abierto.';
    end if;

    return new;
end;
$$;

create trigger auth_users_registro_cerrado
    before insert on auth.users
    for each row
    execute function private.refuse_signup_while_closed();

revoke all on function private.refuse_signup_while_closed() from public, anon, authenticated;

-- 2 and 3. Erasing ----------------------------------------------------------

-- The foreign keys of auth.users take the profile, identities, sessions and
-- one-time tokens with them. These three tables have no such key and would keep
-- the id or the address. The address is matched with its quotes so that erasing
-- a@b.co does not touch the lines of ba@b.com.
create function private.erase_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email text;
begin
    select lower(u.email)
    into v_email
    from auth.users as u
    where u.id = p_id;

    delete from auth.flow_state as f where f.user_id = p_id;
    delete from auth.refresh_tokens as t where t.user_id = p_id::text;
    delete from auth.audit_log_entries as a
    where position(p_id::text in a.payload::text) > 0
        or (
            v_email is not null
            and position('"' || v_email || '"' in lower(a.payload::text)) > 0
        );
    delete from auth.users as u where u.id = p_id;
end;
$$;

create function private.purge_unconfirmed_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id uuid;
    v_count integer := 0;
begin
    for v_id in
        select u.id
        from auth.users as u
        where u.email_confirmed_at is null
            and u.created_at < now() - interval '48 hours'
    loop
        perform private.erase_account(v_id);
        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;

-- Takes no id on purpose: the only account it can reach is the caller's.
create function private.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id uuid := auth.uid();
begin
    if v_id is null then
        raise exception using
            errcode = '42501',
            message = 'Hace falta una sesión.';
    end if;

    perform private.erase_account(v_id);
end;
$$;

create function public.borrar_mi_cuenta()
returns void
language sql
set search_path = ''
as $$
    select private.delete_own_account();
$$;

revoke all on function private.erase_account(uuid) from public, anon, authenticated;
revoke all on function private.purge_unconfirmed_accounts() from public, anon, authenticated;
revoke all on function private.delete_own_account() from public, anon, authenticated;
revoke all on function public.borrar_mi_cuenta() from public, anon, authenticated;

grant execute on function private.delete_own_account() to authenticated;
grant execute on function public.borrar_mi_cuenta() to authenticated;

select cron.schedule(
    'adeorq-borrar-cuentas-sin-confirmar',
    '17 * * * *',
    $$select private.purge_unconfirmed_accounts()$$
);

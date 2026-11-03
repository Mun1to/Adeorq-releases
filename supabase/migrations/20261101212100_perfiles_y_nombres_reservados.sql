create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to anon, authenticated;

create table public.perfiles (
    id uuid primary key references auth.users (id) on delete cascade,
    usuario text not null,
    created_at timestamptz not null default now(),
    -- The name keeps the capitals its owner chose (@Munito on the share card);
    -- the unique index below is what makes it case-insensitive.
    constraint perfiles_usuario_formato check (usuario ~ '^[A-Za-z0-9_]{3,20}$')
);

create unique index perfiles_usuario_sin_mayusculas_uidx
    on public.perfiles (lower(usuario));

create table private.reserved_usernames (
    username text primary key
        check (username ~ '^[a-z0-9_]{3,20}$'),
    allowed_email text,
    reason text not null
);

alter table public.perfiles enable row level security;
alter table private.reserved_usernames enable row level security;

revoke all on table public.perfiles from anon, authenticated;
revoke all on table private.reserved_usernames from public, anon, authenticated;
grant select on table public.perfiles to authenticated;
grant update (usuario) on table public.perfiles to authenticated;

create policy perfiles_leer_el_propio
    on public.perfiles
    for select
    to authenticated
    using (id = (select auth.uid()));

create policy perfiles_cambiar_el_propio
    on public.perfiles
    for update
    to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

insert into private.reserved_usernames (username, allowed_email, reason)
values
    ('adeorq', null, 'Product name'),
    ('admin', null, 'Administrative account name'),
    ('soporte', null, 'Support account name'),
    ('support', null, 'Support account name'),
    ('ayuda', null, 'Support account name'),
    ('help', null, 'Support account name'),
    ('root', null, 'System account name'),
    ('system', null, 'System account name'),
    ('staff', null, 'Staff account name'),
    ('seguridad', null, 'Security account name'),
    ('security', null, 'Security account name'),
    ('contacto', null, 'Contact account name'),
    ('contact', null, 'Contact account name'),
    ('cuentas', null, 'Account management name'),
    ('account', null, 'Account management name'),
    ('api', null, 'Technical account name'),
    ('www', null, 'Technical account name'),
    ('mail', null, 'Technical account name'),
    ('email', null, 'Technical account name'),
    ('owner', null, 'Administrative account name'),
    ('moderador', null, 'Moderation account name'),
    ('moderator', null, 'Moderation account name'),
    ('test', null, 'Test account name'),
    ('testing', null, 'Test account name'),
    ('null', null, 'Reserved technical value'),
    ('undefined', null, 'Reserved technical value'),
    ('orquio', null, 'Product name'),
    ('vocript', null, 'Product name'),
    ('layco', null, 'Product name'),
    ('froede', null, 'Product name'),
    ('vidorq', null, 'Product name'),
    ('expoal', null, 'Product name'),
    ('moneorq', null, 'Product name'),
    ('munito', null, 'Reserved for Munir; authorized email pending'),
    ('mun1to', null, 'Reserved for Munir; authorized email pending'),
    ('munitodev', null, 'Reserved for Munir; authorized email pending'),
    ('openai', null, 'Third-party brand'),
    ('anthropic', null, 'Third-party brand'),
    ('claude', null, 'Third-party brand'),
    ('gemini', null, 'Third-party brand'),
    ('kimi', null, 'Third-party brand'),
    ('github', null, 'Third-party brand'),
    ('google', null, 'Third-party brand'),
    ('microsoft', null, 'Third-party brand'),
    ('apple', null, 'Third-party brand'),
    ('cloudflare', null, 'Third-party brand'),
    ('supabase', null, 'Third-party brand'),
    ('tauri', null, 'Third-party brand'),
    ('rust', null, 'Third-party brand'),
    ('react', null, 'Third-party brand'),
    ('docker', null, 'Third-party brand'),
    ('linux', null, 'Third-party brand'),
    ('windows', null, 'Third-party brand'),
    ('macos', null, 'Third-party brand');

create function private.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        p_username ~ '^[A-Za-z0-9_]{3,20}$'
        and not exists (
            select 1
            from public.perfiles as p
            where lower(p.usuario) = lower(p_username)
        )
        and not exists (
            select 1
            from private.reserved_usernames as r
            where r.username = lower(p_username)
        ),
        false
    );
$$;

create function public.usuario_disponible(p_usuario text)
returns boolean
language sql
stable
set search_path = ''
as $$
    select private.is_username_available(p_usuario);
$$;

create function private.validate_profile_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_allowed_email text;
    v_account_email text;
begin
    if new.usuario is null or new.usuario !~ '^[A-Za-z0-9_]{3,20}$' then
        raise exception using
            errcode = '22023',
            message = 'El nombre debe tener entre 3 y 20 letras, cifras o guiones bajos.';
    end if;

    select lower(r.allowed_email)
    into v_allowed_email
    from private.reserved_usernames as r
    where r.username = lower(new.usuario);

    if found then
        select lower(btrim(u.email))
        into v_account_email
        from auth.users as u
        where u.id = new.id;

        if v_allowed_email is null or v_account_email is distinct from v_allowed_email then
            raise exception using
                errcode = '42501',
                message = format('El nombre @%s está reservado.', lower(new.usuario));
        end if;
    end if;

    return new;
end;
$$;

create function private.create_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_username text;
begin
    v_username := new.raw_user_meta_data ->> 'usuario';

    if v_username is null or v_username !~ '^[A-Za-z0-9_]{3,20}$' then
        raise exception using
            errcode = '22023',
            message = 'El nombre debe tener entre 3 y 20 letras, cifras o guiones bajos.';
    end if;

    begin
        insert into public.perfiles (id, usuario)
        values (new.id, v_username);
    exception
        when unique_violation then
            raise exception using
                errcode = '23505',
                message = 'Ese nombre de usuario ya está ocupado.';
    end;

    return new;
end;
$$;

create trigger perfiles_validar_usuario
    before insert or update of usuario on public.perfiles
    for each row
    execute function private.validate_profile_username();

create trigger auth_users_crear_perfil
    after insert on auth.users
    for each row
    execute function private.create_profile_from_auth_user();

revoke all on function private.is_username_available(text) from public, anon, authenticated;
revoke all on function public.usuario_disponible(text) from public, anon, authenticated;
revoke all on function private.validate_profile_username() from public, anon, authenticated;
revoke all on function private.create_profile_from_auth_user() from public, anon, authenticated;

grant execute on function private.is_username_available(text) to anon, authenticated;
grant execute on function public.usuario_disponible(text) to anon, authenticated;

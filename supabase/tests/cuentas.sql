-- Run this file as a database owner after applying the migrations. It ends with a
-- rollback and must print TODO BIEN: any failed check raises an exception. All
-- fixtures go straight into auth.users, so no Auth API request is made and no
-- confirmation email is sent.

begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  -- The 48 hours: too old, not old enough, and old but confirmed.
  ('00000000-0000-4000-8000-00000000e5a1','authenticated','authenticated','e5-vieja@invalid.test','',null,'{"provider":"email","providers":["email"]}','{"usuario":"prueba_e5_vieja"}',now() - interval '49 hours',now()),
  ('00000000-0000-4000-8000-00000000e5a2','authenticated','authenticated','e5-reciente@invalid.test','',null,'{"provider":"email","providers":["email"]}','{"usuario":"prueba_e5_reciente"}',now() - interval '47 hours',now()),
  ('00000000-0000-4000-8000-00000000e5a3','authenticated','authenticated','e5-confirmada@invalid.test','',now(),'{"provider":"email","providers":["email"]}','{"usuario":"prueba_e5_confirma"}',now() - interval '30 days',now()),
  -- Erasing: the owner, and a neighbour whose address contains the owner's.
  ('00000000-0000-4000-8000-00000000e5b1','authenticated','authenticated','e5-borra@invalid.test','',now(),'{"provider":"email","providers":["email"]}','{"usuario":"Prueba_E5_Borra"}',now(),now()),
  ('00000000-0000-4000-8000-00000000e5b2','authenticated','authenticated','xe5-borra@invalid.test','',now(),'{"provider":"email","providers":["email"]}','{"usuario":"prueba_e5_vecina"}',now(),now());

-- Everything of the owner that the Auth server would have written by now.
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('00000000-0000-4000-8000-00000000e5b1','00000000-0000-4000-8000-00000000e5b1','{"sub":"00000000-0000-4000-8000-00000000e5b1","email":"e5-borra@invalid.test"}','email');
insert into auth.sessions (id, user_id)
values ('00000000-0000-4000-8000-00000000e5c1','00000000-0000-4000-8000-00000000e5b1');
insert into auth.refresh_tokens (token, user_id, session_id)
values
  ('e5-token-con-sesion','00000000-0000-4000-8000-00000000e5b1','00000000-0000-4000-8000-00000000e5c1'),
  ('e5-token-suelto','00000000-0000-4000-8000-00000000e5b1',null);
insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to)
values ('00000000-0000-4000-8000-00000000e5c2','00000000-0000-4000-8000-00000000e5b1','recovery_token','e5-hash','e5-borra@invalid.test');
insert into auth.flow_state (id, user_id, provider_type, authentication_method)
values ('00000000-0000-4000-8000-00000000e5c3','00000000-0000-4000-8000-00000000e5b1','email','email');
insert into auth.audit_log_entries (id, payload)
values
  ('00000000-0000-4000-8000-00000000e5d1','{"action":"login","actor_id":"00000000-0000-4000-8000-00000000e5b1","actor_username":"e5-borra@invalid.test"}'),
  ('00000000-0000-4000-8000-00000000e5d2','{"action":"user_recovery_requested","traits":{"user_email":"E5-Borra@invalid.test"}}'),
  ('00000000-0000-4000-8000-00000000e5d3','{"action":"login","actor_id":"00000000-0000-4000-8000-00000000e5b2","actor_username":"xe5-borra@invalid.test"}');

-- The lock and the job are in place.
do $$
begin
  if coalesce((select abierto from private.registro), true) then raise exception 'FALLO: el registro esta abierto'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'auth_users_registro_cerrado' and tgrelid = 'auth.users'::regclass and tgenabled = 'O') then
    raise exception 'FALLO: falta el cerrojo del registro';
  end if;
  if not exists (select 1 from cron.job where jobname = 'adeorq-borrar-cuentas-sin-confirmar' and active and schedule = '17 * * * *') then
    raise exception 'FALLO: falta el trabajo que borra las cuentas sin confirmar';
  end if;
end $$;

-- The 48 hours.
do $$
begin
  if public.usuario_disponible('prueba_e5_vieja') then raise exception 'FALLO: la vieja ya salia libre antes de borrarla'; end if;
  perform private.purge_unconfirmed_accounts();
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000e5a1') then raise exception 'FALLO: sigue la cuenta de 49 horas sin confirmar'; end if;
  if not public.usuario_disponible('prueba_e5_vieja') then raise exception 'FALLO: su nombre no ha quedado libre'; end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000e5a2') then raise exception 'FALLO: borro la de 47 horas'; end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000e5a3') then raise exception 'FALLO: borro una confirmada'; end if;
  if public.usuario_disponible('prueba_e5_reciente') or public.usuario_disponible('prueba_e5_confirma') then raise exception 'FALLO: liberó un nombre que sigue en uso'; end if;
end $$;

-- Who may erase what.
set local role anon;
do $$
begin
  begin
    perform public.borrar_mi_cuenta();
    raise exception 'FALLO: anon puede borrar';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
do $$
begin
  -- A signed-in role with no id in its token.
  begin
    perform public.borrar_mi_cuenta();
    raise exception 'FALLO: borra sin sesion';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000e5b1',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000e5b1","role":"authenticated"}',true);
do $$
begin
  begin
    perform private.erase_account('00000000-0000-4000-8000-00000000e5b2');
    raise exception 'FALLO: puede borrar la cuenta de otro';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.purge_unconfirmed_accounts();
    raise exception 'FALLO: puede lanzar la limpieza';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.registro;
    raise exception 'FALLO: lee el cerrojo';
  exception when insufficient_privilege then null;
  end;
  begin
    update private.registro set abierto = true;
    raise exception 'FALLO: abre el registro';
  exception when insufficient_privilege then null;
  end;

  perform public.borrar_mi_cuenta();
end $$;
reset role;

-- Nothing of theirs is left anywhere: every column that can hold text, of every
-- table in the three schemas, searched for the id, the address, the name and the
-- tokens. A table the Auth server adds tomorrow is covered without touching this.
do $$
declare
  r record;
  v_n bigint;
  v_rastro constant text := '00000000e5b1|00000000e5c[123]|00000000e5d[12]|(^|[^a-z0-9])e5-borra@invalid\.test|prueba_e5_borra|e5-token|e5-hash';
begin
  for r in
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns as c
    join information_schema.tables as t using (table_schema, table_name)
    where c.table_schema in ('auth', 'public', 'private')
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('uuid', 'text', 'character varying', 'json', 'jsonb', 'ARRAY')
  loop
    execute format('select count(*) from %I.%I where %I::text ~* %L', r.table_schema, r.table_name, r.column_name, v_rastro) into v_n;
    if v_n > 0 then
      raise exception 'FALLO: queda rastro en %.%.%: % filas', r.table_schema, r.table_name, r.column_name, v_n;
    end if;
  end loop;

  if not public.usuario_disponible('PRUEBA_E5_BORRA') then raise exception 'FALLO: su nombre no ha quedado libre'; end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000e5b2') then raise exception 'FALLO: borro a la vecina'; end if;
  if not exists (select 1 from auth.audit_log_entries where id = '00000000-0000-4000-8000-00000000e5d3') then raise exception 'FALLO: borro la linea de la vecina'; end if;
end $$;

select 'TODO BIEN' as resultado;
rollback;

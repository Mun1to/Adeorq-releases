-- Run this file as a database owner after applying the migration. It ends with a
-- rollback and must print TODO BIEN: any failed check raises an exception.
-- All fixtures are created directly in auth.users inside a transaction, so no
-- Auth API request is made and no confirmation email is sent.

begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000c1a1','authenticated','authenticated','c1-a@invalid.test','',now(),'{"provider":"email","providers":["email"]}','{"usuario":"prueba_c1_a"}',now(),now()),
  ('00000000-0000-4000-8000-00000000c1b1','authenticated','authenticated','c1-b@invalid.test','',now(),'{"provider":"email","providers":["email"]}','{"usuario":"Prueba_Mayus"}',now(),now());

do $$
declare v_message text; v_nombre text;
begin
  if public.usuario_disponible('prueba_c1_a') then raise exception 'FALLO: ocupado salio libre'; end if;
  if public.usuario_disponible('PRUEBA_C1_A') then raise exception 'FALLO: ocupado en mayusculas salio libre'; end if;
  if not public.usuario_disponible('nombre_libre_c1') then raise exception 'FALLO: libre salio ocupado'; end if;
  if public.usuario_disponible('nombre-con-guion') then raise exception 'FALLO: formato malo aceptado'; end if;
  if public.usuario_disponible('MUNITO') then raise exception 'FALLO: reservado en mayusculas salio libre'; end if;
  if public.usuario_disponible(null) then raise exception 'FALLO: null salio libre'; end if;

  -- The name keeps the capitals its owner chose.
  select usuario into v_nombre from public.perfiles where id='00000000-0000-4000-8000-00000000c1b1';
  if v_nombre <> 'Prueba_Mayus' then raise exception 'FALLO: no conserva mayusculas: %', v_nombre; end if;

  begin
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-8000-00000000c1a2','authenticated','authenticated','c1-dup@invalid.test','',now(),'{"provider":"email","providers":["email"]}','{"usuario":"PRUEBA_C1_A"}',now(),now());
    raise exception 'FALLO: segunda cuenta con el mismo nombre';
  exception when unique_violation then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'Ese nombre de usuario ya está ocupado.' then raise exception 'FALLO: error inesperado %', v_message; end if;
  end;

  begin
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-8000-00000000c1a3','authenticated','authenticated','c1-res@invalid.test','',now(),'{"provider":"email","providers":["email"]}','{"usuario":"Munito"}',now(),now());
    raise exception 'FALLO: otra cuenta cogio Munito';
  exception when insufficient_privilege then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'El nombre @munito está reservado.' then raise exception 'FALLO: error inesperado %', v_message; end if;
  end;

  begin
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-8000-00000000c1a4','authenticated','authenticated','c1-sin@invalid.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
    raise exception 'FALLO: alta sin nombre';
  exception when invalid_parameter_value then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000c1a1',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000c1a1","role":"authenticated"}',true);

do $$
declare v_changed integer;
begin
  if (select count(*) from public.perfiles) <> 1 then raise exception 'FALLO: RLS deja leer lo ajeno'; end if;
  update public.perfiles set usuario='intento_ajeno_c1' where id='00000000-0000-4000-8000-00000000c1b1';
  get diagnostics v_changed = row_count;
  if v_changed <> 0 then raise exception 'FALLO: RLS deja cambiar lo ajeno'; end if;
  update public.perfiles set usuario='prueba_c1_propia' where id='00000000-0000-4000-8000-00000000c1a1';
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'FALLO: no puede cambiar lo suyo'; end if;
  begin
    update public.perfiles set usuario='admin' where id='00000000-0000-4000-8000-00000000c1a1';
    raise exception 'FALLO: cambio a un nombre reservado';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.reserved_usernames limit 1;
    raise exception 'FALLO: lee los reservados';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.perfiles set id='00000000-0000-4000-8000-00000000c1b1' where id='00000000-0000-4000-8000-00000000c1a1';
    raise exception 'FALLO: cambia su id';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
do $$
begin
  if public.usuario_disponible('algo_libre_anon') is not true then raise exception 'FALLO: anon no puede comprobar'; end if;
  begin
    perform 1 from public.perfiles limit 1;
    raise exception 'FALLO: anon lee perfiles';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'TODO BIEN' as resultado;
rollback;

-- True concurrent race check, run the two session files in separate database
-- connections as described in perfiles_carrera_a.sql and perfiles_carrera_b.sql.

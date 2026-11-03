-- Start this file in session B while perfiles_carrera_a.sql is inside its
-- 20-second sleep in session A. This insert must wait, then fail with SQLSTATE
-- 23505 and "Ese nombre de usuario ya está ocupado." after session A commits.

insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
values (
    '00000000-0000-4000-8000-00000000c1f2',
    'authenticated',
    'authenticated',
    'c1-race-b@invalid.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"usuario":"prueba_c1_carrera"}',
    now(),
    now()
);

-- After session B reports the expected error, remove the committed fixture:
-- delete from auth.users where id = '00000000-0000-4000-8000-00000000c1f1';

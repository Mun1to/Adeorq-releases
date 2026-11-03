-- Run this file in session A, then run perfiles_carrera_b.sql in session B
-- before the 20-second sleep ends. Both sessions must connect as a database
-- owner. This direct fixture insert does not call the Auth API or send email.

begin;

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
    '00000000-0000-4000-8000-00000000c1f1',
    'authenticated',
    'authenticated',
    'c1-race-a@invalid.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"usuario":"prueba_c1_carrera"}',
    now(),
    now()
);

select pg_sleep(20);

commit;

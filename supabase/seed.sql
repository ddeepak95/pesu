begin;

-- Seed a default institution for local development.
-- Idempotent: only inserts when no default exists.
insert into public.institutions (id, name, slug, status, is_default)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Default Institution',
  'default',
  'active',
  true
where not exists (
  select 1 from public.institutions where is_default = true
);

-- Seed a deterministic local super admin user for email/password login.
-- GoTrue requires token columns to be '' (not NULL) when scanning auth.users.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000010'::uuid,
  'authenticated',
  'authenticated',
  'admin@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
where not exists (
  select 1
  from auth.users
  where id = '00000000-0000-0000-0000-000000000010'::uuid
);

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000011'::uuid,
  '00000000-0000-0000-0000-000000000010'::uuid,
  jsonb_build_object(
    'sub',
    '00000000-0000-0000-0000-000000000010',
    'email',
    'admin@example.com'
  ),
  'email',
  '00000000-0000-0000-0000-000000000010',
  now(),
  now(),
  now()
where not exists (
  select 1
  from auth.identities
  where user_id = '00000000-0000-0000-0000-000000000010'::uuid
    and provider = 'email'
);

insert into public.platform_super_admins (user_id)
values ('00000000-0000-0000-0000-000000000010'::uuid)
on conflict (user_id) do nothing;

-- Seed a deterministic teacher account (class owner for local dev).
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000030'::uuid,
  'authenticated',
  'authenticated',
  'teacher@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
where not exists (
  select 1
  from auth.users
  where id = '00000000-0000-0000-0000-000000000030'::uuid
);

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000031'::uuid,
  '00000000-0000-0000-0000-000000000030'::uuid,
  jsonb_build_object(
    'sub',
    '00000000-0000-0000-0000-000000000030',
    'email',
    'teacher@example.com'
  ),
  'email',
  '00000000-0000-0000-0000-000000000030',
  now(),
  now(),
  now()
where not exists (
  select 1
  from auth.identities
  where user_id = '00000000-0000-0000-0000-000000000030'::uuid
    and provider = 'email'
);

-- Seed a deterministic student account.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000020'::uuid,
  'authenticated',
  'authenticated',
  'student@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
where not exists (
  select 1
  from auth.users
  where id = '00000000-0000-0000-0000-000000000020'::uuid
);

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000021'::uuid,
  '00000000-0000-0000-0000-000000000020'::uuid,
  jsonb_build_object(
    'sub',
    '00000000-0000-0000-0000-000000000020',
    'email',
    'student@example.com'
  ),
  'email',
  '00000000-0000-0000-0000-000000000020',
  now(),
  now(),
  now()
where not exists (
  select 1
  from auth.identities
  where user_id = '00000000-0000-0000-0000-000000000020'::uuid
    and provider = 'email'
);

-- Seed one class owned by the seeded teacher.
insert into public.classes (
  id,
  name,
  class_id,
  created_by,
  status,
  preferred_language,
  institution_id
)
values (
  '00000000-0000-0000-0000-000000000100'::uuid,
  'Seed Class',
  'seedc001',
  '00000000-0000-0000-0000-000000000030'::uuid,
  'active',
  'en',
  '00000000-0000-0000-0000-000000000001'::uuid
)
on conflict (class_id) do nothing;

-- If the class already existed from an older seed, ensure the teacher remains owner.
update public.classes
set created_by = '00000000-0000-0000-0000-000000000030'::uuid
where class_id = 'seedc001'
  and created_by <> '00000000-0000-0000-0000-000000000030'::uuid;

insert into public.class_teachers (class_id, teacher_id, role)
select
  c.id,
  '00000000-0000-0000-0000-000000000030'::uuid,
  'owner'
from public.classes c
where c.class_id = 'seedc001'
on conflict (class_id, teacher_id)
do update set role = 'owner';

-- Enroll seeded student in the seeded class.
insert into public.class_students (class_id, student_id, status)
select
  c.id,
  '00000000-0000-0000-0000-000000000020'::uuid,
  'active'
from public.classes c
where c.class_id = 'seedc001'
on conflict (class_id, student_id) do nothing;

-- Repair seeded users created before token columns were set (GoTrue login fix).
update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, '')
where id in (
  '00000000-0000-0000-0000-000000000010'::uuid,
  '00000000-0000-0000-0000-000000000020'::uuid,
  '00000000-0000-0000-0000-000000000030'::uuid
);

commit;


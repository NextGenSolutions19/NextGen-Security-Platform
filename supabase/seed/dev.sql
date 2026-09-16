-- Development seed data ONLY.
-- Do not rely on these credentials in production environments.

insert into public.societies (id, society_code, name, status)
values
  (
    '11111111-1111-1111-1111-111111111101',
    'DEMO',
    'Demo Residential Society',
    'active'
  ),
  (
    '11111111-1111-1111-1111-111111111102',
    'DEMO2',
    'Second Demo Society',
    'active'
  )
on conflict (society_code) do nothing;

-- Bootstrap admin (must change password on first login)
-- login_id: ADMIN / password: ADMIN123 (development seed only)
insert into public.app_users (
  id,
  login_id,
  password_hash,
  role,
  society_id,
  status,
  must_change_password,
  is_authorized_admin
)
values
  (
    '22222222-2222-2222-2222-222222222201',
    'ADMIN',
    crypt('ADMIN123', gen_salt('bf')),
    'society_admin',
    '11111111-1111-1111-1111-111111111101',
    'active',
    true,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222202',
    'GUARD01',
    crypt('guard123', gen_salt('bf')),
    'guard',
    '11111111-1111-1111-1111-111111111101',
    'active',
    false,
    false
  ),
  (
    '22222222-2222-2222-2222-222222222203',
    'ADMIN2',
    crypt('admin123', gen_salt('bf')),
    'society_admin',
    '11111111-1111-1111-1111-111111111102',
    'active',
    false,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222204',
    'GUARD02',
    crypt('guard123', gen_salt('bf')),
    'guard',
    '11111111-1111-1111-1111-111111111102',
    'active',
    false,
    false
  )
on conflict (login_id) do nothing;

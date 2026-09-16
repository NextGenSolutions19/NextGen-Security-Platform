-- M01 RLS isolation tests
-- Run against a database with dev seed applied.
-- Example: supabase db reset (local) then psql ... -f supabase/tests/rls/m01_rls_tests.sql

begin;

-- Simulate JWT claims for Society A admin
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '22222222-2222-2222-2222-222222222201',
    'role', 'authenticated',
    'app_user_id', '22222222-2222-2222-2222-222222222201',
    'app_role', 'society_admin',
    'society_id', '11111111-1111-1111-1111-111111111101',
    'society_code', 'DEMO',
    'is_authorized_admin', true
  )::text,
  true
);

set local role authenticated;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.societies
  where id = '11111111-1111-1111-1111-111111111101';

  if v_count <> 1 then
    raise exception 'FAIL: Society A admin cannot read own society';
  end if;

  select count(*) into v_count
  from public.societies
  where id = '11111111-1111-1111-1111-111111111102';

  if v_count <> 0 then
    raise exception 'FAIL: Society A admin can read Society B (cross-tenant leak)';
  end if;
end $$;

rollback;

begin;

-- Simulate JWT claims for Society B guard
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '22222222-2222-2222-2222-222222222204',
    'role', 'authenticated',
    'app_user_id', '22222222-2222-2222-2222-222222222204',
    'app_role', 'guard',
    'society_id', '11111111-1111-1111-1111-111111111102',
    'society_code', 'DEMO2',
    'is_authorized_admin', false
  )::text,
  true
);

set local role authenticated;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.app_users
  where id = '22222222-2222-2222-2222-222222222204';

  if v_count <> 1 then
    raise exception 'FAIL: Society B guard cannot read own profile';
  end if;

  select count(*) into v_count
  from public.app_users
  where id = '22222222-2222-2222-2222-222222222201';

  if v_count <> 0 then
    raise exception 'FAIL: Society B guard can read Society A admin profile';
  end if;
end $$;

rollback;

-- If both blocks complete without exception, RLS base tests passed.

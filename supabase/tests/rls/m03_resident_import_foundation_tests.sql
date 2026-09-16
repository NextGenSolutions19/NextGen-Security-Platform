-- M03-T03 Phase 1C-A RLS / integrity tests for resident import foundation.
-- Run locally AFTER the draft migration is applied to a DB with dev seed.
-- Example (local only): psql ... -f supabase/tests/rls/m03_resident_import_foundation_tests.sql
-- Do not run against remote production as a mutation script; each block rolls back.

-- ---------------------------------------------------------------------------
-- Comparison keys (display preserved; A/a and Tower A match)
-- ---------------------------------------------------------------------------

begin;

do $$
begin
  if public.normalize_resident_compare_key('A')
    <> public.normalize_resident_compare_key('a') then
    raise exception 'FAIL: A and a must compare equal';
  end if;

  if public.normalize_resident_compare_key(' Tower A ')
    <> public.normalize_resident_compare_key('tower a') then
    raise exception 'FAIL: trimmed/collapsed building keys must match';
  end if;

  if public.normalize_resident_compare_key(null) <> '' then
    raise exception 'FAIL: null building must be canonical empty key';
  end if;

  if public.normalize_resident_compare_key('   ') <> '' then
    raise exception 'FAIL: whitespace-only building must be canonical empty key';
  end if;

  if public.normalize_resident_compare_key('A-101')
    = public.normalize_resident_compare_key('A101') then
    raise exception 'FAIL: hyphen in flat number must be preserved';
  end if;
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- Setup helpers: insert tenants' residents as table owner, then test RLS.
-- ---------------------------------------------------------------------------

begin;

insert into public.flats (society_id, flat_number, wing_building, status)
values
  ('11111111-1111-1111-1111-111111111101', 'IMP101', 'A', 'active'),
  ('11111111-1111-1111-1111-111111111102', 'IMP101', 'A', 'active');

insert into public.residents (id, society_id, name, mobile, status)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111101',
    'Raj Patel',
    '9876543210',
    'active'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '11111111-1111-1111-1111-111111111101',
    'Neha Patel',
    '9876543210',
    'active'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    '11111111-1111-1111-1111-111111111102',
    'Other Society Resident',
    '9123456789',
    'active'
  );

-- Two different residents MAY share the same mobile.
insert into public.resident_contact_numbers (
  society_id, resident_id, mobile_digits, kind
) values
  (
    '11111111-1111-1111-1111-111111111101',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '9876543210',
    'primary'
  ),
  (
    '11111111-1111-1111-1111-111111111101',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '9876543210',
    'primary'
  );

-- Same resident cannot get the same digits twice.
do $$
begin
  begin
    insert into public.resident_contact_numbers (
      society_id, resident_id, mobile_digits, kind
    ) values (
      '11111111-1111-1111-1111-111111111101',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      '9876543210',
      'additional'
    );
    raise exception 'FAIL: duplicate contact for same resident was allowed';
  exception
    when unique_violation then
      null;
  end;
end $$;

-- Invalid mobile rejected.
do $$
begin
  begin
    insert into public.resident_contact_numbers (
      society_id, resident_id, mobile_digits, kind
    ) values (
      '11111111-1111-1111-1111-111111111101',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      '12345',
      'additional'
    );
    raise exception 'FAIL: invalid mobile was allowed';
  exception
    when check_violation then
      null;
  end;
end $$;

-- Additional number on same resident is allowed when digits differ.
insert into public.resident_contact_numbers (
  society_id, resident_id, mobile_digits, kind
) values (
  '11111111-1111-1111-1111-111111111101',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  '9988776655',
  'additional'
);

-- Second primary on same resident rejected.
do $$
begin
  begin
    insert into public.resident_contact_numbers (
      society_id, resident_id, mobile_digits, kind
    ) values (
      '11111111-1111-1111-1111-111111111101',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      '9000000001',
      'primary'
    );
    raise exception 'FAIL: second primary contact was allowed';
  exception
    when unique_violation then
      null;
  end;
end $$;

-- Custom field definition + value; disable must keep value.
insert into public.society_resident_field_definitions (
  id, society_id, field_key, display_label, field_type, is_enabled, options
) values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  '11111111-1111-1111-1111-111111111101',
  'parking_slot',
  'Parking Slot',
  'text',
  true,
  '[]'::jsonb
);

insert into public.resident_custom_field_values (
  society_id, resident_id, field_definition_id, value_text
) values (
  '11111111-1111-1111-1111-111111111101',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'P-12'
);

update public.society_resident_field_definitions
set is_enabled = false
where id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.resident_custom_field_values
  where field_definition_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';

  if v_count <> 1 then
    raise exception 'FAIL: disabling a definition deleted historical values';
  end if;
end $$;

-- Options JSON must be an array, not an object.
do $$
begin
  begin
    insert into public.society_resident_field_definitions (
      society_id, field_key, display_label, field_type, options
    ) values (
      '11111111-1111-1111-1111-111111111101',
      'bad_options',
      'Bad Options',
      'dropdown',
      '{}'::jsonb
    );
    raise exception 'FAIL: non-array field options were allowed';
  exception
    when check_violation then
      null;
  end;
end $$;

-- Cross-society definition cannot be attached to Society A resident.
insert into public.society_resident_field_definitions (
  id, society_id, field_key, display_label, field_type
) values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  '11111111-1111-1111-1111-111111111102',
  'parking_slot',
  'Parking Slot',
  'text'
);

do $$
begin
  begin
    insert into public.resident_custom_field_values (
      society_id, resident_id, field_definition_id, value_text
    ) values (
      '11111111-1111-1111-1111-111111111101',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'cccccccc-cccc-cccc-cccc-ccccccccccc2',
      'cross'
    );
    raise exception 'FAIL: cross-society custom field value was allowed';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then
        raise;
      end if;
  end;
end $$;

-- Guard users cannot own import jobs even when inserted as table owner.
do $$
begin
  begin
    insert into public.resident_import_jobs (
      society_id, created_by_app_user_id, original_filename, job_status
    ) values (
      '11111111-1111-1111-1111-111111111101',
      '22222222-2222-2222-2222-222222222202',
      'guard-owned.xlsx',
      'uploaded'
    );
    raise exception 'FAIL: Guard was allowed as import job creator';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then
        raise;
      end if;
  end;
end $$;

-- Creating an import job/row must not insert residents.
do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.residents;

  insert into public.resident_import_jobs (
    id, society_id, created_by_app_user_id, original_filename, job_status
  ) values (
    'dddddddd-dddd-dddd-dddd-ddddddddddd1',
    '11111111-1111-1111-1111-111111111101',
    '22222222-2222-2222-2222-222222222201',
    'test-residents.xlsx',
    'uploaded'
  );

  insert into public.resident_import_job_rows (
    society_id, job_id, row_number, source_data, row_status
  ) values (
    '11111111-1111-1111-1111-111111111101',
    'dddddddd-dddd-dddd-dddd-ddddddddddd1',
    1,
    '{"Name":"Raj Patel"}'::jsonb,
    'VALID_NEW'
  );

  select count(*) into v_after from public.residents;
  if v_after <> v_before then
    raise exception 'FAIL: import job/row creation wrote resident rows';
  end if;
end $$;

do $$
begin
  begin
    insert into public.resident_import_job_rows (
      society_id, job_id, row_number, row_status
    ) values (
      '11111111-1111-1111-1111-111111111101',
      'dddddddd-dddd-dddd-dddd-ddddddddddd1',
      2,
      'UPDATED'
    );
    raise exception 'FAIL: UPDATED row status was allowed';
  exception
    when check_violation then
      null;
  end;
end $$;

do $$
begin
  begin
    insert into public.resident_import_job_rows (
      society_id, job_id, row_number, row_status
    ) values (
      '11111111-1111-1111-1111-111111111101',
      'dddddddd-dddd-dddd-dddd-ddddddddddd1',
      21,
      'MERGED'
    );
    raise exception 'FAIL: MERGED row status was allowed';
  exception
    when check_violation then
      null;
  end;
end $$;

do $$
begin
  begin
    insert into public.resident_import_job_rows (
      society_id, job_id, row_number, row_status
    ) values (
      '11111111-1111-1111-1111-111111111101',
      'dddddddd-dddd-dddd-dddd-ddddddddddd1',
      22,
      'OVERWRITTEN'
    );
    raise exception 'FAIL: OVERWRITTEN row status was allowed';
  exception
    when check_violation then
      null;
  end;
end $$;

do $$
begin
  begin
    insert into public.resident_import_job_rows (
      society_id, job_id, row_number, row_status
    ) values (
      '11111111-1111-1111-1111-111111111102',
      'dddddddd-dddd-dddd-dddd-ddddddddddd1',
      3,
      'VALID_NEW'
    );
    raise exception 'FAIL: import row attached across societies';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then
        raise;
      end if;
  end;
end $$;

-- Current uniqueness still blocks A/101 and B/101 until deferred swap.
do $$
begin
  begin
    insert into public.flats (society_id, flat_number, wing_building, status)
    values (
      '11111111-1111-1111-1111-111111111101',
      'IMP101',
      'B',
      'active'
    );
    raise exception 'FAIL: expected current unique(society_id, flat_number) to reject B/IMP101';
  exception
    when unique_violation then
      null;
  end;
end $$;

-- Generated keys: display preserved, compare keys match.
do $$
declare
  v_display text;
  v_key text;
begin
  select wing_building, wing_building_key
  into v_display, v_key
  from public.flats
  where society_id = '11111111-1111-1111-1111-111111111101'
    and flat_number = 'IMP101';

  if v_display <> 'A' then
    raise exception 'FAIL: wing_building display was rewritten';
  end if;

  if v_key <> 'a' then
    raise exception 'FAIL: wing_building_key should be a';
  end if;
end $$;

-- Authenticated Society A admin: own import rows visible; Society B hidden.
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
  select count(*) into v_count from public.resident_import_jobs;
  if v_count <> 1 then
    raise exception 'FAIL: Society A admin should see own import job';
  end if;

  select count(*) into v_count
  from public.resident_contact_numbers
  where resident_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  if v_count < 1 then
    raise exception 'FAIL: Society A admin cannot read own contact numbers';
  end if;

  select count(*) into v_count
  from public.resident_contact_numbers
  where society_id = '11111111-1111-1111-1111-111111111102';
  if v_count <> 0 then
    raise exception 'FAIL: Society A can read Society B contact numbers';
  end if;

  begin
    insert into public.resident_import_jobs (
      society_id, created_by_app_user_id, job_status
    ) values (
      '11111111-1111-1111-1111-111111111102',
      '22222222-2222-2222-2222-222222222201',
      'uploaded'
    );
    raise exception 'FAIL: authenticated admin was able to insert import job';
  exception
    when insufficient_privilege then
      null;
    when raise_exception then
      if sqlerrm like 'FAIL:%' then
        raise;
      end if;
  end;
end $$;

reset role;

-- Society A Guard: no extra phones, custom fields, or import jobs.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '22222222-2222-2222-2222-222222222202',
    'role', 'authenticated',
    'app_user_id', '22222222-2222-2222-2222-222222222202',
    'app_role', 'guard',
    'society_id', '11111111-1111-1111-1111-111111111101',
    'society_code', 'DEMO',
    'is_authorized_admin', false
  )::text,
  true
);

set local role authenticated;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.resident_import_jobs;
  if v_count <> 0 then
    raise exception 'FAIL: Society A Guard can read import jobs';
  end if;

  select count(*) into v_count from public.resident_import_job_rows;
  if v_count <> 0 then
    raise exception 'FAIL: Society A Guard can read import job rows';
  end if;

  select count(*) into v_count from public.resident_contact_numbers;
  if v_count <> 0 then
    raise exception 'FAIL: Society A Guard can read resident contact numbers';
  end if;

  select count(*) into v_count from public.society_resident_field_definitions;
  if v_count <> 0 then
    raise exception 'FAIL: Society A Guard can read custom field definitions';
  end if;

  select count(*) into v_count from public.resident_custom_field_values;
  if v_count <> 0 then
    raise exception 'FAIL: Society A Guard can read custom field values';
  end if;
end $$;

reset role;

-- Society B guard: cannot read import jobs; cannot write contacts.
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
  select count(*) into v_count from public.resident_import_jobs;
  if v_count <> 0 then
    raise exception 'FAIL: Guard can read import jobs';
  end if;

  select count(*) into v_count from public.resident_contact_numbers;
  if v_count <> 0 then
    raise exception 'FAIL: Guard can read resident contact numbers';
  end if;

  select count(*) into v_count from public.society_resident_field_definitions;
  if v_count <> 0 then
    raise exception 'FAIL: Guard can read custom field definitions';
  end if;

  select count(*) into v_count from public.resident_custom_field_values;
  if v_count <> 0 then
    raise exception 'FAIL: Guard can read custom field values';
  end if;

  begin
    insert into public.resident_contact_numbers (
      society_id, resident_id, mobile_digits, kind
    ) values (
      '11111111-1111-1111-1111-111111111102',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      '9000000002',
      'additional'
    );
    raise exception 'FAIL: Guard was able to write contact numbers';
  exception
    when insufficient_privilege then
      null;
    when raise_exception then
      if sqlerrm like 'FAIL:%' then
        raise;
      end if;
  end;
end $$;

rollback;

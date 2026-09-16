-- M03 Excel import Phase 3: transactional confirm RPC (PREPARE ONLY)
-- Additive only. Does not change flat uniqueness or Resident Management.
-- Does not depend on the draft import-foundation migration.
--
-- DO NOT APPLY to remote Supabase until this file is reviewed.
-- Phase 3A: new flat + resident + resident_flats share one write subtransaction.

-- ---------------------------------------------------------------------------
-- Comparison helpers (matching only — never rewrite stored display columns)
-- ---------------------------------------------------------------------------

create or replace function public.admin_confirm_resident_import_compare_key(value text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(trim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g')));
$$;

comment on function public.admin_confirm_resident_import_compare_key(text) is
  'Import matching key: trim, collapse whitespace, lower-case. Does not change stored text.';

create or replace function public.admin_confirm_resident_import_normalize_mobile(value text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when length(v.digits) = 12 and left(v.digits, 2) = '91' then substring(v.digits from 3)
    else left(v.digits, 10)
  end
  from (
    select regexp_replace(coalesce(value, ''), '\D', '', 'g') as digits
  ) as v;
$$;

comment on function public.admin_confirm_resident_import_normalize_mobile(text) is
  'Import mobile digits only. Strips a 91 country code from 12-digit values.';

create or replace function public.admin_confirm_resident_import_mobile_valid(value text)
returns boolean
language sql
immutable
parallel safe
as $$
  select public.admin_confirm_resident_import_normalize_mobile(value) ~ '^[6-9][0-9]{9}$';
$$;

revoke all on function public.admin_confirm_resident_import_compare_key(text) from public;
revoke all on function public.admin_confirm_resident_import_compare_key(text) from anon, authenticated;
revoke all on function public.admin_confirm_resident_import_normalize_mobile(text) from public;
revoke all on function public.admin_confirm_resident_import_normalize_mobile(text) from anon, authenticated;
revoke all on function public.admin_confirm_resident_import_mobile_valid(text) from public;
revoke all on function public.admin_confirm_resident_import_mobile_valid(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- One-row confirm write. Society id must come from the trusted Edge Function
-- after authenticateAdminRequest(). Not executable by anon or authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.admin_confirm_resident_import_row(
  p_society_id uuid,
  p_row_number integer,
  p_flat_number text,
  p_resident_name text,
  p_resident_type text default null,
  p_mobile text default null,
  p_wing_building text default null,
  p_additional_mobiles text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flat_number text;
  v_resident_name text;
  v_resident_type text;
  v_mobile text;
  v_wing_building text;
  v_lock_key text;
  v_proposed_building text;
  v_proposed_mobiles text[] := '{}'::text[];
  v_extra text;
  v_norm text;
  v_best_rank integer := 0;
  v_best_status text := 'READY_TO_IMPORT';
  v_best_message text := 'No matching resident was found in this society.';
  v_existing record;
  v_existing_flat text;
  v_existing_name text;
  v_existing_building text;
  v_existing_mobile text;
  v_same_flat boolean;
  v_same_name boolean;
  v_common boolean;
  v_named_buildings_differ boolean;
  v_blank_vs_named boolean;
  v_flat public.flats%rowtype;
  v_resident public.residents%rowtype;
begin
  if p_society_id is null then
    return jsonb_build_object(
      'row_number', p_row_number,
      'status', 'FAILED',
      'message', 'Society is required.',
      'resident_id', null,
      'resident_name', null,
      'flat_number', null,
      'wing_building', null,
      'mobile', null
    );
  end if;

  v_flat_number := trim(coalesce(p_flat_number, ''));
  v_resident_name := trim(coalesce(p_resident_name, ''));
  v_resident_type := nullif(trim(coalesce(p_resident_type, '')), '');
  v_wing_building := nullif(trim(regexp_replace(coalesce(p_wing_building, ''), '\s+', ' ', 'g')), '');
  if nullif(trim(coalesce(p_mobile, '')), '') is null then
    v_mobile := null;
  else
    v_mobile := public.admin_confirm_resident_import_normalize_mobile(p_mobile);
  end if;

  -- Exact import identity only. Not a global name or mobile lock.
  v_lock_key :=
    p_society_id::text
    || chr(31)
    || public.admin_confirm_resident_import_compare_key(v_flat_number)
    || chr(31)
    || public.admin_confirm_resident_import_compare_key(v_resident_name)
    || chr(31)
    || coalesce(v_mobile, '');

  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  if v_flat_number = '' then
    return jsonb_build_object(
      'row_number', p_row_number,
      'status', 'INVALID',
      'message', 'Flat Number is required.',
      'resident_id', null,
      'resident_name', null,
      'flat_number', null,
      'wing_building', null,
      'mobile', null
    );
  end if;

  if v_resident_name = '' then
    return jsonb_build_object(
      'row_number', p_row_number,
      'status', 'INVALID',
      'message', 'Resident Name is required.',
      'resident_id', null,
      'resident_name', null,
      'flat_number', null,
      'wing_building', null,
      'mobile', null
    );
  end if;

  if v_mobile is not null and not public.admin_confirm_resident_import_mobile_valid(v_mobile) then
    return jsonb_build_object(
      'row_number', p_row_number,
      'status', 'INVALID',
      'message', 'Primary Mobile must contain a valid 10-digit Indian mobile number.',
      'resident_id', null,
      'resident_name', null,
      'flat_number', null,
      'wing_building', null,
      'mobile', null
    );
  end if;

  if v_resident_type is not null then
    if public.admin_confirm_resident_import_compare_key(v_resident_type) = 'owner' then
      v_resident_type := 'Owner';
    elsif public.admin_confirm_resident_import_compare_key(v_resident_type) = 'tenant' then
      v_resident_type := 'Tenant';
    elsif public.admin_confirm_resident_import_compare_key(v_resident_type) = 'family member' then
      v_resident_type := 'Family Member';
    elsif public.admin_confirm_resident_import_compare_key(v_resident_type) = 'other' then
      v_resident_type := 'Other';
    else
      return jsonb_build_object(
        'row_number', p_row_number,
        'status', 'INVALID',
        'message', 'Resident Type must be Owner, Tenant, Family Member, or Other.',
        'resident_id', null,
        'resident_name', null,
        'flat_number', null,
        'wing_building', null,
        'mobile', null
      );
    end if;
  end if;

  v_proposed_building := public.admin_confirm_resident_import_compare_key(v_wing_building);

  if v_mobile is not null and public.admin_confirm_resident_import_mobile_valid(v_mobile) then
    v_proposed_mobiles := array_append(v_proposed_mobiles, v_mobile);
  end if;

  if p_additional_mobiles is not null then
    foreach v_extra in array p_additional_mobiles loop
      if public.admin_confirm_resident_import_mobile_valid(v_extra) then
        v_norm := public.admin_confirm_resident_import_normalize_mobile(v_extra);
        if not (v_norm = any (v_proposed_mobiles)) then
          v_proposed_mobiles := array_append(v_proposed_mobiles, v_norm);
        end if;
      end if;
    end loop;
  end if;

  for v_existing in
    select
      r.name as resident_name,
      r.mobile as primary_mobile,
      r.status as resident_status,
      f.flat_number as flat_number,
      f.wing_building as wing_building
    from public.resident_flats as rf
    inner join public.residents as r
      on r.id = rf.resident_id
      and r.society_id = p_society_id
    inner join public.flats as f
      on f.id = rf.flat_id
      and f.society_id = p_society_id
    where rf.society_id = p_society_id
  loop
    v_existing_flat := public.admin_confirm_resident_import_compare_key(v_existing.flat_number);
    v_existing_name := public.admin_confirm_resident_import_compare_key(v_existing.resident_name);
    v_existing_building := public.admin_confirm_resident_import_compare_key(v_existing.wing_building);
    v_existing_mobile := case
      when public.admin_confirm_resident_import_mobile_valid(v_existing.primary_mobile)
        then public.admin_confirm_resident_import_normalize_mobile(v_existing.primary_mobile)
      else null
    end;
    v_same_flat :=
      public.admin_confirm_resident_import_compare_key(v_flat_number) <> ''
      and public.admin_confirm_resident_import_compare_key(v_flat_number) = v_existing_flat;
    v_same_name :=
      public.admin_confirm_resident_import_compare_key(v_resident_name) <> ''
      and public.admin_confirm_resident_import_compare_key(v_resident_name) = v_existing_name;
    v_common :=
      v_existing_mobile is not null
      and v_existing_mobile = any (v_proposed_mobiles);
    v_named_buildings_differ :=
      v_proposed_building <> ''
      and v_existing_building <> ''
      and v_proposed_building <> v_existing_building;
    v_blank_vs_named :=
      v_same_flat
      and (
        (v_proposed_building = '' and v_existing_building <> '')
        or (v_proposed_building <> '' and v_existing_building = '')
      );

    if v_same_flat and v_named_buildings_differ and v_best_rank < 4 then
      v_best_rank := 4;
      v_best_status := 'BACKEND_BLOCKED';
      v_best_message :=
        'Flat '
        || coalesce(nullif(v_flat_number, ''), v_existing.flat_number)
        || ' already exists in this society with a different building ('
        || coalesce(nullif(trim(v_existing.wing_building), ''), v_existing_building)
        || '). The current system cannot store the same flat number in more than one building.';
    elsif v_same_flat and v_same_name and v_common and v_best_rank < 3 then
      v_best_rank := 3;
      v_best_status := 'ALREADY_EXISTS';
      v_best_message :=
        'Matches existing resident '
        || v_existing.resident_name
        || ' in flat '
        || v_existing.flat_number
        || ' on mobile '
        || v_existing_mobile
        || '.'
        || case
          when v_existing.resident_status = 'disabled'
            then ' This resident is archived. Import will not update or reactivate them.'
          else ''
        end;
    else
      if v_same_flat and v_blank_vs_named and v_best_rank < 2 then
        v_best_rank := 2;
        v_best_status := 'POSSIBLE_DATABASE_CONFLICT';
        v_best_message :=
          'Flat '
          || v_existing.flat_number
          || ' already exists with '
          || case
            when v_existing_building <> '' then 'building ' || v_existing.wing_building
            else 'a blank building'
          end
          || '. A blank vs named building cannot be verified safely against the current unique flat number.';
      end if;

      if v_same_flat and v_same_name and not v_common and v_best_rank < 2 then
        v_best_rank := 2;
        v_best_status := 'POSSIBLE_DATABASE_CONFLICT';
        v_best_message :=
          'Same flat and resident name as existing resident '
          || v_existing.resident_name
          || ', but the mobile numbers do not match.';
      end if;

      if v_same_flat and not v_same_name and v_common and v_best_rank < 2 then
        v_best_rank := 2;
        v_best_status := 'POSSIBLE_DATABASE_CONFLICT';
        v_best_message :=
          'Same flat as existing resident '
          || v_existing.resident_name
          || ', with a different name and a shared mobile number.';
      end if;

      if not v_same_flat and v_common and v_existing_flat <> '' and v_best_rank < 2 then
        v_best_rank := 2;
        v_best_status := 'POSSIBLE_DATABASE_CONFLICT';
        v_best_message :=
          'Mobile '
          || v_existing_mobile
          || ' is already used by '
          || v_existing.resident_name
          || ' in flat '
          || v_existing.flat_number
          || '.';
      end if;

      if v_same_name and not v_same_flat and v_existing_flat <> '' and v_best_rank < 2 then
        v_best_rank := 2;
        v_best_status := 'POSSIBLE_DATABASE_CONFLICT';
        v_best_message :=
          'Resident name '
          || v_existing.resident_name
          || ' already exists in a different flat ('
          || v_existing.flat_number
          || ').';
      end if;
    end if;
  end loop;

  if v_best_status <> 'READY_TO_IMPORT' then
    return jsonb_build_object(
      'row_number', p_row_number,
      'status', v_best_status,
      'message', v_best_message,
      'resident_id', null,
      'resident_name', v_resident_name,
      'flat_number', v_flat_number,
      'wing_building', v_wing_building,
      'mobile', v_mobile
    );
  end if;

  select *
  into v_flat
  from public.flats
  where society_id = p_society_id
    and lower(trim(flat_number)) = lower(v_flat_number)
  order by created_at asc
  limit 1;

  if found then
    if public.admin_confirm_resident_import_compare_key(v_flat.wing_building)
      <> public.admin_confirm_resident_import_compare_key(v_wing_building)
    then
      return jsonb_build_object(
        'row_number', p_row_number,
        'status', 'BACKEND_BLOCKED',
        'message',
          'Flat '
          || v_flat.flat_number
          || ' already exists in this society with a different building ('
          || coalesce(nullif(trim(coalesce(v_flat.wing_building, '')), ''), 'blank')
          || '). The current system cannot store the same flat number in more than one building, and an existing flat building is never changed.',
        'resident_id', null,
        'resident_name', v_resident_name,
        'flat_number', v_flat.flat_number,
        'wing_building', v_flat.wing_building,
        'mobile', v_mobile
      );
    end if;
  end if;

  -- Single write subtransaction: new flat (if any) + resident + link.
  -- If any write fails, every write created in this block rolls back.
  -- An already-existing compatible flat is only read, never written.
  begin
    if v_flat.id is null then
      begin
        insert into public.flats (
          society_id,
          flat_number,
          wing_building,
          status
        )
        values (
          p_society_id,
          v_flat_number,
          v_wing_building,
          'active'
        )
        returning * into v_flat;
      exception
        when unique_violation then
          select *
          into v_flat
          from public.flats
          where society_id = p_society_id
            and lower(trim(flat_number)) = lower(v_flat_number)
          order by created_at asc
          limit 1;

          if not found then
            return jsonb_build_object(
              'row_number', p_row_number,
              'status', 'FAILED',
              'message', 'Unable to resolve the flat after a concurrent create.',
              'resident_id', null,
              'resident_name', v_resident_name,
              'flat_number', v_flat_number,
              'wing_building', v_wing_building,
              'mobile', v_mobile
            );
          end if;

          if public.admin_confirm_resident_import_compare_key(v_flat.wing_building)
            <> public.admin_confirm_resident_import_compare_key(v_wing_building)
          then
            return jsonb_build_object(
              'row_number', p_row_number,
              'status', 'BACKEND_BLOCKED',
              'message',
                'Flat '
                || v_flat.flat_number
                || ' already exists in this society with a different building ('
                || coalesce(nullif(trim(coalesce(v_flat.wing_building, '')), ''), 'blank')
                || '). The current system cannot store the same flat number in more than one building, and an existing flat building is never changed.',
              'resident_id', null,
              'resident_name', v_resident_name,
              'flat_number', v_flat.flat_number,
              'wing_building', v_flat.wing_building,
              'mobile', v_mobile
            );
          end if;
      end;
    end if;

    insert into public.residents (
      society_id,
      name,
      mobile,
      resident_type,
      status
    )
    values (
      p_society_id,
      v_resident_name,
      v_mobile,
      v_resident_type,
      'active'
    )
    returning * into v_resident;

    insert into public.resident_flats (
      society_id,
      resident_id,
      flat_id
    )
    values (
      p_society_id,
      v_resident.id,
      v_flat.id
    );
  exception
    when others then
      -- Rolls back new flat (if created here), resident, and resident_flats.
      -- No orphan resident, no leftover empty flat, no partial link.
      return jsonb_build_object(
        'row_number', p_row_number,
        'status', 'FAILED',
        'message', 'Unable to create the resident for this row.',
        'resident_id', null,
        'resident_name', v_resident_name,
        'flat_number', v_flat_number,
        'wing_building', v_wing_building,
        'mobile', v_mobile
      );
  end;

  return jsonb_build_object(
    'row_number', p_row_number,
    'status', 'IMPORTED',
    'message', 'Resident created in this society.',
    'resident_id', v_resident.id,
    'resident_name', v_resident.name,
    'flat_number', v_flat.flat_number,
    'wing_building', v_flat.wing_building,
    'mobile', v_resident.mobile
  );
end;
$$;

comment on function public.admin_confirm_resident_import_row(uuid, integer, text, text, text, text, text, text[]) is
  'Trusted confirm write for one Excel resident row. Society id must come from the admin-resident-import-confirm Edge Function JWT, not the mobile client. Uses a transaction-scoped advisory lock on society+flat+name+mobile only.';

revoke all on function public.admin_confirm_resident_import_row(uuid, integer, text, text, text, text, text, text[]) from public;
revoke all on function public.admin_confirm_resident_import_row(uuid, integer, text, text, text, text, text, text[]) from anon, authenticated;
grant execute on function public.admin_confirm_resident_import_row(uuid, integer, text, text, text, text, text, text[]) to service_role;

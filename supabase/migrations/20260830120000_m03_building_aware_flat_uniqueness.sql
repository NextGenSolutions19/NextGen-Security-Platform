-- M03-T03 building-aware flat uniqueness (PREPARE ONLY — DO NOT APPLY YET)
--
-- Physical flat identity becomes:
--   UNIQUE (society_id, wing_building_key, flat_number_key)
--
-- This file does NOT:
--   rewrite flat_number or wing_building;
--   parse A-202 / M02-T101;
--   merge or delete flats;
--   change resident history;
--   alter society_id tenancy or RLS.
--
-- Apply in the same release as
--   20260830130000_m03_admin_confirm_resident_import_row_building_aware.sql
-- Do not run supabase db push until that pair is reviewed together.
--
-- Safer apply order inside one transaction:
--   1) ensure normalize_resident_compare_key + generated keys
--   2) fail-fast if target-key collisions exist
--   3) ADD the new unique first (old unique still protects the table)
--   4) DROP the old UNIQUE (society_id, flat_number)
--   5) drop the redundant non-unique identity lookup index
--
-- Rollback (same transaction if this file has not committed):
--   PostgreSQL rolls back the whole file on any error, so a failure before
--   COMMIT restores flats_society_flat_number_unique.
-- After COMMIT, restore the old unique only if no A/201 + B/201 rows exist;
-- see the preflight report rollback section.

-- ---------------------------------------------------------------------------
-- Comparison key helper — keep identical to hosted + application semantics
-- trim, collapse whitespace, lower-case. Null/blank -> ''.
-- ---------------------------------------------------------------------------

create or replace function public.normalize_resident_compare_key(value text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(trim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g')));
$$;

comment on function public.normalize_resident_compare_key(text) is
  'Matching-only key for building/flat labels. Does not change stored display text.';

grant execute on function public.normalize_resident_compare_key(text) to authenticated;
grant execute on function public.normalize_resident_compare_key(text) to service_role;
revoke all on function public.normalize_resident_compare_key(text) from public;

-- Generated keys already exist on hosted after 20260828100000. Recreate only
-- if a fresh database is missing them. Do not rewrite display columns.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'flats'
      and column_name = 'wing_building_key'
  ) then
    alter table public.flats
      add column wing_building_key text
      generated always as (public.normalize_resident_compare_key(wing_building)) stored;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'flats'
      and column_name = 'flat_number_key'
  ) then
    alter table public.flats
      add column flat_number_key text
      generated always as (public.normalize_resident_compare_key(flat_number)) stored;
  end if;
end;
$$;

comment on column public.flats.wing_building_key is
  'Normalized building/wing for matching. Empty string means no building. Display remains wing_building.';

comment on column public.flats.flat_number_key is
  'Normalized flat number for matching. Display remains flat_number.';

-- ---------------------------------------------------------------------------
-- Fail-fast: refuse to swap uniqueness if the target key is already ambiguous
-- ---------------------------------------------------------------------------

do $$
declare
  v_null_keys integer;
  v_collision_groups integer;
  v_sample text;
begin
  select count(*)
  into v_null_keys
  from public.flats
  where wing_building_key is null
     or flat_number_key is null;

  if v_null_keys > 0 then
    raise exception
      'PRECONDITION FAILED: % public.flats row(s) have a null wing_building_key or flat_number_key. The old unique constraint was not dropped.',
      v_null_keys;
  end if;

  select count(*)
  into v_collision_groups
  from (
    select 1
    from public.flats
    group by society_id, wing_building_key, flat_number_key
    having count(*) > 1
  ) as collisions;

  if v_collision_groups > 0 then
    select string_agg(
      format(
        'society=%s building_key=%L flat_key=%L count=%s',
        society_id,
        wing_building_key,
        flat_number_key,
        n
      ),
      '; '
    )
    into v_sample
    from (
      select
        society_id,
        wing_building_key,
        flat_number_key,
        count(*) as n
      from public.flats
      group by society_id, wing_building_key, flat_number_key
      having count(*) > 1
      limit 10
    ) as sample_rows;

    raise exception
      'PRECONDITION FAILED: % target-key collision group(s) on public.flats (society_id, wing_building_key, flat_number_key). Sample: %. The old unique constraint was not dropped.',
      v_collision_groups,
      coalesce(v_sample, '');
  end if;
end;
$$;

-- Generated keys are never null after the check above. Unique treats NULLs as
-- distinct, so mark them NOT NULL to match approved empty-string semantics.

alter table public.flats
  alter column wing_building_key set not null;

alter table public.flats
  alter column flat_number_key set not null;

-- Add the new unique while the old unique still exists. If this fails, the
-- transaction aborts and flats_society_flat_number_unique remains.

alter table public.flats
  add constraint flats_society_building_flat_key_unique
  unique (society_id, wing_building_key, flat_number_key);

comment on constraint flats_society_building_flat_key_unique on public.flats is
  'Physical flat identity: society + normalized building + normalized flat number. Blank building is the empty comparison key.';

alter table public.flats
  drop constraint flats_society_flat_number_unique;

-- The earlier non-unique lookup index is redundant once the unique exists.

drop index if exists public.flats_society_identity_key_idx;

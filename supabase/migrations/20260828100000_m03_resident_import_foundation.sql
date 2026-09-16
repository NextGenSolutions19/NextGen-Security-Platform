-- M03-T03 Phase 1C-A: Resident import foundation (LOCAL DRAFT)
-- Additive only. Does NOT replace flats uniqueness.
-- Does NOT move residents.resident_type.
-- Do not apply remotely until reviewed.

-- ---------------------------------------------------------------------------
-- Comparison key helper (matching only — never rewrite display columns)
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

-- Generated keys on flats for later identity lookups. Existing unique
-- (society_id, flat_number) is intentionally unchanged in this file.

alter table public.flats
  add column if not exists wing_building_key text
    generated always as (public.normalize_resident_compare_key(wing_building)) stored;

alter table public.flats
  add column if not exists flat_number_key text
    generated always as (public.normalize_resident_compare_key(flat_number)) stored;

comment on column public.flats.wing_building_key is
  'Normalized building/wing for matching. Empty string means no building. Display remains wing_building.';

comment on column public.flats.flat_number_key is
  'Normalized flat number for matching. Display remains flat_number.';

create index if not exists flats_society_identity_key_idx
  on public.flats (society_id, wing_building_key, flat_number_key);

-- ---------------------------------------------------------------------------
-- DEFERRED: building-aware UNIQUE replacement
-- Current live constraint: flats_society_flat_number_unique
--   UNIQUE (society_id, flat_number)
--
-- admin-resident findSocietyFlat still matches by flat_number only (case
-- insensitive) and ignores wing_building. Enabling the unique swap below
-- WITHOUT updating that lookup would let Building B + 101 attach to
-- Building A + 101. Do not uncomment until admin-resident (and any other
-- flat-number-only lookup) matches on (society, wing_building_key, flat_number_key)
-- in the same release.
--
-- alter table public.flats
--   drop constraint flats_society_flat_number_unique;
--
-- create unique index flats_society_building_flat_key_unique
--   on public.flats (society_id, wing_building_key, flat_number_key);
-- ---------------------------------------------------------------------------

-- occupancy_role on resident_flats is deferred. residents.resident_type stays
-- the working Admin/Guard field.

-- ---------------------------------------------------------------------------
-- Contact numbers (one resident, primary + additional). Not society-unique.
-- ---------------------------------------------------------------------------

create table public.resident_contact_numbers (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  resident_id uuid not null references public.residents (id) on delete cascade,
  mobile_digits text not null,
  kind text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint resident_contact_numbers_kind_allowed check (
    kind in ('primary', 'additional')
  ),
  constraint resident_contact_numbers_mobile_format check (
    mobile_digits ~ '^[6-9][0-9]{9}$'
  ),
  constraint resident_contact_numbers_resident_mobile_unique unique (
    resident_id,
    mobile_digits
  )
);

comment on table public.resident_contact_numbers is
  'Normalized resident phones. Same digits may be shared by different residents. residents.mobile remains.';

comment on column public.resident_contact_numbers.mobile_digits is
  '10-digit Indian mobile after digit normalization. Matching signal only.';

create index resident_contact_numbers_society_id_idx
  on public.resident_contact_numbers (society_id);

create index resident_contact_numbers_resident_id_idx
  on public.resident_contact_numbers (resident_id);

create index resident_contact_numbers_society_digits_idx
  on public.resident_contact_numbers (society_id, mobile_digits);

create unique index resident_contact_numbers_one_primary_idx
  on public.resident_contact_numbers (resident_id)
  where kind = 'primary';

create trigger resident_contact_numbers_set_updated_at
before update on public.resident_contact_numbers
for each row execute function public.set_updated_at();

create or replace function public.enforce_resident_contact_numbers_same_society()
returns trigger
language plpgsql
as $$
declare
  v_resident_society_id uuid;
begin
  select society_id into v_resident_society_id
  from public.residents
  where id = new.resident_id;

  if v_resident_society_id is null then
    raise exception 'resident_contact_numbers.resident_id must reference an existing resident';
  end if;

  if new.society_id <> v_resident_society_id then
    raise exception 'resident_contact_numbers.society_id must match the resident society';
  end if;

  return new;
end;
$$;

create trigger resident_contact_numbers_enforce_same_society
before insert or update on public.resident_contact_numbers
for each row execute function public.enforce_resident_contact_numbers_same_society();

-- Idempotent backfill: copy valid residents.mobile as primary. Keep residents.mobile.
insert into public.resident_contact_numbers (
  society_id,
  resident_id,
  mobile_digits,
  kind
)
select
  r.society_id,
  r.id,
  r.mobile,
  'primary'
from public.residents r
where r.mobile is not null
  and r.mobile ~ '^[6-9][0-9]{9}$'
on conflict (resident_id, mobile_digits) do nothing;

-- ---------------------------------------------------------------------------
-- Society-scoped custom field catalog + values
-- ---------------------------------------------------------------------------

create table public.society_resident_field_definitions (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  field_key text not null,
  display_label text not null,
  field_type text not null,
  is_required boolean not null default false,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint society_resident_field_definitions_key_format check (
    field_key ~ '^[a-z][a-z0-9_]{0,62}$'
  ),
  constraint society_resident_field_definitions_label_format check (
    char_length(trim(display_label)) > 0
  ),
  constraint society_resident_field_definitions_type_allowed check (
    field_type in (
      'text',
      'number',
      'phone',
      'date',
      'dropdown',
      'yes_no',
      'multi_select'
    )
  ),
  constraint society_resident_field_definitions_options_array check (
    jsonb_typeof(options) = 'array'
  ),
  constraint society_resident_field_definitions_society_key_unique unique (
    society_id,
    field_key
  )
);

comment on table public.society_resident_field_definitions is
  'Per-society expandable resident field catalog. Disabling must not delete values.';

comment on column public.society_resident_field_definitions.options is
  'JSONB array of dropdown/multi-select option objects. Empty array when unused.';

comment on column public.society_resident_field_definitions.is_enabled is
  'false hides the field from new entry. Historical resident_custom_field_values are kept.';

create index society_resident_field_definitions_society_id_idx
  on public.society_resident_field_definitions (society_id);

create trigger society_resident_field_definitions_set_updated_at
before update on public.society_resident_field_definitions
for each row execute function public.set_updated_at();

create table public.resident_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  resident_id uuid not null references public.residents (id) on delete cascade,
  field_definition_id uuid not null
    references public.society_resident_field_definitions (id) on delete restrict,
  value_text text,
  value_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint resident_custom_field_values_has_payload check (
    value_text is not null or value_json is not null
  ),
  constraint resident_custom_field_values_resident_field_unique unique (
    resident_id,
    field_definition_id
  )
);

comment on table public.resident_custom_field_values is
  'Normalized custom field values. ON DELETE RESTRICT on definitions preserves history.';

create index resident_custom_field_values_society_id_idx
  on public.resident_custom_field_values (society_id);

create index resident_custom_field_values_resident_id_idx
  on public.resident_custom_field_values (resident_id);

create trigger resident_custom_field_values_set_updated_at
before update on public.resident_custom_field_values
for each row execute function public.set_updated_at();

create or replace function public.enforce_resident_custom_field_values_same_society()
returns trigger
language plpgsql
as $$
declare
  v_resident_society_id uuid;
  v_definition_society_id uuid;
begin
  select society_id into v_resident_society_id
  from public.residents
  where id = new.resident_id;

  select society_id into v_definition_society_id
  from public.society_resident_field_definitions
  where id = new.field_definition_id;

  if v_resident_society_id is null then
    raise exception 'resident_custom_field_values.resident_id must reference an existing resident';
  end if;

  if v_definition_society_id is null then
    raise exception 'resident_custom_field_values.field_definition_id must reference an existing definition';
  end if;

  if new.society_id <> v_resident_society_id then
    raise exception 'resident_custom_field_values.society_id must match the resident society';
  end if;

  if new.society_id <> v_definition_society_id then
    raise exception 'resident_custom_field_values cannot use a field definition from another society';
  end if;

  return new;
end;
$$;

create trigger resident_custom_field_values_enforce_same_society
before insert or update on public.resident_custom_field_values
for each row execute function public.enforce_resident_custom_field_values_same_society();

-- ---------------------------------------------------------------------------
-- Import jobs + rows (preview/confirm persistence). No silent UPDATED/MERGED.
-- ---------------------------------------------------------------------------

create table public.resident_import_jobs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  created_by_app_user_id uuid not null references public.app_users (id) on delete restrict,
  original_filename text,
  job_status text not null default 'uploaded',
  detected_headers jsonb not null default '[]'::jsonb,
  column_mapping jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  failed_count integer not null default 0,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint resident_import_jobs_status_allowed check (
    job_status in (
      'uploaded',
      'headers_detected',
      'mapped',
      'validated',
      'previewed',
      'confirmed',
      'completed',
      'cancelled'
    )
  ),
  constraint resident_import_jobs_headers_array check (
    jsonb_typeof(detected_headers) = 'array'
  ),
  constraint resident_import_jobs_mapping_object check (
    jsonb_typeof(column_mapping) = 'object'
  ),
  constraint resident_import_jobs_counts_nonnegative check (
    row_count >= 0
    and imported_count >= 0
    and failed_count >= 0
  )
);

comment on table public.resident_import_jobs is
  'Admin Excel import session. Society from JWT/backend only.';

comment on column public.resident_import_jobs.column_mapping is
  'Snapshot of header-to-field mapping. Not used as a write authority.';

create index resident_import_jobs_society_id_idx
  on public.resident_import_jobs (society_id);

create index resident_import_jobs_society_created_idx
  on public.resident_import_jobs (society_id, created_at desc);

create trigger resident_import_jobs_set_updated_at
before update on public.resident_import_jobs
for each row execute function public.set_updated_at();

create or replace function public.enforce_resident_import_jobs_same_society()
returns trigger
language plpgsql
as $$
declare
  v_actor_society_id uuid;
  v_actor_role public.user_role;
begin
  select society_id, role
  into v_actor_society_id, v_actor_role
  from public.app_users
  where id = new.created_by_app_user_id;

  if v_actor_society_id is null then
    raise exception 'resident_import_jobs.created_by_app_user_id must reference an existing user';
  end if;

  if v_actor_role is distinct from 'society_admin' then
    raise exception 'resident_import_jobs.created_by_app_user_id must be a society_admin';
  end if;

  if new.society_id <> v_actor_society_id then
    raise exception 'resident_import_jobs.society_id must match the creating user society';
  end if;

  return new;
end;
$$;

create trigger resident_import_jobs_enforce_same_society
before insert or update on public.resident_import_jobs
for each row execute function public.enforce_resident_import_jobs_same_society();

create table public.resident_import_job_rows (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  job_id uuid not null references public.resident_import_jobs (id) on delete cascade,
  row_number integer not null,
  source_data jsonb not null default '{}'::jsonb,
  mapped_data jsonb not null default '{}'::jsonb,
  row_status text not null,
  validation_errors jsonb not null default '[]'::jsonb,
  conflict_info jsonb not null default '{}'::jsonb,
  imported_resident_id uuid references public.residents (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint resident_import_job_rows_row_number_positive check (row_number > 0),
  constraint resident_import_job_rows_status_allowed check (
    row_status in (
      'INVALID',
      'VALID_NEW',
      'EXACT_DUPLICATE',
      'INTRA_FILE_DUPLICATE',
      'POSSIBLE_CONFLICT',
      'SKIPPED',
      'IMPORTED',
      'FAILED'
    )
  ),
  constraint resident_import_job_rows_errors_array check (
    jsonb_typeof(validation_errors) = 'array'
  ),
  constraint resident_import_job_rows_conflict_object check (
    jsonb_typeof(conflict_info) = 'object'
  ),
  constraint resident_import_job_rows_job_row_unique unique (job_id, row_number)
);

comment on table public.resident_import_job_rows is
  'Per-row import preview/result. No UPDATED/MERGED/OVERWRITTEN statuses.';

create index resident_import_job_rows_society_id_idx
  on public.resident_import_job_rows (society_id);

create index resident_import_job_rows_job_id_idx
  on public.resident_import_job_rows (job_id);

create trigger resident_import_job_rows_set_updated_at
before update on public.resident_import_job_rows
for each row execute function public.set_updated_at();

create or replace function public.enforce_resident_import_job_rows_same_society()
returns trigger
language plpgsql
as $$
declare
  v_job_society_id uuid;
  v_resident_society_id uuid;
begin
  select society_id into v_job_society_id
  from public.resident_import_jobs
  where id = new.job_id;

  if v_job_society_id is null then
    raise exception 'resident_import_job_rows.job_id must reference an existing import job';
  end if;

  if new.society_id <> v_job_society_id then
    raise exception 'resident_import_job_rows.society_id must match the parent job society';
  end if;

  if new.imported_resident_id is not null then
    select society_id into v_resident_society_id
    from public.residents
    where id = new.imported_resident_id;

    if v_resident_society_id is null then
      raise exception 'resident_import_job_rows.imported_resident_id must reference an existing resident';
    end if;

    if v_resident_society_id <> new.society_id then
      raise exception 'resident_import_job_rows cannot attach a resident from another society';
    end if;
  end if;

  return new;
end;
$$;

create trigger resident_import_job_rows_enforce_same_society
before insert or update on public.resident_import_job_rows
for each row execute function public.enforce_resident_import_job_rows_same_society();

-- ---------------------------------------------------------------------------
-- RLS: SELECT only for authenticated. No client INSERT/UPDATE/DELETE.
-- Writes are intended for service_role Edge Functions (same as admin-resident).
-- ---------------------------------------------------------------------------

alter table public.resident_contact_numbers enable row level security;
alter table public.society_resident_field_definitions enable row level security;
alter table public.resident_custom_field_values enable row level security;
alter table public.resident_import_jobs enable row level security;
alter table public.resident_import_job_rows enable row level security;

-- Contacts, custom fields, and import jobs: Admin-only SELECT.
-- Guards keep using residents.mobile / existing directory. Extra phones and
-- custom fields are not added to the Guard read surface in this phase.

create policy resident_contact_numbers_select_society_admin
on public.resident_contact_numbers
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

create policy society_resident_field_definitions_select_society_admin
on public.society_resident_field_definitions
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

create policy resident_custom_field_values_select_society_admin
on public.resident_custom_field_values
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

-- Import jobs contain uploaded PII/mapping: Admin-only SELECT.

create policy resident_import_jobs_select_society_admin
on public.resident_import_jobs
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

create policy resident_import_job_rows_select_society_admin
on public.resident_import_job_rows
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

grant select on public.resident_contact_numbers to authenticated;
grant select on public.society_resident_field_definitions to authenticated;
grant select on public.resident_custom_field_values to authenticated;
grant select on public.resident_import_jobs to authenticated;
grant select on public.resident_import_job_rows to authenticated;

grant select, insert, update, delete on public.resident_contact_numbers to service_role;
grant select, insert, update, delete on public.society_resident_field_definitions to service_role;
grant select, insert, update, delete on public.resident_custom_field_values to service_role;
grant select, insert, update, delete on public.resident_import_jobs to service_role;
grant select, insert, update, delete on public.resident_import_job_rows to service_role;

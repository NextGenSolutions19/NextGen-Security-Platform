-- M04-T01: Recurring visitor pass foundation.
-- Additive only. Does not rewrite existing visitor_entries, visitor_photos,
-- flat, resident, auth, emergency, or policy data.
-- Does not change existing M01/M02/M03 RLS policies, grants, or auth resolution.
-- Historical visitor_entries rows stay valid with recurring_pass_id/entry_method NULL.
--
-- Design notes carried over from the approved M04-T01 architecture review:
--   * Persisted pass status is active | suspended | revoked only.
--     "Expired" is DERIVED from valid_until against the current Asia/Kolkata date
--     and is never stored, so no scheduled job can drift from reality.
--   * Revocation is terminal at database level (constraint + trigger), not only
--     in application code.
--   * Suspending and revoking both require a nonblank reason at database level,
--     and revoked rows are immutable so the reason can never be rewritten.
--   * QR credentials live in their own table so suspension never rotates the QR
--     and revocation of a specific QR is permanent even if a new pass is issued.
--     No new credential may be issued against an already-revoked pass.
--   * Only the SHA-256 hash of the opaque QR token is ever stored.
--   * Destination mirrors the M03 visitor_entries XOR model exactly.
--   * Pass photo object keys are bound by CHECK to their own society prefix, so
--     the existing storage read policy can never resolve them for another tenant.
--   * The append-only event table holds no foreign key to visitor_entries or
--     app_users, so an immutable log row can never block a legitimate delete on
--     those tables. See the column comments for the full reasoning.

-- ---------------------------------------------------------------------------
-- Recurring visitor passes (Admin-managed recurring personnel entitlement)
-- ---------------------------------------------------------------------------

create table public.recurring_visitor_passes (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  visitor_name text not null,
  visitor_mobile text not null,
  visitor_type_code text not null,
  visitor_type_label text not null,
  flat_id uuid references public.flats (id) on delete restrict,
  resident_id uuid references public.residents (id) on delete set null,
  destination_text text,
  vehicle_number text,
  valid_from date not null,
  valid_until date not null,
  allowed_days_of_week smallint[] not null,
  allowed_entry_from_time time,
  allowed_entry_to_time time,
  status text not null default 'active',
  notes text,
  suspended_at timestamptz,
  suspended_by_app_user_id uuid references public.app_users (id) on delete restrict,
  suspension_reason text,
  revoked_at timestamptz,
  revoked_by_app_user_id uuid references public.app_users (id) on delete restrict,
  revocation_reason text,
  created_by_app_user_id uuid not null references public.app_users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- Identity ---------------------------------------------------------------
  constraint recurring_visitor_passes_visitor_name_format check (
    char_length(trim(visitor_name)) > 0
    and char_length(trim(visitor_name)) <= 80
  ),
  constraint recurring_visitor_passes_visitor_mobile_format check (
    char_length(trim(visitor_mobile)) = 10
    and trim(visitor_mobile) ~ '^[6-9][0-9]{9}$'
  ),
  constraint recurring_visitor_passes_visitor_type_code_allowed check (
    visitor_type_code in (
      'DOMESTIC_HELP',
      'DRIVER',
      'MILKMAN',
      'NEWSPAPER_VENDOR',
      'COOK',
      'CLEANER',
      'TUTOR',
      'CAREGIVER',
      'OTHER'
    )
  ),
  constraint recurring_visitor_passes_visitor_type_label_format check (
    char_length(trim(visitor_type_label)) > 0
    and char_length(trim(visitor_type_label)) <= 80
  ),
  constraint recurring_visitor_passes_vehicle_number_format check (
    vehicle_number is null
    or (
      char_length(trim(vehicle_number)) > 0
      and char_length(trim(vehicle_number)) <= 20
    )
  ),
  constraint recurring_visitor_passes_notes_format check (
    notes is null
    or (
      char_length(trim(notes)) > 0
      and char_length(trim(notes)) <= 500
    )
  ),

  -- Destination: mirrors M03 visitor_entries destination model -------------
  constraint recurring_visitor_passes_destination_text_format check (
    destination_text is null
    or (
      char_length(trim(destination_text)) > 0
      and char_length(trim(destination_text)) <= 80
    )
  ),
  constraint recurring_visitor_passes_destination_present check (
    (
      flat_id is not null
      and destination_text is null
    )
    or (
      flat_id is null
      and destination_text is not null
    )
  ),
  constraint recurring_visitor_passes_other_has_no_resident check (
    flat_id is not null
    or resident_id is null
  ),

  -- Validity ---------------------------------------------------------------
  constraint recurring_visitor_passes_validity_order check (
    valid_until >= valid_from
  ),

  -- Schedule ---------------------------------------------------------------
  -- 0 = Sunday .. 6 = Saturday, evaluated in Asia/Kolkata.
  -- Null and duplicate entries are rejected by the companion trigger, because
  -- array containment operators return NULL (and therefore pass a CHECK) when
  -- the array holds a NULL element.
  constraint recurring_visitor_passes_allowed_days_shape check (
    array_ndims(allowed_days_of_week) = 1
    and array_length(allowed_days_of_week, 1) between 1 and 7
    and 0 <= all (allowed_days_of_week)
    and 6 >= all (allowed_days_of_week)
  ),
  -- Both-or-neither. Overnight windows are intentionally NOT supported yet.
  constraint recurring_visitor_passes_time_window_pairing check (
    (
      allowed_entry_from_time is null
      and allowed_entry_to_time is null
    )
    or (
      allowed_entry_from_time is not null
      and allowed_entry_to_time is not null
    )
  ),
  constraint recurring_visitor_passes_time_window_order check (
    allowed_entry_from_time is null
    or allowed_entry_to_time > allowed_entry_from_time
  ),

  -- Lifecycle --------------------------------------------------------------
  constraint recurring_visitor_passes_status_allowed check (
    status in ('active', 'suspended', 'revoked')
  ),
  constraint recurring_visitor_passes_suspension_reason_format check (
    suspension_reason is null
    or (
      char_length(trim(suspension_reason)) > 0
      and char_length(trim(suspension_reason)) <= 200
    )
  ),
  constraint recurring_visitor_passes_revocation_reason_format check (
    revocation_reason is null
    or (
      char_length(trim(revocation_reason)) > 0
      and char_length(trim(revocation_reason)) <= 200
    )
  ),
  -- Suspending requires a reason. The nonblank test is repeated here rather
  -- than left to the format constraint above so the mandatory-reason rule
  -- survives any future relaxation of that constraint.
  constraint recurring_visitor_passes_suspension_consistency check (
    (
      status = 'suspended'
      and suspended_at is not null
      and suspended_by_app_user_id is not null
      and suspension_reason is not null
      and char_length(trim(suspension_reason)) > 0
    )
    or (
      status <> 'suspended'
      and suspended_at is null
      and suspended_by_app_user_id is null
      and suspension_reason is null
    )
  ),
  -- Revoking requires a reason. Revoked rows are immutable (see
  -- enforce_recurring_visitor_pass_transition), so the reason recorded here
  -- can never later be blanked or rewritten.
  constraint recurring_visitor_passes_revocation_consistency check (
    (
      status = 'revoked'
      and revoked_at is not null
      and revoked_by_app_user_id is not null
      and revocation_reason is not null
      and char_length(trim(revocation_reason)) > 0
    )
    or (
      status <> 'revoked'
      and revoked_at is null
      and revoked_by_app_user_id is null
      and revocation_reason is null
    )
  )
);

comment on table public.recurring_visitor_passes is
  'Admin-managed recurring visitor passes for recurring personnel. Persisted status is active|suspended|revoked; expiry is derived from valid_until in Asia/Kolkata and never stored.';

comment on column public.recurring_visitor_passes.visitor_name is
  'Mandatory recurring visitor full name. Preserved on the pass so Guard verification does not depend on any visit row.';

comment on column public.recurring_visitor_passes.visitor_type_code is
  'Stable recurring personnel category code. Separate from visitor_entries.purpose_code so the Guard purpose picker is not overloaded.';

comment on column public.recurring_visitor_passes.visitor_type_label is
  'Display label captured at creation time so historical labels survive future display-name changes.';

comment on column public.recurring_visitor_passes.destination_text is
  'Unlisted destination when no Resident Master flat is assigned. Null when flat_id is set. Mirrors visitor_entries.destination_text.';

comment on column public.recurring_visitor_passes.valid_from is
  'Inclusive first valid date, interpreted in Asia/Kolkata.';

comment on column public.recurring_visitor_passes.valid_until is
  'Inclusive last valid date, interpreted in Asia/Kolkata. A pass is derived-expired once the current IST date is past this value.';

comment on column public.recurring_visitor_passes.allowed_days_of_week is
  'Allowed entry weekdays as 0=Sunday .. 6=Saturday evaluated in Asia/Kolkata. Non-empty, no nulls, no duplicates.';

comment on column public.recurring_visitor_passes.allowed_entry_from_time is
  'Optional allowed entry window start (local Asia/Kolkata wall clock). Both window columns are null or both are set. Overnight windows are not supported in this foundation.';

comment on column public.recurring_visitor_passes.status is
  'Persisted lifecycle: active, suspended, revoked. Expired is derived, never stored.';

comment on column public.recurring_visitor_passes.suspended_at is
  'Set while status = suspended and cleared on reactivation. Full history lives in recurring_visitor_pass_events.';

comment on column public.recurring_visitor_passes.revoked_at is
  'Set permanently when the pass is revoked. Revoked passes are immutable.';

create index recurring_visitor_passes_society_id_idx
  on public.recurring_visitor_passes (society_id);

create index recurring_visitor_passes_society_status_idx
  on public.recurring_visitor_passes (society_id, status, created_at desc);

create index recurring_visitor_passes_society_active_idx
  on public.recurring_visitor_passes (society_id, valid_until desc)
  where status = 'active';

create index recurring_visitor_passes_society_visitor_mobile_idx
  on public.recurring_visitor_passes (society_id, visitor_mobile);

create index recurring_visitor_passes_society_visitor_name_lower_idx
  on public.recurring_visitor_passes (society_id, lower(trim(visitor_name)));

create index recurring_visitor_passes_society_flat_id_idx
  on public.recurring_visitor_passes (society_id, flat_id)
  where flat_id is not null;

create index recurring_visitor_passes_society_visitor_type_idx
  on public.recurring_visitor_passes (society_id, visitor_type_code);

create trigger recurring_visitor_passes_set_updated_at
before update on public.recurring_visitor_passes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- QR credentials (separate lifecycle from the person's pass)
-- ---------------------------------------------------------------------------

create table public.recurring_visitor_pass_credentials (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.recurring_visitor_passes (id) on delete restrict,
  society_id uuid not null references public.societies (id) on delete restrict,
  token_hash text not null,
  issued_at timestamptz not null default timezone('utc', now()),
  issued_by_app_user_id uuid not null references public.app_users (id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_app_user_id uuid references public.app_users (id) on delete restrict,
  revocation_reason text,
  created_at timestamptz not null default timezone('utc', now()),

  constraint recurring_visitor_pass_credentials_token_hash_unique unique (token_hash),
  -- SHA-256 lowercase hex only. This also makes it structurally impossible to
  -- persist the 48-character plaintext QR token by mistake.
  constraint recurring_visitor_pass_credentials_token_hash_format check (
    char_length(token_hash) = 64
    and token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint recurring_visitor_pass_credentials_revocation_reason_format check (
    revocation_reason is null
    or (
      char_length(trim(revocation_reason)) > 0
      and char_length(trim(revocation_reason)) <= 200
    )
  ),
  -- Killing a QR requires a reason. Revoked credentials are immutable (see
  -- enforce_recurring_pass_credential_terminal), so this reason can never
  -- later be blanked or rewritten.
  constraint recurring_visitor_pass_credentials_revocation_consistency check (
    (
      revoked_at is null
      and revoked_by_app_user_id is null
      and revocation_reason is null
    )
    or (
      revoked_at is not null
      and revoked_by_app_user_id is not null
      and revocation_reason is not null
      and char_length(trim(revocation_reason)) > 0
    )
  )
);

comment on table public.recurring_visitor_pass_credentials is
  'Opaque QR credentials for recurring visitor passes. Only the SHA-256 hash is stored. Suspension of a pass never touches these rows; credential revocation is permanent and requires a reason. No credential may be issued against a revoked pass.';

comment on column public.recurring_visitor_pass_credentials.token_hash is
  'SHA-256 (lowercase hex) of the opaque random QR token. Plaintext is returned to the Admin once at issue time and never persisted. Not readable by authenticated clients.';

comment on column public.recurring_visitor_pass_credentials.revoked_at is
  'Set permanently when this specific QR is killed. Never cleared, so a revoked QR can never validate again even if the pass is later reactivated or reissued.';

create index recurring_visitor_pass_credentials_pass_id_idx
  on public.recurring_visitor_pass_credentials (pass_id, issued_at desc);

create index recurring_visitor_pass_credentials_society_id_idx
  on public.recurring_visitor_pass_credentials (society_id);

-- At most one live QR per pass. Re-issuing requires revoking the previous one.
create unique index recurring_visitor_pass_credentials_one_active_per_pass
  on public.recurring_visitor_pass_credentials (pass_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Long-lived pass photo metadata (private visitor-photos bucket reused)
-- ---------------------------------------------------------------------------

create table public.recurring_visitor_pass_photos (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.recurring_visitor_passes (id) on delete restrict,
  society_id uuid not null references public.societies (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  content_type text not null,
  upload_status text not null default 'ready',
  created_by_app_user_id uuid not null references public.app_users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),

  constraint recurring_visitor_pass_photos_storage_bucket_format check (
    char_length(trim(storage_bucket)) > 0
  ),
  -- Tenant binding for the object key itself. The existing storage read
  -- policy authorizes on (storage.foldername(name))[1] = auth_society_id(),
  -- so a path whose first folder is not this row's society_id would be
  -- readable by the wrong tenant. Pinning society_id/recurring-passes/pass_id
  -- makes that a database invariant instead of an Edge Function convention,
  -- and also keeps these objects from colliding with the guard visitor-photo
  -- layout (society_id/guard_id/<uuid>.<ext>).
  -- The trailing '/_%' requires at least one character of file name and
  -- deliberately does not constrain the extension.
  -- UUID text contains no LIKE metacharacters, so no escaping is needed.
  constraint recurring_visitor_pass_photos_storage_path_format check (
    char_length(trim(storage_path)) > 0
    and storage_path like society_id::text || '/recurring-passes/' || pass_id::text || '/_%'
  ),
  constraint recurring_visitor_pass_photos_content_type_format check (
    char_length(trim(content_type)) > 0
  ),
  constraint recurring_visitor_pass_photos_upload_status_allowed check (
    upload_status in ('ready', 'replaced')
  ),
  constraint recurring_visitor_pass_photos_object_unique unique (
    storage_bucket,
    storage_path
  )
);

comment on table public.recurring_visitor_pass_photos is
  'Persistent recurring pass photo metadata. Kept separate from visitor_photo_uploads (short-lived, expires_at NOT NULL) and visitor_photos (visitor_entry_id NOT NULL, cascading). Objects stay in the existing private visitor-photos bucket under society_id/recurring-passes/pass_id/.';

comment on column public.recurring_visitor_pass_photos.storage_path is
  'Object key inside the private visitor-photos bucket. Constrained to begin with society_id/recurring-passes/pass_id/ so the tenant prefix relied on by the existing storage read policy cannot drift from this row''s society_id.';

comment on column public.recurring_visitor_pass_photos.upload_status is
  'ready = current pass photo, replaced = superseded by a newer photo. Exactly one ready row per pass.';

create index recurring_visitor_pass_photos_pass_id_idx
  on public.recurring_visitor_pass_photos (pass_id, created_at desc);

create index recurring_visitor_pass_photos_society_id_idx
  on public.recurring_visitor_pass_photos (society_id);

create unique index recurring_visitor_pass_photos_one_ready_per_pass
  on public.recurring_visitor_pass_photos (pass_id)
  where upload_status = 'ready';

-- ---------------------------------------------------------------------------
-- Append-only product timeline for pass lifecycle
-- ---------------------------------------------------------------------------

create table public.recurring_visitor_pass_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  pass_id uuid not null references public.recurring_visitor_passes (id) on delete restrict,
  credential_id uuid references public.recurring_visitor_pass_credentials (id) on delete restrict,
  event_type text not null,
  -- actor_app_user_id and visitor_entry_id are intentionally FK-free historical
  -- audit metadata, following the audit_logs.entity_id convention. A referential
  -- action of SET NULL would be implemented by PostgreSQL as an internal UPDATE
  -- on this table, which the append-only trigger below rejects; that would turn
  -- a delete on the referenced row into a confusing "append-only" failure. It is
  -- reachable today: register-visitor holds `grant delete on visitor_entries to
  -- service_role` and uses it as a compensating rollback when the photo insert
  -- fails. RESTRICT would avoid the misleading error but would let an immutable
  -- log row permanently block a legitimate rollback or app-user removal, so both
  -- columns carry no FK. Existence and same-society membership are still checked
  -- at INSERT time by enforce_recurring_pass_event_same_society(), which is the
  -- only moment that matters for an append-only record.
  actor_app_user_id uuid,
  actor_role public.user_role,
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  visitor_entry_id uuid,
  created_at timestamptz not null default timezone('utc', now()),

  constraint recurring_visitor_pass_events_event_type_allowed check (
    event_type in (
      'PASS_CREATED',
      'PASS_UPDATED',
      'PASS_SUSPENDED',
      'PASS_REACTIVATED',
      'PASS_REVOKED',
      'VALIDITY_RENEWED',
      'CREDENTIAL_ISSUED',
      'CREDENTIAL_REVOKED',
      'QR_VALIDATED',
      'QR_VALIDATION_REJECTED',
      'CHECKIN_VIA_QR',
      'CHECKIN_VIA_FALLBACK'
    )
  ),
  constraint recurring_visitor_pass_events_previous_status_allowed check (
    previous_status is null
    or previous_status in ('active', 'suspended', 'revoked')
  ),
  constraint recurring_visitor_pass_events_new_status_allowed check (
    new_status is null
    or new_status in ('active', 'suspended', 'revoked')
  ),
  constraint recurring_visitor_pass_events_reason_format check (
    reason is null
    or (
      char_length(trim(reason)) > 0
      and char_length(trim(reason)) <= 200
    )
  )
);

comment on table public.recurring_visitor_pass_events is
  'Append-only recurring pass timeline. Structurally immutable: no UPDATE/DELETE/TRUNCATE grants and a trigger that rejects them. Written only by trusted service_role paths; authenticated clients cannot insert. Separate from audit_logs, which remains the cross-module security trail.';

comment on column public.recurring_visitor_pass_events.pass_id is
  'Always required. Rejections for unknown or cross-society tokens have no resolvable pass and are recorded in audit_logs only, which keeps unauthenticated-token spray out of tenant timeline storage.';

comment on column public.recurring_visitor_pass_events.visitor_entry_id is
  'Historical audit metadata with no foreign key, following the audit_logs.entity_id convention. A SET NULL action would be an internal UPDATE that this append-only table rejects, which would break the register-visitor compensating rollback that deletes a visitor entry after a photo failure. Existence and same-society membership are validated at INSERT time instead.';

comment on column public.recurring_visitor_pass_events.actor_app_user_id is
  'Historical audit metadata with no foreign key, for the same append-only reason as visitor_entry_id. Existence and same-society membership are validated at INSERT time. Null only for system-originated events.';

create index recurring_visitor_pass_events_society_pass_idx
  on public.recurring_visitor_pass_events (society_id, pass_id, created_at desc);

create index recurring_visitor_pass_events_society_created_at_idx
  on public.recurring_visitor_pass_events (society_id, created_at desc);

create index recurring_visitor_pass_events_visitor_entry_id_idx
  on public.recurring_visitor_pass_events (visitor_entry_id)
  where visitor_entry_id is not null;

-- ---------------------------------------------------------------------------
-- Schedule element validation (null / duplicate weekday entries)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_recurring_visitor_pass_allowed_days()
returns trigger
language plpgsql
as $$
declare
  v_day smallint;
  v_count integer;
  v_distinct integer;
begin
  if array_ndims(new.allowed_days_of_week) <> 1 then
    raise exception 'recurring_visitor_passes.allowed_days_of_week must be a one-dimensional array';
  end if;

  v_count := coalesce(array_length(new.allowed_days_of_week, 1), 0);

  if v_count < 1 or v_count > 7 then
    raise exception 'recurring_visitor_passes.allowed_days_of_week must contain between 1 and 7 entries';
  end if;

  foreach v_day in array new.allowed_days_of_week loop
    if v_day is null then
      raise exception 'recurring_visitor_passes.allowed_days_of_week must not contain null entries';
    end if;

    if v_day < 0 or v_day > 6 then
      raise exception 'recurring_visitor_passes.allowed_days_of_week entries must be 0 (Sunday IST) through 6 (Saturday IST)';
    end if;
  end loop;

  select count(distinct d) into v_distinct
  from unnest(new.allowed_days_of_week) as d;

  if v_distinct <> v_count then
    raise exception 'recurring_visitor_passes.allowed_days_of_week must not contain duplicate entries';
  end if;

  return new;
end;
$$;

create trigger recurring_visitor_passes_enforce_allowed_days
before insert or update on public.recurring_visitor_passes
for each row execute function public.enforce_recurring_visitor_pass_allowed_days();

-- ---------------------------------------------------------------------------
-- Same-society integrity for passes
-- ---------------------------------------------------------------------------

create or replace function public.enforce_recurring_visitor_pass_same_society()
returns trigger
language plpgsql
as $$
declare
  v_flat_society_id uuid;
  v_resident_society_id uuid;
  v_actor_society_id uuid;
  v_actor_role public.user_role;
begin
  if new.flat_id is not null then
    select society_id into v_flat_society_id
    from public.flats
    where id = new.flat_id;

    if v_flat_society_id is null then
      raise exception 'recurring_visitor_passes.flat_id must reference an existing flat';
    end if;

    if new.society_id <> v_flat_society_id then
      raise exception 'recurring_visitor_passes.society_id must match flat society';
    end if;
  end if;

  if new.resident_id is not null then
    select society_id into v_resident_society_id
    from public.residents
    where id = new.resident_id;

    if v_resident_society_id is null then
      raise exception 'recurring_visitor_passes.resident_id must reference an existing resident';
    end if;

    if v_resident_society_id <> new.society_id then
      raise exception 'recurring_visitor_passes.resident_id must belong to the same society';
    end if;
  end if;

  select society_id, role
  into v_actor_society_id, v_actor_role
  from public.app_users
  where id = new.created_by_app_user_id;

  if v_actor_society_id is null then
    raise exception 'recurring_visitor_passes.created_by_app_user_id must reference an existing app user';
  end if;

  if v_actor_society_id <> new.society_id then
    raise exception 'recurring_visitor_passes.created_by_app_user_id must belong to the same society';
  end if;

  if v_actor_role <> 'society_admin' then
    raise exception 'recurring_visitor_passes must be created by a society admin';
  end if;

  if new.suspended_by_app_user_id is not null then
    select society_id, role
    into v_actor_society_id, v_actor_role
    from public.app_users
    where id = new.suspended_by_app_user_id;

    if v_actor_society_id is null then
      raise exception 'recurring_visitor_passes.suspended_by_app_user_id must reference an existing app user';
    end if;

    if v_actor_society_id <> new.society_id then
      raise exception 'recurring_visitor_passes.suspended_by_app_user_id must belong to the same society';
    end if;

    if v_actor_role <> 'society_admin' then
      raise exception 'recurring_visitor_passes.suspended_by_app_user_id must be a society admin';
    end if;
  end if;

  if new.revoked_by_app_user_id is not null then
    select society_id, role
    into v_actor_society_id, v_actor_role
    from public.app_users
    where id = new.revoked_by_app_user_id;

    if v_actor_society_id is null then
      raise exception 'recurring_visitor_passes.revoked_by_app_user_id must reference an existing app user';
    end if;

    if v_actor_society_id <> new.society_id then
      raise exception 'recurring_visitor_passes.revoked_by_app_user_id must belong to the same society';
    end if;

    if v_actor_role <> 'society_admin' then
      raise exception 'recurring_visitor_passes.revoked_by_app_user_id must be a society admin';
    end if;
  end if;

  return new;
end;
$$;

create trigger recurring_visitor_passes_enforce_same_society
before insert or update on public.recurring_visitor_passes
for each row execute function public.enforce_recurring_visitor_pass_same_society();

-- ---------------------------------------------------------------------------
-- Pass status transitions: revocation is terminal, reactivation needs validity
-- ---------------------------------------------------------------------------

create or replace function public.enforce_recurring_visitor_pass_transition()
returns trigger
language plpgsql
as $$
declare
  v_ist_today date;
begin
  if old.status = 'revoked' then
    raise exception 'recurring_visitor_passes: a revoked pass is terminal and cannot be modified';
  end if;

  if old.id <> new.id then
    raise exception 'recurring_visitor_passes.id is immutable';
  end if;

  if old.society_id <> new.society_id then
    raise exception 'recurring_visitor_passes.society_id is immutable';
  end if;

  if old.created_by_app_user_id <> new.created_by_app_user_id then
    raise exception 'recurring_visitor_passes.created_by_app_user_id is immutable';
  end if;

  if old.created_at <> new.created_at then
    raise exception 'recurring_visitor_passes.created_at is immutable';
  end if;

  v_ist_today := (timezone('Asia/Kolkata', now()))::date;

  if old.status = 'suspended' and new.status = 'active' then
    if new.valid_until < v_ist_today then
      raise exception 'recurring_visitor_passes: cannot reactivate an expired pass. Renew validity first';
    end if;
  end if;

  return new;
end;
$$;

create trigger recurring_visitor_passes_enforce_transition
before update on public.recurring_visitor_passes
for each row execute function public.enforce_recurring_visitor_pass_transition();

-- ---------------------------------------------------------------------------
-- Same-society integrity + terminal revocation for credentials
-- ---------------------------------------------------------------------------

create or replace function public.enforce_recurring_pass_credential_same_society()
returns trigger
language plpgsql
as $$
declare
  v_pass_society_id uuid;
  v_pass_status text;
  v_actor_society_id uuid;
  v_actor_role public.user_role;
begin
  select society_id, status
  into v_pass_society_id, v_pass_status
  from public.recurring_visitor_passes
  where id = new.pass_id;

  if v_pass_society_id is null then
    raise exception 'recurring_visitor_pass_credentials.pass_id must reference an existing pass';
  end if;

  if new.society_id <> v_pass_society_id then
    raise exception 'recurring_visitor_pass_credentials.society_id must match pass society';
  end if;

  -- Revocation of a pass is terminal, so no new QR may be issued against it.
  -- INSERT only: revoking an existing credential after its parent pass was
  -- already revoked is a legitimate cleanup UPDATE and must stay possible.
  -- Suspension is deliberately not checked here, because a suspended pass
  -- keeps its credential. Expiry is deliberately not checked either, because
  -- renewal is a separate flow and an expired pass may hold a valid QR.
  if tg_op = 'INSERT' and v_pass_status = 'revoked' then
    raise exception 'recurring_visitor_pass_credentials: cannot issue a QR credential for a revoked pass';
  end if;

  select society_id, role
  into v_actor_society_id, v_actor_role
  from public.app_users
  where id = new.issued_by_app_user_id;

  if v_actor_society_id is null then
    raise exception 'recurring_visitor_pass_credentials.issued_by_app_user_id must reference an existing app user';
  end if;

  if v_actor_society_id <> new.society_id then
    raise exception 'recurring_visitor_pass_credentials.issued_by_app_user_id must belong to the same society';
  end if;

  if v_actor_role <> 'society_admin' then
    raise exception 'recurring_visitor_pass_credentials must be issued by a society admin';
  end if;

  if new.revoked_by_app_user_id is not null then
    select society_id, role
    into v_actor_society_id, v_actor_role
    from public.app_users
    where id = new.revoked_by_app_user_id;

    if v_actor_society_id is null then
      raise exception 'recurring_visitor_pass_credentials.revoked_by_app_user_id must reference an existing app user';
    end if;

    if v_actor_society_id <> new.society_id then
      raise exception 'recurring_visitor_pass_credentials.revoked_by_app_user_id must belong to the same society';
    end if;

    if v_actor_role <> 'society_admin' then
      raise exception 'recurring_visitor_pass_credentials.revoked_by_app_user_id must be a society admin';
    end if;
  end if;

  return new;
end;
$$;

create trigger recurring_visitor_pass_credentials_enforce_same_society
before insert or update on public.recurring_visitor_pass_credentials
for each row execute function public.enforce_recurring_pass_credential_same_society();

create or replace function public.enforce_recurring_pass_credential_terminal()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null then
    raise exception 'recurring_visitor_pass_credentials: a revoked QR credential is terminal and cannot be modified';
  end if;

  if old.pass_id <> new.pass_id
    or old.society_id <> new.society_id
    or old.token_hash <> new.token_hash
    or old.issued_at <> new.issued_at
    or old.issued_by_app_user_id <> new.issued_by_app_user_id then
    raise exception 'recurring_visitor_pass_credentials: issued credential fields are immutable';
  end if;

  return new;
end;
$$;

create trigger recurring_visitor_pass_credentials_enforce_terminal
before update on public.recurring_visitor_pass_credentials
for each row execute function public.enforce_recurring_pass_credential_terminal();

-- ---------------------------------------------------------------------------
-- Same-society integrity for pass photos
-- ---------------------------------------------------------------------------

create or replace function public.enforce_recurring_pass_photo_same_society()
returns trigger
language plpgsql
as $$
declare
  v_pass_society_id uuid;
  v_actor_society_id uuid;
  v_actor_role public.user_role;
begin
  select society_id into v_pass_society_id
  from public.recurring_visitor_passes
  where id = new.pass_id;

  if v_pass_society_id is null then
    raise exception 'recurring_visitor_pass_photos.pass_id must reference an existing pass';
  end if;

  if new.society_id <> v_pass_society_id then
    raise exception 'recurring_visitor_pass_photos.society_id must match pass society';
  end if;

  select society_id, role
  into v_actor_society_id, v_actor_role
  from public.app_users
  where id = new.created_by_app_user_id;

  if v_actor_society_id is null then
    raise exception 'recurring_visitor_pass_photos.created_by_app_user_id must reference an existing app user';
  end if;

  if v_actor_society_id <> new.society_id then
    raise exception 'recurring_visitor_pass_photos.created_by_app_user_id must belong to the same society';
  end if;

  if v_actor_role <> 'society_admin' then
    raise exception 'recurring_visitor_pass_photos must be created by a society admin';
  end if;

  return new;
end;
$$;

create trigger recurring_visitor_pass_photos_enforce_same_society
before insert or update on public.recurring_visitor_pass_photos
for each row execute function public.enforce_recurring_pass_photo_same_society();

-- ---------------------------------------------------------------------------
-- Same-society integrity + structural immutability for pass events
-- ---------------------------------------------------------------------------

create or replace function public.enforce_recurring_pass_event_same_society()
returns trigger
language plpgsql
as $$
declare
  v_pass_society_id uuid;
  v_credential_pass_id uuid;
  v_credential_society_id uuid;
  v_actor_society_id uuid;
  v_entry_society_id uuid;
begin
  select society_id into v_pass_society_id
  from public.recurring_visitor_passes
  where id = new.pass_id;

  if v_pass_society_id is null then
    raise exception 'recurring_visitor_pass_events.pass_id must reference an existing pass';
  end if;

  if new.society_id <> v_pass_society_id then
    raise exception 'recurring_visitor_pass_events.society_id must match pass society';
  end if;

  if new.credential_id is not null then
    select pass_id, society_id
    into v_credential_pass_id, v_credential_society_id
    from public.recurring_visitor_pass_credentials
    where id = new.credential_id;

    if v_credential_society_id is null then
      raise exception 'recurring_visitor_pass_events.credential_id must reference an existing credential';
    end if;

    if v_credential_society_id <> new.society_id then
      raise exception 'recurring_visitor_pass_events.credential_id must belong to the same society';
    end if;

    if v_credential_pass_id <> new.pass_id then
      raise exception 'recurring_visitor_pass_events.credential_id must belong to the same pass';
    end if;
  end if;

  if new.actor_app_user_id is not null then
    select society_id into v_actor_society_id
    from public.app_users
    where id = new.actor_app_user_id;

    if v_actor_society_id is null then
      raise exception 'recurring_visitor_pass_events.actor_app_user_id must reference an existing app user';
    end if;

    if v_actor_society_id <> new.society_id then
      raise exception 'recurring_visitor_pass_events.actor_app_user_id must belong to the same society';
    end if;
  end if;

  if new.visitor_entry_id is not null then
    select society_id into v_entry_society_id
    from public.visitor_entries
    where id = new.visitor_entry_id;

    if v_entry_society_id is null then
      raise exception 'recurring_visitor_pass_events.visitor_entry_id must reference an existing visitor entry';
    end if;

    if v_entry_society_id <> new.society_id then
      raise exception 'recurring_visitor_pass_events.visitor_entry_id must belong to the same society';
    end if;
  end if;

  return new;
end;
$$;

create trigger recurring_visitor_pass_events_enforce_same_society
before insert on public.recurring_visitor_pass_events
for each row execute function public.enforce_recurring_pass_event_same_society();

create or replace function public.reject_recurring_pass_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'recurring_visitor_pass_events is append-only: % is not permitted', tg_op;
end;
$$;

create trigger recurring_visitor_pass_events_reject_update
before update on public.recurring_visitor_pass_events
for each row execute function public.reject_recurring_pass_event_mutation();

create trigger recurring_visitor_pass_events_reject_delete
before delete on public.recurring_visitor_pass_events
for each row execute function public.reject_recurring_pass_event_mutation();

create trigger recurring_visitor_pass_events_reject_truncate
before truncate on public.recurring_visitor_pass_events
for each statement execute function public.reject_recurring_pass_event_mutation();

-- ---------------------------------------------------------------------------
-- visitor_entries integration (additive; historical rows stay NULL/NULL)
-- ---------------------------------------------------------------------------

alter table public.visitor_entries
  add column recurring_pass_id uuid references public.recurring_visitor_passes (id) on delete restrict,
  add column entry_method text;

comment on column public.visitor_entries.recurring_pass_id is
  'Recurring visitor pass that authorised this visit. Null for ordinary registrations and all historical rows.';

comment on column public.visitor_entries.entry_method is
  'How a recurring visit was admitted: RECURRING_QR or RECURRING_FALLBACK. Null for ordinary registrations and all historical rows. Deliberately separate from verification_method, which retains its OTP-only meaning.';

alter table public.visitor_entries
  add constraint visitor_entries_entry_method_allowed check (
    entry_method is null
    or entry_method in ('RECURRING_QR', 'RECURRING_FALLBACK')
  );

alter table public.visitor_entries
  add constraint visitor_entries_recurring_pass_entry_method check (
    (
      entry_method is null
      and recurring_pass_id is null
    )
    or (
      entry_method is not null
      and recurring_pass_id is not null
    )
  );

-- Supports the recurring pass visit timeline and the "does this pass already
-- have an open visit?" check. Frequent Visitors filtering by
-- `recurring_pass_id is null` is already served by the existing
-- visitor_entries_society_visitor_mobile_idx, so no extra index is added for it.
create index visitor_entries_society_recurring_pass_idx
  on public.visitor_entries (society_id, recurring_pass_id, check_in_at desc)
  where recurring_pass_id is not null;

-- Extend the existing same-society trigger function only.
-- Preserves the M03 nullable-flat branch, resident checks, creator society check,
-- and the guard-only creation rule exactly. No SECURITY DEFINER / search_path
-- change: the function stays a plain invoker-rights plpgsql trigger function.
create or replace function public.enforce_visitor_entries_same_society()
returns trigger
language plpgsql
as $$
declare
  v_flat_society_id uuid;
  v_resident_society_id uuid;
  v_creator_society_id uuid;
  v_creator_role public.user_role;
  v_recurring_pass_society_id uuid;
begin
  if new.flat_id is not null then
    select society_id into v_flat_society_id
    from public.flats
    where id = new.flat_id;

    if v_flat_society_id is null then
      raise exception 'visitor_entries.flat_id must reference an existing flat';
    end if;

    if new.society_id <> v_flat_society_id then
      raise exception 'visitor_entries.society_id must match flat society';
    end if;
  end if;

  if new.resident_id is not null then
    select society_id into v_resident_society_id
    from public.residents
    where id = new.resident_id;

    if v_resident_society_id is null then
      raise exception 'visitor_entries.resident_id must reference an existing resident';
    end if;

    if v_resident_society_id <> new.society_id then
      raise exception 'visitor_entries.resident_id must belong to the same society';
    end if;
  end if;

  if new.recurring_pass_id is not null then
    select society_id into v_recurring_pass_society_id
    from public.recurring_visitor_passes
    where id = new.recurring_pass_id;

    if v_recurring_pass_society_id is null then
      raise exception 'visitor_entries.recurring_pass_id must reference an existing recurring visitor pass';
    end if;

    if v_recurring_pass_society_id <> new.society_id then
      raise exception 'visitor_entries.recurring_pass_id must belong to the same society';
    end if;
  end if;

  select society_id, role
  into v_creator_society_id, v_creator_role
  from public.app_users
  where id = new.created_by_app_user_id;

  if v_creator_society_id is null then
    raise exception 'visitor_entries.created_by_app_user_id must reference an existing app user';
  end if;

  if v_creator_society_id <> new.society_id then
    raise exception 'visitor_entries.created_by_app_user_id must belong to the same society';
  end if;

  if v_creator_role <> 'guard' then
    raise exception 'visitor_entries must be created by a guard';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.recurring_visitor_passes enable row level security;
alter table public.recurring_visitor_pass_credentials enable row level security;
alter table public.recurring_visitor_pass_photos enable row level security;
alter table public.recurring_visitor_pass_events enable row level security;

-- Passes: Admin reads own society only. Guards get no direct roster access;
-- QR scan and fallback will be served by controlled Edge Functions.
-- Mutations go through service_role Edge Functions, matching the
-- residents/flats admin-management convention.
create policy recurring_visitor_passes_select_society_admin
on public.recurring_visitor_passes
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

-- Credentials: no policies for authenticated at all. token_hash must never be
-- client-readable, following the auth_sessions.refresh_token_hash principle.
-- RLS is enabled with zero policies, so authenticated access is denied outright.

-- Pass photos: Admin reads own society metadata only. Objects themselves remain
-- in the private visitor-photos bucket and are served via signed URLs.
create policy recurring_visitor_pass_photos_select_society_admin
on public.recurring_visitor_pass_photos
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

-- Events: Admin reads own society timeline. No insert policy for authenticated,
-- so clients cannot write (or flood) the timeline; trusted Edge Functions use
-- service_role.
create policy recurring_visitor_pass_events_select_society_admin
on public.recurring_visitor_pass_events
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Authenticated: read-only where a policy exists. No credential access.
grant select on public.recurring_visitor_passes to authenticated;
grant select on public.recurring_visitor_pass_photos to authenticated;
grant select on public.recurring_visitor_pass_events to authenticated;

-- Service role: Edge Functions manage passes, credentials, photos and append
-- events. No DELETE anywhere: revocation replaces deletion, and the timeline is
-- append-only.
grant select, insert, update on public.recurring_visitor_passes to service_role;
grant select, insert, update on public.recurring_visitor_pass_credentials to service_role;
grant select, insert, update on public.recurring_visitor_pass_photos to service_role;
grant select, insert on public.recurring_visitor_pass_events to service_role;

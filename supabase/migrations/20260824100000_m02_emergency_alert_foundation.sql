-- M02 Emergency Alert foundation — society recipients and emergency events.
-- Additive only. No visitor/OTP/auth table changes. No seed contact numbers.

-- ---------------------------------------------------------------------------
-- Emergency recipients (Admin-managed; fetched server-side for alerts)
-- ---------------------------------------------------------------------------

create table public.emergency_recipients (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  display_name text not null,
  label text not null,
  mobile text not null,
  receives_sms boolean not null default true,
  receives_push boolean not null default true,
  active boolean not null default true,
  app_user_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint emergency_recipients_display_name_format check (
    char_length(trim(display_name)) > 0
  ),
  constraint emergency_recipients_label_format check (
    char_length(trim(label)) > 0
  ),
  constraint emergency_recipients_mobile_format check (
    char_length(trim(mobile)) = 10
    and trim(mobile) ~ '^[6-9][0-9]{9}$'
  )
);

comment on table public.emergency_recipients is
  'Society-configured emergency alert recipients. Login account is optional.';

comment on column public.emergency_recipients.app_user_id is
  'Optional link to an app_users row for future push targeting. Not required.';

comment on column public.emergency_recipients.mobile is
  '10-digit Indian mobile number. Not sourced from residents.mobile.';

create index emergency_recipients_society_id_idx
  on public.emergency_recipients (society_id);

create index emergency_recipients_society_active_idx
  on public.emergency_recipients (society_id, active)
  where active = true;

-- ---------------------------------------------------------------------------
-- Emergency events (Guard-raised lifecycle record)
-- ---------------------------------------------------------------------------

create table public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  raised_by_app_user_id uuid not null references public.app_users (id) on delete restrict,
  emergency_type text not null,
  notes text,
  raised_at timestamptz not null default timezone('utc', now()),
  status text not null default 'RAISED',
  acknowledged_at timestamptz,
  acknowledged_by_app_user_id uuid references public.app_users (id) on delete restrict,
  push_attempted boolean not null default false,
  push_result text,
  sms_attempted boolean not null default false,
  sms_result text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint emergency_events_type_allowed check (
    emergency_type in ('SECURITY', 'MEDICAL', 'FIRE', 'POLICE', 'OTHER')
  ),
  constraint emergency_events_status_allowed check (
    status in ('RAISED', 'ACKNOWLEDGED', 'RESOLVED')
  ),
  constraint emergency_events_ack_consistency check (
    (
      status = 'RAISED'
      and acknowledged_at is null
      and acknowledged_by_app_user_id is null
    )
    or (
      status in ('ACKNOWLEDGED', 'RESOLVED')
      and acknowledged_at is not null
      and acknowledged_by_app_user_id is not null
    )
  )
);

comment on table public.emergency_events is
  'Persistent Guard-raised emergency records. Separate from audit_logs.';

comment on column public.emergency_events.emergency_type is
  'Extensible text set: SECURITY, MEDICAL, FIRE, POLICE, OTHER.';

comment on column public.emergency_events.status is
  'Lifecycle: RAISED, ACKNOWLEDGED, RESOLVED.';

create index emergency_events_society_id_idx
  on public.emergency_events (society_id);

create index emergency_events_society_raised_at_idx
  on public.emergency_events (society_id, raised_at desc);

create index emergency_events_society_open_idx
  on public.emergency_events (society_id, status, raised_at desc)
  where status = 'RAISED';

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------

create trigger emergency_recipients_set_updated_at
before update on public.emergency_recipients
for each row execute function public.set_updated_at();

create trigger emergency_events_set_updated_at
before update on public.emergency_events
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Same-society integrity
-- ---------------------------------------------------------------------------

create or replace function public.enforce_emergency_recipient_same_society()
returns trigger
language plpgsql
as $$
declare
  v_user_society_id uuid;
begin
  if new.app_user_id is null then
    return new;
  end if;

  select society_id into v_user_society_id
  from public.app_users
  where id = new.app_user_id;

  if v_user_society_id is null then
    raise exception 'emergency_recipients.app_user_id must reference an existing app user';
  end if;

  if v_user_society_id <> new.society_id then
    raise exception 'emergency_recipients.app_user_id must belong to the same society';
  end if;

  return new;
end;
$$;

create trigger emergency_recipients_enforce_same_society
before insert or update on public.emergency_recipients
for each row execute function public.enforce_emergency_recipient_same_society();

create or replace function public.enforce_emergency_event_same_society()
returns trigger
language plpgsql
as $$
declare
  v_raiser_society_id uuid;
  v_ack_society_id uuid;
begin
  select society_id into v_raiser_society_id
  from public.app_users
  where id = new.raised_by_app_user_id;

  if v_raiser_society_id is null then
    raise exception 'emergency_events.raised_by_app_user_id must reference an existing app user';
  end if;

  if v_raiser_society_id <> new.society_id then
    raise exception 'emergency_events.raised_by_app_user_id must belong to the same society';
  end if;

  if new.acknowledged_by_app_user_id is not null then
    select society_id into v_ack_society_id
    from public.app_users
    where id = new.acknowledged_by_app_user_id;

    if v_ack_society_id is null then
      raise exception 'emergency_events.acknowledged_by_app_user_id must reference an existing app user';
    end if;

    if v_ack_society_id <> new.society_id then
      raise exception 'emergency_events.acknowledged_by_app_user_id must belong to the same society';
    end if;
  end if;

  return new;
end;
$$;

create trigger emergency_events_enforce_same_society
before insert or update on public.emergency_events
for each row execute function public.enforce_emergency_event_same_society();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.emergency_recipients enable row level security;
alter table public.emergency_events enable row level security;

-- Recipients: Admin manage within tenant. Guards have no SELECT (mobiles stay
-- off the client). Future raise-emergency Edge Function uses service_role.

create policy emergency_recipients_select_society_admin
on public.emergency_recipients
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

create policy emergency_recipients_insert_society_admin
on public.emergency_recipients
for insert
to authenticated
with check (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

create policy emergency_recipients_update_society_admin
on public.emergency_recipients
for update
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
)
with check (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

create policy emergency_recipients_delete_society_admin
on public.emergency_recipients
for delete
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

-- Events: society members read; Guards raise; Admins acknowledge/update.

create policy emergency_events_select_society
on public.emergency_events
for select
to authenticated
using (society_id = public.auth_society_id());

create policy emergency_events_insert_guard
on public.emergency_events
for insert
to authenticated
with check (
  public.auth_app_role() = 'guard'
  and society_id = public.auth_society_id()
  and raised_by_app_user_id = public.auth_app_user_id()
);

create policy emergency_events_update_society_admin
on public.emergency_events
for update
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
)
with check (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.emergency_recipients to authenticated;
grant select, insert, update on public.emergency_events to authenticated;

grant select, insert, update, delete on public.emergency_recipients to service_role;
grant select, insert, update on public.emergency_events to service_role;

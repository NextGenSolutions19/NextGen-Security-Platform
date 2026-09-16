-- M03-T10 / M03-T06: Admin emergency resolution fields + per-admin notification reads.
-- Additive. Does not rewrite visitor, flat, resident, auth, or Security Policies data.
-- Does not delete emergency_events. SMS/push remain unused.

-- ---------------------------------------------------------------------------
-- Resolution identity on the existing emergency_events record
-- ---------------------------------------------------------------------------

alter table public.emergency_events
  add column resolved_at timestamptz,
  add column resolved_by_app_user_id uuid references public.app_users (id) on delete restrict;

comment on column public.emergency_events.resolved_at is
  'When an Admin marked the event resolved. Null until resolved.';

comment on column public.emergency_events.resolved_by_app_user_id is
  'Admin who resolved the event. Same society as the event.';

alter table public.emergency_events
  drop constraint emergency_events_ack_consistency;

alter table public.emergency_events
  add constraint emergency_events_ack_consistency check (
    (
      status = 'RAISED'
      and acknowledged_at is null
      and acknowledged_by_app_user_id is null
      and resolved_at is null
      and resolved_by_app_user_id is null
    )
    or (
      status = 'ACKNOWLEDGED'
      and acknowledged_at is not null
      and acknowledged_by_app_user_id is not null
      and resolved_at is null
      and resolved_by_app_user_id is null
    )
    or (
      status = 'RESOLVED'
      and acknowledged_at is not null
      and acknowledged_by_app_user_id is not null
      and (
        (resolved_at is null and resolved_by_app_user_id is null)
        or (resolved_at is not null and resolved_by_app_user_id is not null)
      )
    )
  );

create or replace function public.enforce_emergency_event_same_society()
returns trigger
language plpgsql
as $$
declare
  v_raiser_society_id uuid;
  v_ack_society_id uuid;
  v_resolver_society_id uuid;
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

  if new.resolved_by_app_user_id is not null then
    select society_id into v_resolver_society_id
    from public.app_users
    where id = new.resolved_by_app_user_id;

    if v_resolver_society_id is null then
      raise exception 'emergency_events.resolved_by_app_user_id must reference an existing app user';
    end if;

    if v_resolver_society_id <> new.society_id then
      raise exception 'emergency_events.resolved_by_app_user_id must belong to the same society';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-admin in-app notification read state (derived from emergency_events)
-- ---------------------------------------------------------------------------

create table public.admin_emergency_notification_reads (
  society_id uuid not null references public.societies (id) on delete restrict,
  app_user_id uuid not null references public.app_users (id) on delete restrict,
  emergency_event_id uuid not null references public.emergency_events (id) on delete restrict,
  read_at timestamptz not null default timezone('utc', now()),
  primary key (app_user_id, emergency_event_id)
);

comment on table public.admin_emergency_notification_reads is
  'Per-admin read receipts for emergency-derived in-app notifications. Events remain authoritative.';

create index admin_emergency_notification_reads_society_admin_idx
  on public.admin_emergency_notification_reads (society_id, app_user_id, read_at desc);

create or replace function public.enforce_admin_emergency_notification_read_scope()
returns trigger
language plpgsql
as $$
declare
  v_user_society_id uuid;
  v_user_role user_role;
  v_event_society_id uuid;
begin
  select society_id, role into v_user_society_id, v_user_role
  from public.app_users
  where id = new.app_user_id;

  if v_user_society_id is null then
    raise exception 'admin_emergency_notification_reads.app_user_id must reference an existing app user';
  end if;

  if v_user_role <> 'society_admin' then
    raise exception 'admin_emergency_notification_reads.app_user_id must be a society admin';
  end if;

  if v_user_society_id <> new.society_id then
    raise exception 'admin_emergency_notification_reads.app_user_id must belong to the same society';
  end if;

  select society_id into v_event_society_id
  from public.emergency_events
  where id = new.emergency_event_id;

  if v_event_society_id is null then
    raise exception 'admin_emergency_notification_reads.emergency_event_id must reference an existing event';
  end if;

  if v_event_society_id <> new.society_id then
    raise exception 'admin_emergency_notification_reads.emergency_event_id must belong to the same society';
  end if;

  return new;
end;
$$;

create trigger admin_emergency_notification_reads_enforce_scope
before insert or update on public.admin_emergency_notification_reads
for each row execute function public.enforce_admin_emergency_notification_read_scope();

alter table public.admin_emergency_notification_reads enable row level security;

create policy admin_emergency_notification_reads_select_own
on public.admin_emergency_notification_reads
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
  and app_user_id = public.auth_app_user_id()
);

create policy admin_emergency_notification_reads_insert_own
on public.admin_emergency_notification_reads
for insert
to authenticated
with check (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
  and app_user_id = public.auth_app_user_id()
);

grant select, insert on public.admin_emergency_notification_reads to authenticated;
grant select, insert on public.admin_emergency_notification_reads to service_role;

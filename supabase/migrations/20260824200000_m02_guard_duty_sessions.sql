-- M02 Guard duty sessions — persistent On Duty / Off Duty.
-- Additive only. No visitor/OTP/auth/emergency table changes.

-- ---------------------------------------------------------------------------
-- Duty sessions
-- ---------------------------------------------------------------------------

create table public.guard_duty_sessions (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  app_user_id uuid not null references public.app_users (id) on delete restrict,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint guard_duty_sessions_ended_at_order check (
    ended_at is null or ended_at >= started_at
  )
);

comment on table public.guard_duty_sessions is
  'Persistent Guard duty sessions. ended_at IS NULL means currently on duty.';

comment on column public.guard_duty_sessions.app_user_id is
  'Guard app_users.id. Must belong to society_id. One active session per Guard.';

comment on column public.guard_duty_sessions.started_at is
  'Database timestamp when the Guard went on duty. Not client-supplied.';

comment on column public.guard_duty_sessions.ended_at is
  'Database timestamp when the Guard went off duty. Null while on duty.';

create index guard_duty_sessions_society_id_idx
  on public.guard_duty_sessions (society_id);

create index guard_duty_sessions_app_user_id_started_at_idx
  on public.guard_duty_sessions (app_user_id, started_at desc);

-- Database-level: never more than one active session per Guard.
create unique index guard_duty_sessions_one_active_per_guard_idx
  on public.guard_duty_sessions (app_user_id)
  where ended_at is null;

create trigger guard_duty_sessions_set_updated_at
before update on public.guard_duty_sessions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Same-society / Guard-role integrity (SECURITY DEFINER: does not require
-- authenticated GRANT on app_users)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_guard_duty_session_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_society_id uuid;
  v_user_role public.user_role;
begin
  if tg_op = 'UPDATE' then
    if new.society_id is distinct from old.society_id
      or new.app_user_id is distinct from old.app_user_id
      or new.started_at is distinct from old.started_at
    then
      raise exception 'guard_duty_sessions identity fields cannot be changed';
    end if;

    if old.ended_at is not null then
      raise exception 'ended guard_duty_sessions cannot be modified';
    end if;
  end if;

  select society_id, role
  into v_user_society_id, v_user_role
  from public.app_users
  where id = new.app_user_id;

  if v_user_society_id is null then
    raise exception 'guard_duty_sessions.app_user_id must reference an existing app user';
  end if;

  if v_user_role <> 'guard' then
    raise exception 'guard_duty_sessions.app_user_id must be a guard';
  end if;

  if v_user_society_id <> new.society_id then
    raise exception 'guard_duty_sessions.app_user_id must belong to the same society';
  end if;

  return new;
end;
$$;

create trigger guard_duty_sessions_enforce_integrity
before insert or update on public.guard_duty_sessions
for each row execute function public.enforce_guard_duty_session_integrity();

-- ---------------------------------------------------------------------------
-- Trusted RPCs: society and Guard IDs come from JWT, timestamps from the DB.
-- ---------------------------------------------------------------------------

create or replace function public.start_guard_duty()
returns public.guard_duty_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_society_id uuid;
  v_app_user_id uuid;
  v_session public.guard_duty_sessions;
begin
  if public.auth_app_role() is distinct from 'guard' then
    raise exception 'FORBIDDEN';
  end if;

  v_society_id := public.auth_society_id();
  v_app_user_id := public.auth_app_user_id();

  if v_society_id is null or v_app_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  insert into public.guard_duty_sessions (society_id, app_user_id)
  values (v_society_id, v_app_user_id)
  returning * into v_session;

  perform public.write_audit_log(
    v_society_id,
    v_app_user_id,
    'guard',
    'duty.started',
    'guard_duty_session',
    v_session.id,
    jsonb_build_object('started_at', v_session.started_at)
  );

  return v_session;
exception
  when unique_violation then
    raise exception 'ALREADY_ON_DUTY';
end;
$$;

create or replace function public.end_guard_duty()
returns public.guard_duty_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_society_id uuid;
  v_app_user_id uuid;
  v_session public.guard_duty_sessions;
begin
  if public.auth_app_role() is distinct from 'guard' then
    raise exception 'FORBIDDEN';
  end if;

  v_society_id := public.auth_society_id();
  v_app_user_id := public.auth_app_user_id();

  if v_society_id is null or v_app_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  update public.guard_duty_sessions
  set ended_at = timezone('utc', now())
  where society_id = v_society_id
    and app_user_id = v_app_user_id
    and ended_at is null
  returning * into v_session;

  if v_session.id is null then
    raise exception 'ALREADY_OFF_DUTY';
  end if;

  perform public.write_audit_log(
    v_society_id,
    v_app_user_id,
    'guard',
    'duty.ended',
    'guard_duty_session',
    v_session.id,
    jsonb_build_object(
      'started_at', v_session.started_at,
      'ended_at', v_session.ended_at
    )
  );

  return v_session;
end;
$$;

revoke all on function public.start_guard_duty() from public;
revoke all on function public.end_guard_duty() from public;
grant execute on function public.start_guard_duty() to authenticated;
grant execute on function public.end_guard_duty() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.guard_duty_sessions enable row level security;

-- Guards read only their own sessions in their JWT society.
-- Writes go through start_guard_duty / end_guard_duty so client IDs are ignored.
create policy guard_duty_sessions_select_own
on public.guard_duty_sessions
for select
to authenticated
using (
  public.auth_app_role() = 'guard'
  and society_id = public.auth_society_id()
  and app_user_id = public.auth_app_user_id()
);

-- No INSERT / UPDATE / DELETE policies for authenticated.
-- No Admin policies in this M02 slice (no admin duty UI).

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.guard_duty_sessions from public;
grant select on public.guard_duty_sessions to authenticated;
grant select, insert, update on public.guard_duty_sessions to service_role;

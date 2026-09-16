-- M01: Foundation schema — societies, app_users, auth_sessions, audit_logs, RLS base

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('guard', 'society_admin');

create type public.account_status as enum ('active', 'disabled');

-- ---------------------------------------------------------------------------
-- Societies
-- ---------------------------------------------------------------------------

create table public.societies (
  id uuid primary key default gen_random_uuid(),
  society_code text not null,
  name text not null,
  status public.account_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint societies_society_code_unique unique (society_code),
  constraint societies_society_code_format check (char_length(trim(society_code)) > 0)
);

create index societies_society_code_idx on public.societies (upper(society_code));

-- ---------------------------------------------------------------------------
-- Application users (Guard + Society Admin)
-- ---------------------------------------------------------------------------

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  login_id text not null,
  password_hash text not null,
  role public.user_role not null,
  society_id uuid not null references public.societies (id) on delete restrict,
  status public.account_status not null default 'active',
  must_change_password boolean not null default false,
  is_authorized_admin boolean not null default false,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_users_login_id_unique unique (login_id),
  constraint app_users_login_id_format check (char_length(trim(login_id)) > 0)
);

create index app_users_society_id_idx on public.app_users (society_id);
create index app_users_login_id_lower_idx on public.app_users (lower(login_id));

-- ---------------------------------------------------------------------------
-- Refresh token sessions (server-side revocation support)
-- ---------------------------------------------------------------------------

create table public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  refresh_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint auth_sessions_refresh_token_hash_unique unique (refresh_token_hash)
);

create index auth_sessions_app_user_id_idx on public.auth_sessions (app_user_id);

-- ---------------------------------------------------------------------------
-- Audit logs (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid references public.societies (id) on delete set null,
  actor_id uuid references public.app_users (id) on delete set null,
  actor_role public.user_role,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_logs_society_id_idx on public.audit_logs (society_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Updated-at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger societies_set_updated_at
before update on public.societies
for each row execute function public.set_updated_at();

create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- JWT claim helpers (custom claims on Supabase-compatible JWT)
-- ---------------------------------------------------------------------------

create or replace function public.auth_society_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'society_id', '')::uuid;
$$;

create or replace function public.auth_app_user_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'app_user_id', '')::uuid;
$$;

create or replace function public.auth_app_role()
returns public.user_role
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'app_role', '')::public.user_role;
$$;

create or replace function public.auth_is_authorized_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_authorized_admin')::boolean, false);
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.societies enable row level security;
alter table public.app_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.audit_logs enable row level security;

-- Societies: authenticated users read only their assigned society
create policy societies_select_own
on public.societies
for select
to authenticated
using (id = public.auth_society_id());

-- App users: read own profile within tenant boundary
create policy app_users_select_own
on public.app_users
for select
to authenticated
using (
  id = public.auth_app_user_id()
  and society_id = public.auth_society_id()
);

-- Auth sessions: users can read own active sessions
create policy auth_sessions_select_own
on public.auth_sessions
for select
to authenticated
using (
  app_user_id = public.auth_app_user_id()
  and exists (
    select 1
    from public.app_users u
    where u.id = auth_sessions.app_user_id
      and u.society_id = public.auth_society_id()
  )
);

-- Audit logs: society admins read society audit trail
create policy audit_logs_select_society_admin
on public.audit_logs
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

-- Service role bypasses RLS for Edge Functions and operator tooling.

-- ---------------------------------------------------------------------------
-- Audit helper (callable from Edge Functions via service role)
-- ---------------------------------------------------------------------------

create or replace function public.write_audit_log(
  p_society_id uuid,
  p_actor_id uuid,
  p_actor_role public.user_role,
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (
    society_id,
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_society_id,
    p_actor_id,
    p_actor_role,
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.write_audit_log(uuid, uuid, public.user_role, text, text, uuid, jsonb) from public;
grant execute on function public.write_audit_log(uuid, uuid, public.user_role, text, text, uuid, jsonb) to service_role;

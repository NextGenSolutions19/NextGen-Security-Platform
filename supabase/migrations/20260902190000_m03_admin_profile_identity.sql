-- M03-T08 / M03-T09: Additive admin identity fields + society-scoped Login ID generation.
-- Reuses public.app_users. Does not create a second Admin profile table.
-- Does not rewrite existing login_id values (ADMIN, ADMIN2, etc.).
-- Does not change RLS on app_users.

-- ---------------------------------------------------------------------------
-- Optional person identity on existing admin/guard accounts
-- ---------------------------------------------------------------------------

alter table public.app_users
  add column if not exists admin_name text,
  add column if not exists mobile_number text,
  add column if not exists email text;

comment on column public.app_users.admin_name is
  'Display name for society Admin accounts. Null for existing rows until the Admin saves a profile.';

comment on column public.app_users.mobile_number is
  'Optional 10-digit Indian mobile number for Admin accounts.';

comment on column public.app_users.email is
  'Optional Admin email. Null when not supplied.';

alter table public.app_users
  drop constraint if exists app_users_admin_mobile_format;

alter table public.app_users
  add constraint app_users_admin_mobile_format
  check (mobile_number is null or mobile_number ~ '^[6-9][0-9]{9}$');

-- ---------------------------------------------------------------------------
-- Per-society Login ID counter (never decreases; deactivated IDs stay reserved)
-- ---------------------------------------------------------------------------

create table if not exists public.society_admin_login_counters (
  society_id uuid primary key references public.societies (id) on delete restrict,
  last_n integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.society_admin_login_counters is
  'Last used ADMIN## sequence per society. Increment-only so deactivated Login IDs are not reused.';

insert into public.society_admin_login_counters (society_id, last_n)
select
  u.society_id,
  coalesce(max(substring(u.login_id from '^ADMIN([0-9]+)$')::integer), 0)
from public.app_users u
where u.role = 'society_admin'
  and u.login_id ~ '^ADMIN[0-9]+$'
group by u.society_id
on conflict (society_id) do nothing;

alter table public.society_admin_login_counters enable row level security;

revoke all on table public.society_admin_login_counters from public, anon, authenticated;
grant select, insert, update on table public.society_admin_login_counters to service_role;

create or replace function public.next_society_admin_login_id(p_society_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initial integer;
  v_n integer;
  v_candidate text;
  v_taken boolean;
begin
  if p_society_id is null then
    raise exception 'society is required';
  end if;

  select coalesce(max(substring(login_id from '^ADMIN([0-9]+)$')::integer), 0)
  into v_initial
  from public.app_users
  where society_id = p_society_id
    and role = 'society_admin'
    and login_id ~ '^ADMIN[0-9]+$';

  insert into public.society_admin_login_counters (society_id, last_n)
  values (p_society_id, v_initial)
  on conflict (society_id) do nothing;

  loop
    update public.society_admin_login_counters
    set
      last_n = last_n + 1,
      updated_at = timezone('utc', now())
    where society_id = p_society_id
    returning last_n into v_n;

    if v_n is null then
      raise exception 'unable to allocate admin login id';
    end if;

    v_candidate := 'ADMIN' || lpad(v_n::text, greatest(2, length(v_n::text)), '0');

    select exists (
      select 1
      from public.app_users
      where login_id = v_candidate
    ) into v_taken;

    if not v_taken then
      return v_candidate;
    end if;
  end loop;
end;
$$;

comment on function public.next_society_admin_login_id(uuid) is
  'Allocates the next ADMIN## Login ID for a society. Does not rewrite existing IDs. Skips globally taken values.';

revoke all on function public.next_society_admin_login_id(uuid) from public, anon, authenticated;
grant execute on function public.next_society_admin_login_id(uuid) to service_role;

-- M03-T04: Society security policies (additive).
-- Does not rewrite visitor, flat, resident, auth, emergency, or notification data.
-- Missing rows mean product defaults (OTP optional, resident selection optional).

-- ---------------------------------------------------------------------------
-- Society-scoped visitor security policies
-- ---------------------------------------------------------------------------

create table public.society_security_policies (
  society_id uuid primary key references public.societies (id) on delete restrict,
  otp_required boolean not null default false,
  resident_selection_required boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.society_security_policies is
  'Per-society visitor security policies. One row per society. Absence means product defaults.';

comment on column public.society_security_policies.otp_required is
  'When true, Register without OTP is not allowed. Default false matches current Guard behavior.';

comment on column public.society_security_policies.resident_selection_required is
  'When true, a linked resident is required for purposes that require resident approval. Cab/Taxi stays exempt. Default false matches current optional selection.';

create trigger society_security_policies_set_updated_at
before update on public.society_security_policies
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Visitor OTP fallback reason (new registrations only)
-- ---------------------------------------------------------------------------

alter table public.visitor_entries
  add column otp_fallback_reason text;

comment on column public.visitor_entries.otp_fallback_reason is
  'Required for new register_without_otp registrations. Null for OTP-verified and historical rows.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.society_security_policies enable row level security;

-- Admin read/write own society only. Guards have no direct table access;
-- they receive policies through the society-security-policies Edge Function.
create policy society_security_policies_select_society_admin
on public.society_security_policies
for select
to authenticated
using (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

create policy society_security_policies_insert_society_admin
on public.society_security_policies
for insert
to authenticated
with check (
  public.auth_app_role() = 'society_admin'
  and society_id = public.auth_society_id()
);

create policy society_security_policies_update_society_admin
on public.society_security_policies
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

grant select, insert, update on public.society_security_policies to authenticated;
grant select, insert, update on public.society_security_policies to service_role;

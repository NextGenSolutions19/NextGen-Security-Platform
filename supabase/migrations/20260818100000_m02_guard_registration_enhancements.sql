-- M02-04: Guard registration enhancements — OTP, photo uploads, verification metadata

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.visitor_verification_method as enum (
  'OTP_VERIFIED',
  'OTP_NOT_PERFORMED'
);

create type public.visitor_registration_mode as enum (
  'verify_with_otp',
  'register_without_otp'
);

-- ---------------------------------------------------------------------------
-- OTP challenges
-- ---------------------------------------------------------------------------

create table public.visitor_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  visitor_mobile text not null,
  created_by_app_user_id uuid not null references public.app_users (id) on delete restrict,
  otp_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  attempt_count integer not null default 0,
  resend_count integer not null default 0,
  last_sent_at timestamptz not null default timezone('utc', now()),
  verification_token_hash text,
  verification_token_expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint visitor_otp_challenges_mobile_format check (
    char_length(trim(visitor_mobile)) = 10
    and trim(visitor_mobile) ~ '^[6-9][0-9]{9}$'
  )
);

create index visitor_otp_challenges_society_mobile_idx
  on public.visitor_otp_challenges (society_id, visitor_mobile, created_at desc);

create index visitor_otp_challenges_guard_idx
  on public.visitor_otp_challenges (created_by_app_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Pre-registration photo uploads
-- ---------------------------------------------------------------------------

create table public.visitor_photo_uploads (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete restrict,
  created_by_app_user_id uuid not null references public.app_users (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  content_type text not null,
  upload_status text not null default 'ready',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint visitor_photo_uploads_storage_bucket_format check (char_length(trim(storage_bucket)) > 0),
  constraint visitor_photo_uploads_storage_path_format check (char_length(trim(storage_path)) > 0),
  constraint visitor_photo_uploads_content_type_format check (char_length(trim(content_type)) > 0)
);

create index visitor_photo_uploads_society_guard_idx
  on public.visitor_photo_uploads (society_id, created_by_app_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- visitor_entries enhancements
-- ---------------------------------------------------------------------------

alter table public.visitor_entries
  add column registration_mode public.visitor_registration_mode,
  add column verification_method public.visitor_verification_method,
  add column purpose_code text,
  add column purpose_label text,
  add column custom_purpose_text text,
  add column vehicle_visually_checked boolean not null default false,
  add column visitor_photo_upload_id uuid references public.visitor_photo_uploads (id) on delete restrict;

update public.visitor_entries
set
  registration_mode = 'register_without_otp',
  verification_method = 'OTP_NOT_PERFORMED',
  purpose_code = 'legacy',
  purpose_label = purpose
where purpose_code is null;

alter table public.visitor_entries
  alter column registration_mode set not null,
  alter column verification_method set not null,
  alter column purpose_code set not null,
  alter column purpose_label set not null;

alter table public.visitor_entries
  drop constraint if exists visitor_entries_visitor_mobile_format;

-- Legacy rows may predate Indian mobile validation; normalize before enforcing constraint.
update public.visitor_entries
set visitor_mobile = '9' || lpad(
  substring(regexp_replace(md5(id::text), '[^0-9]', '', 'g') from 1 for 9),
  9,
  '0'
)
where char_length(trim(visitor_mobile)) <> 10
   or trim(visitor_mobile) !~ '^[6-9][0-9]{9}$';

alter table public.visitor_entries
  add constraint visitor_entries_visitor_mobile_format check (
    char_length(trim(visitor_mobile)) = 10
    and trim(visitor_mobile) ~ '^[6-9][0-9]{9}$'
  );

-- ---------------------------------------------------------------------------
-- Storage bucket for visitor photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visitor-photos',
  'visitor-photos',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.visitor_otp_challenges enable row level security;
alter table public.visitor_photo_uploads enable row level security;

create policy visitor_otp_challenges_select_society
on public.visitor_otp_challenges
for select
to authenticated
using (
  society_id = public.auth_society_id()
  and created_by_app_user_id = public.auth_app_user_id()
);

create policy visitor_photo_uploads_select_society
on public.visitor_photo_uploads
for select
to authenticated
using (
  society_id = public.auth_society_id()
  and created_by_app_user_id = public.auth_app_user_id()
);

-- ---------------------------------------------------------------------------
-- Service role grants for Edge Functions
-- ---------------------------------------------------------------------------

grant select, insert, update on public.visitor_otp_challenges to service_role;
grant select, insert, update on public.visitor_photo_uploads to service_role;
grant insert, select on public.visitor_photos to service_role;

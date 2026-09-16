-- M02: Visitor registration foundation — visitor_entries, visitor_photos, RLS



-- ---------------------------------------------------------------------------

-- Enums

-- ---------------------------------------------------------------------------



create type public.visitor_entry_status as enum ('checked_in', 'checked_out');



-- ---------------------------------------------------------------------------

-- Visitor entries (check-in records)

-- ---------------------------------------------------------------------------



create table public.visitor_entries (

  id uuid primary key default gen_random_uuid(),

  society_id uuid not null references public.societies (id) on delete restrict,

  flat_id uuid not null references public.flats (id) on delete restrict,

  resident_id uuid references public.residents (id) on delete set null,

  visitor_mobile text not null,

  purpose text not null,

  vehicle_number text,

  id_type text,

  id_number text,

  notes text,

  status public.visitor_entry_status not null default 'checked_in',

  check_in_at timestamptz not null default timezone('utc', now()),

  created_by_app_user_id uuid not null references public.app_users (id) on delete restrict,

  created_at timestamptz not null default timezone('utc', now()),

  updated_at timestamptz not null default timezone('utc', now()),

  constraint visitor_entries_purpose_format check (char_length(trim(purpose)) > 0),

  constraint visitor_entries_visitor_mobile_format check (

    char_length(trim(visitor_mobile)) = 10

    and trim(visitor_mobile) ~ '^[0-9]+$'

  )

);



create index visitor_entries_society_id_idx on public.visitor_entries (society_id);

create index visitor_entries_society_status_check_in_idx

  on public.visitor_entries (society_id, status, check_in_at desc);

create index visitor_entries_society_flat_id_idx

  on public.visitor_entries (society_id, flat_id);

create index visitor_entries_created_by_app_user_id_idx

  on public.visitor_entries (created_by_app_user_id);

create index visitor_entries_society_visitor_mobile_idx

  on public.visitor_entries (society_id, visitor_mobile);



-- ---------------------------------------------------------------------------

-- Visitor photos (metadata only — bucket created separately)

-- ---------------------------------------------------------------------------



create table public.visitor_photos (

  id uuid primary key default gen_random_uuid(),

  society_id uuid not null references public.societies (id) on delete restrict,

  visitor_entry_id uuid not null references public.visitor_entries (id) on delete cascade,

  storage_bucket text not null,

  storage_path text not null,

  upload_status text not null default 'pending',

  created_by_app_user_id uuid not null references public.app_users (id) on delete restrict,

  created_at timestamptz not null default timezone('utc', now()),

  constraint visitor_photos_storage_bucket_format check (char_length(trim(storage_bucket)) > 0),

  constraint visitor_photos_storage_path_format check (char_length(trim(storage_path)) > 0),

  constraint visitor_photos_upload_status_format check (char_length(trim(upload_status)) > 0)

);



create index visitor_photos_society_id_idx on public.visitor_photos (society_id);

create index visitor_photos_visitor_entry_id_idx on public.visitor_photos (visitor_entry_id);



-- ---------------------------------------------------------------------------

-- Updated-at trigger

-- ---------------------------------------------------------------------------



create trigger visitor_entries_set_updated_at

before update on public.visitor_entries

for each row execute function public.set_updated_at();



-- ---------------------------------------------------------------------------

-- Same-society integrity for visitor entries and photos

-- ---------------------------------------------------------------------------



create or replace function public.enforce_visitor_entries_same_society()

returns trigger

language plpgsql

as $$

declare

  v_flat_society_id uuid;

  v_resident_society_id uuid;

  v_creator_society_id uuid;

  v_creator_role public.user_role;

begin

  select society_id into v_flat_society_id

  from public.flats

  where id = new.flat_id;



  if v_flat_society_id is null then

    raise exception 'visitor_entries.flat_id must reference an existing flat';

  end if;



  if new.society_id <> v_flat_society_id then

    raise exception 'visitor_entries.society_id must match flat society';

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



create trigger visitor_entries_enforce_same_society

before insert or update on public.visitor_entries

for each row execute function public.enforce_visitor_entries_same_society();



create or replace function public.enforce_visitor_photos_same_society()

returns trigger

language plpgsql

as $$

declare

  v_entry_society_id uuid;

  v_creator_society_id uuid;

  v_creator_role public.user_role;

begin

  select society_id into v_entry_society_id

  from public.visitor_entries

  where id = new.visitor_entry_id;



  if v_entry_society_id is null then

    raise exception 'visitor_photos.visitor_entry_id must reference an existing visitor entry';

  end if;



  if new.society_id <> v_entry_society_id then

    raise exception 'visitor_photos.society_id must match visitor entry society';

  end if;



  select society_id, role

  into v_creator_society_id, v_creator_role

  from public.app_users

  where id = new.created_by_app_user_id;



  if v_creator_society_id is null then

    raise exception 'visitor_photos.created_by_app_user_id must reference an existing app user';

  end if;



  if v_creator_society_id <> new.society_id then

    raise exception 'visitor_photos.created_by_app_user_id must belong to the same society';

  end if;



  if v_creator_role <> 'guard' then

    raise exception 'visitor_photos must be created by a guard';

  end if;



  return new;

end;

$$;



create trigger visitor_photos_enforce_same_society

before insert or update on public.visitor_photos

for each row execute function public.enforce_visitor_photos_same_society();



-- ---------------------------------------------------------------------------

-- Row Level Security

-- ---------------------------------------------------------------------------



alter table public.visitor_entries enable row level security;

alter table public.visitor_photos enable row level security;



-- Visitor entries: society members read; guards create within tenant

create policy visitor_entries_select_society

on public.visitor_entries

for select

to authenticated

using (society_id = public.auth_society_id());



create policy visitor_entries_insert_guard

on public.visitor_entries

for insert

to authenticated

with check (

  public.auth_app_role() = 'guard'

  and society_id = public.auth_society_id()

  and created_by_app_user_id = public.auth_app_user_id()

);



-- Visitor photos: society members read; guards create within tenant

create policy visitor_photos_select_society

on public.visitor_photos

for select

to authenticated

using (society_id = public.auth_society_id());



create policy visitor_photos_insert_guard

on public.visitor_photos

for insert

to authenticated

with check (

  public.auth_app_role() = 'guard'

  and society_id = public.auth_society_id()

  and created_by_app_user_id = public.auth_app_user_id()

  and exists (

    select 1

    from public.visitor_entries ve

    where ve.id = visitor_photos.visitor_entry_id

      and ve.society_id = public.auth_society_id()

  )

);



-- Service role bypasses RLS for Edge Functions and operator tooling.



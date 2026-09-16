-- M02: Resident / flat foundation — flats, residents, resident_flats, RLS



-- ---------------------------------------------------------------------------

-- Flats

-- ---------------------------------------------------------------------------



create table public.flats (

  id uuid primary key default gen_random_uuid(),

  society_id uuid not null references public.societies (id) on delete restrict,

  flat_number text not null,

  status public.account_status not null default 'active',

  created_at timestamptz not null default timezone('utc', now()),

  updated_at timestamptz not null default timezone('utc', now()),

  constraint flats_flat_number_format check (char_length(trim(flat_number)) > 0),

  constraint flats_society_flat_number_unique unique (society_id, flat_number)

);



create index flats_society_id_idx on public.flats (society_id);

create index flats_society_id_status_idx on public.flats (society_id, status);

create index flats_society_id_flat_number_lower_idx

  on public.flats (society_id, lower(trim(flat_number)));



-- ---------------------------------------------------------------------------

-- Residents

-- ---------------------------------------------------------------------------



create table public.residents (

  id uuid primary key default gen_random_uuid(),

  society_id uuid not null references public.societies (id) on delete restrict,

  name text not null,

  mobile text,

  email text,

  resident_type text,

  status public.account_status not null default 'active',

  created_at timestamptz not null default timezone('utc', now()),

  updated_at timestamptz not null default timezone('utc', now()),

  constraint residents_name_format check (char_length(trim(name)) > 0)

);



create index residents_society_id_idx on public.residents (society_id);

create index residents_society_id_status_idx on public.residents (society_id, status);

create index residents_society_id_name_lower_idx

  on public.residents (society_id, lower(trim(name)));

create index residents_society_id_mobile_idx on public.residents (society_id, mobile);



-- ---------------------------------------------------------------------------

-- Resident ↔ flat associations (many-to-many)

-- ---------------------------------------------------------------------------



create table public.resident_flats (

  id uuid primary key default gen_random_uuid(),

  society_id uuid not null references public.societies (id) on delete restrict,

  resident_id uuid not null references public.residents (id) on delete cascade,

  flat_id uuid not null references public.flats (id) on delete cascade,

  created_at timestamptz not null default timezone('utc', now()),

  constraint resident_flats_resident_flat_unique unique (resident_id, flat_id)

);



create index resident_flats_society_id_idx on public.resident_flats (society_id);

create index resident_flats_flat_id_idx on public.resident_flats (flat_id);

create index resident_flats_resident_id_idx on public.resident_flats (resident_id);



-- ---------------------------------------------------------------------------

-- Updated-at triggers

-- ---------------------------------------------------------------------------



create trigger flats_set_updated_at

before update on public.flats

for each row execute function public.set_updated_at();



create trigger residents_set_updated_at

before update on public.residents

for each row execute function public.set_updated_at();



-- ---------------------------------------------------------------------------

-- Same-society integrity for resident_flats

-- ---------------------------------------------------------------------------



create or replace function public.enforce_resident_flats_same_society()

returns trigger

language plpgsql

as $$

declare

  v_resident_society_id uuid;

  v_flat_society_id uuid;

begin

  select society_id into v_resident_society_id

  from public.residents

  where id = new.resident_id;



  select society_id into v_flat_society_id

  from public.flats

  where id = new.flat_id;



  if v_resident_society_id is null or v_flat_society_id is null then

    raise exception 'resident_flats references must exist';

  end if;



  if v_resident_society_id <> v_flat_society_id then

    raise exception 'resident and flat must belong to the same society';

  end if;



  if new.society_id <> v_resident_society_id then

    raise exception 'resident_flats.society_id must match resident and flat society';

  end if;



  return new;

end;

$$;



create trigger resident_flats_enforce_same_society

before insert or update on public.resident_flats

for each row execute function public.enforce_resident_flats_same_society();



-- ---------------------------------------------------------------------------

-- Row Level Security

-- ---------------------------------------------------------------------------



alter table public.flats enable row level security;

alter table public.residents enable row level security;

alter table public.resident_flats enable row level security;



-- Flats: society members read; society admins manage within tenant

create policy flats_select_society

on public.flats

for select

to authenticated

using (society_id = public.auth_society_id());



create policy flats_insert_society_admin

on public.flats

for insert

to authenticated

with check (

  public.auth_app_role() = 'society_admin'

  and society_id = public.auth_society_id()

);



create policy flats_update_society_admin

on public.flats

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



create policy flats_delete_society_admin

on public.flats

for delete

to authenticated

using (

  public.auth_app_role() = 'society_admin'

  and society_id = public.auth_society_id()

);



-- Residents: society members read; society admins manage within tenant

create policy residents_select_society

on public.residents

for select

to authenticated

using (society_id = public.auth_society_id());



create policy residents_insert_society_admin

on public.residents

for insert

to authenticated

with check (

  public.auth_app_role() = 'society_admin'

  and society_id = public.auth_society_id()

);



create policy residents_update_society_admin

on public.residents

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



create policy residents_delete_society_admin

on public.residents

for delete

to authenticated

using (

  public.auth_app_role() = 'society_admin'

  and society_id = public.auth_society_id()

);



-- Resident flats: society members read; society admins manage within tenant

create policy resident_flats_select_society

on public.resident_flats

for select

to authenticated

using (society_id = public.auth_society_id());



create policy resident_flats_insert_society_admin

on public.resident_flats

for insert

to authenticated

with check (

  public.auth_app_role() = 'society_admin'

  and society_id = public.auth_society_id()

);



create policy resident_flats_update_society_admin

on public.resident_flats

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



create policy resident_flats_delete_society_admin

on public.resident_flats

for delete

to authenticated

using (

  public.auth_app_role() = 'society_admin'

  and society_id = public.auth_society_id()

);



-- Service role bypasses RLS for Edge Functions and operator tooling.



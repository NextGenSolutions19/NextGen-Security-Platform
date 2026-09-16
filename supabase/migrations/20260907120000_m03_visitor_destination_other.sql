-- M03: Mandatory destination with optional unlisted "Other" text.
-- Additive. Does not rewrite existing visitor_entries rows.
-- Historical rows already have flat_id and remain valid under the new XOR checks.
-- Does not change RLS, auth, JWT, or tenant resolution.

alter table public.visitor_entries
  add column destination_text text;

comment on column public.visitor_entries.destination_text is
  'Unlisted destination for this visit when no Resident Master flat is selected. Null when flat_id is set.';

alter table public.visitor_entries
  alter column flat_id drop not null;

alter table public.visitor_entries
  add constraint visitor_entries_destination_text_format check (
    destination_text is null
    or (
      char_length(trim(destination_text)) > 0
      and char_length(trim(destination_text)) <= 80
    )
  );

alter table public.visitor_entries
  add constraint visitor_entries_destination_present check (
    (
      flat_id is not null
      and destination_text is null
    )
    or (
      flat_id is null
      and destination_text is not null
    )
  );

alter table public.visitor_entries
  add constraint visitor_entries_other_has_no_resident check (
    flat_id is not null
    or resident_id is null
  );

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

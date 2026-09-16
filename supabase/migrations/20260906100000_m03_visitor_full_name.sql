-- M03 Batch 3 / C1-F1: Visitor Full Name on visit records.
-- Additive only. Does not rewrite existing visitor_entries rows.
-- Does not change RLS, auth, or tenant resolution.
-- Historical rows remain NULL until a new registration writes a name.

alter table public.visitor_entries
  add column visitor_name text;

comment on column public.visitor_entries.visitor_name is
  'Primary visitor / group-leader full name for this visit. Null for historical rows created before this column existed.';

alter table public.visitor_entries
  add constraint visitor_entries_visitor_name_format check (
    visitor_name is null
    or (
      char_length(trim(visitor_name)) > 0
      and char_length(trim(visitor_name)) <= 80
    )
  );

-- M02 Group Visitor V1 — additive entry type and visitor count
-- Existing rows remain single-visitor entries (defaults applied below).
-- Future member-level records can reference visitor_entries.id without
-- replacing this V1 group check-in / whole-group checkout model.

create type public.visitor_entry_type as enum ('single', 'group');

alter table public.visitor_entries
  add column entry_type public.visitor_entry_type not null default 'single',
  add column visitor_count integer not null default 1;

comment on column public.visitor_entries.entry_type is
  'single = one visitor; group = one destination group registered together.';

comment on column public.visitor_entries.visitor_count is
  'People covered by this entry. Single entries must be 1. Group entries 2–50 in V1.';

update public.visitor_entries
set
  entry_type = 'single',
  visitor_count = 1
where entry_type is null
   or visitor_count is null
   or (entry_type = 'single' and visitor_count <> 1);

alter table public.visitor_entries
  add constraint visitor_entries_visitor_count_range check (
    visitor_count >= 1
    and visitor_count <= 50
  );

alter table public.visitor_entries
  add constraint visitor_entries_entry_type_count_consistency check (
    (entry_type = 'single' and visitor_count = 1)
    or (entry_type = 'group' and visitor_count >= 2)
  );

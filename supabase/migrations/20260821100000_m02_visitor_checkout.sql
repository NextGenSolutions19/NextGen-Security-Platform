-- M02 Guard Visitor Checkout

alter table public.visitor_entries
  add column check_out_at timestamptz;

alter table public.visitor_entries
  add constraint visitor_entries_check_out_at_consistency check (
    (status = 'checked_in' and check_out_at is null)
    or (status = 'checked_out' and check_out_at is not null)
  );

create index visitor_entries_society_status_check_out_idx
  on public.visitor_entries (society_id, status, check_out_at desc);

grant update on public.visitor_entries to service_role;

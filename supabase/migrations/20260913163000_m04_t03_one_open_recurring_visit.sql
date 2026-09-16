-- M04-T03: at most one open recurring visit per pass.
-- Additive only. Does not rewrite visitor_entries, photos, RLS, or grants.
-- Ordinary visitor rows (recurring_pass_id IS NULL) are unaffected.

create unique index if not exists visitor_entries_one_open_recurring_visit
  on public.visitor_entries (society_id, recurring_pass_id)
  where recurring_pass_id is not null
    and status = 'checked_in';

comment on index public.visitor_entries_one_open_recurring_visit is
  'Prevents two concurrent IN visits for the same recurring pass. Checkout clears the unique slot so the pass remains reusable.';

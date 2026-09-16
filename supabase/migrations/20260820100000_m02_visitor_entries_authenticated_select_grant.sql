-- M02 Guard Visitor List: authenticated SELECT on visitor_entries
-- Society isolation remains enforced by visitor_entries_select_society
-- (society_id = auth_society_id()).

grant select on public.visitor_entries to authenticated;

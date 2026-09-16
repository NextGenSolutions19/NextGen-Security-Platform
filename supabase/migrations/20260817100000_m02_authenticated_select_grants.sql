-- M02-03: Minimum PostgreSQL table grants for authenticated (mobile New Visitor form)
-- RLS policies are unchanged; these grants allow PostgREST SELECT for guard JWT clients.
-- Society isolation remains enforced by flats_select_society, residents_select_society,
-- and resident_flats_select_society (society_id = auth_society_id()).

grant select on public.flats to authenticated;
grant select on public.residents to authenticated;
grant select on public.resident_flats to authenticated;

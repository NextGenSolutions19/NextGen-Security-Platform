-- M02: Minimum PostgreSQL table grants for service_role (register-visitor Edge Function)
-- RLS policies are unchanged; these grants only restore PostgREST access for the
-- server-side service_role client used by trusted Edge Functions.

grant select on public.flats to service_role;
grant select on public.residents to service_role;
grant select on public.resident_flats to service_role;
grant insert, select on public.visitor_entries to service_role;

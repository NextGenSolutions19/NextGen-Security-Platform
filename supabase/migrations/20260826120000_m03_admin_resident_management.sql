-- M03-T01: Admin Resident Management support
-- Additive only. Existing RLS policies are unchanged.
-- Writes are performed by the admin-resident Edge Function (service_role).
-- Authenticated clients keep SELECT-only table grants.

-- ---------------------------------------------------------------------------
-- Optional wing / building on flats (flat-level attribute, not a new table)
-- ---------------------------------------------------------------------------

alter table public.flats
  add column if not exists wing_building text;

comment on column public.flats.wing_building is
  'Optional wing or building label for the flat. Null for existing rows.';

-- ---------------------------------------------------------------------------
-- Service-role grants for trusted Admin Edge Function writes
-- Does not grant INSERT/UPDATE/DELETE to authenticated (Guards remain read-only).
-- ---------------------------------------------------------------------------

grant insert, update on public.flats to service_role;
grant insert, update on public.residents to service_role;
grant insert, update on public.resident_flats to service_role;

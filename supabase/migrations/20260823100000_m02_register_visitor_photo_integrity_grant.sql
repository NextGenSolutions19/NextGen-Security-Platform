-- M02: Allow service_role to delete visitor_entries for register-visitor
-- compensation when visitor_photos metadata insert fails after entry insert.
-- Does not change RLS for authenticated clients (no DELETE policy for guards).

grant delete on public.visitor_entries to service_role;

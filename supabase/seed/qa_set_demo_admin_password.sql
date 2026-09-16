-- DEVELOPMENT / QA ONLY — DO NOT apply without explicit approval.
-- Sets the existing DEMO society_admin login ADMIN to temporary password ADMIN123.
-- Password is hashed with pgcrypto crypt/bf (same mechanism as seed). Plaintext is not stored.
-- Keeps must_change_password = true so /change-password remains required.
-- Does NOT create ADMIN01/ADMIN1 or any other account.

update public.app_users
set
  password_hash = crypt('ADMIN123', gen_salt('bf')),
  must_change_password = true,
  status = 'active',
  failed_login_attempts = 0,
  locked_until = null
where login_id = 'ADMIN'
  and role = 'society_admin'
  and society_id = (
    select id
    from public.societies
    where society_code = 'DEMO'
    limit 1
  );

# M01 — Foundation + Authentication

> Module gate: Build → Test → Record → Fix → Retest → Approve → Move Forward

## Scope

- PostgreSQL schema: `societies`, `app_users`, `auth_sessions`, `audit_logs`
- RLS base policies and JWT claim helpers
- Edge Functions: `validate-society-code`, `auth-login`, `auth-logout`, `auth-refresh`, `change-credentials`
- Development seed (`supabase/seed/dev.sql`)
- Mobile auth hardening: session refresh, change-password flow, structured errors
- RLS test script (`supabase/tests/rls/m01_rls_tests.sql`)

## Backend setup (local Supabase)

```bash
# From repository root (requires Supabase CLI)
supabase start
supabase db reset
supabase functions serve
```

Apply seed is included via `supabase db reset` when configured in `config.toml` `[db.seed]` or run manually:

```bash
psql ... -f supabase/seed/dev.sql
```

Set mobile env in `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321   # Android emulator → host machine
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
EXPO_PUBLIC_ENABLE_DEV_MOCK_AUTH=false
```

## Functional tests

### Society code

- [ ] Valid society code `DEMO` proceeds to login
- [ ] Invalid society code shows error
- [ ] Empty society code shows validation error

### Login

- [ ] Guard `GUARD01` / `guard123` on `DEMO` → Guard dashboard
- [ ] Admin `ADMIN` / `ADMIN123` on `DEMO` → forced credential change screen
- [ ] Wrong password shows invalid credentials (no silent success)
- [ ] Empty login fields show validation errors
- [ ] Password field is masked
- [ ] Deactivated account rejected (when tested with disabled user)

### Credential change (bootstrap admin)

- [ ] `ADMIN`/`ADMIN123` must change password and login ID before dashboard
- [ ] New password minimum length enforced (8+)
- [ ] After change, user reaches Admin dashboard

### Session

- [ ] App restart preserves session (when credentials already updated)
- [ ] Sign out returns to login (society code retained)
- [ ] Change society code clears session context

### RLS (database)

- [ ] Society A user cannot read Society B records
- [ ] Society B user cannot read Society A records
- [ ] Cross-tenant access denied at database level

## Invalid input / edge cases

- [ ] 5 failed login attempts trigger temporary lockout
- [ ] Locked account shows clear error message
- [ ] Duplicate login ID on credential change rejected

## Permission / navigation

- [ ] Guard cannot open Admin routes
- [ ] Admin cannot open Guard-only routes
- [ ] Unauthenticated user cannot open dashboards

## Regression

- [ ] Splash → Society Code → Login flow still works after M01 changes
- [ ] Branding unchanged (name, logo, assets)

## Approval record

Create `docs/testing/test-records/YYYY-MM-DD-M01-foundation-auth.md` after testing.

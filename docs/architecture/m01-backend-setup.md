# M01 — Supabase Backend Setup

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- Docker running (for local Supabase stack)

## Local development

```bash
# From repository root
supabase init   # only if not already linked
supabase start
supabase db reset
supabase functions serve
```

After `supabase start`, copy the **API URL** and **anon key** into `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=<API URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_ENABLE_DEV_MOCK_AUTH=false
```

For Android emulator, use `http://10.0.2.2:54321` instead of `http://127.0.0.1:54321`.

## Development seed credentials

**Development only — not for production**

| Society Code | Login ID | Password | Role | Notes |
|--------------|----------|----------|------|-------|
| DEMO | ADMIN | ADMIN123 | Society Admin | Must change credentials on first login |
| DEMO | GUARD01 | guard123 | Guard | Ready for dashboard |
| DEMO2 | ADMIN2 | admin123 | Society Admin | Second society (RLS tests) |
| DEMO2 | GUARD02 | guard123 | Guard | Second society (RLS tests) |

## Edge Functions

| Function | Purpose |
|----------|---------|
| `validate-society-code` | Validate society code before login |
| `auth-login` | Login ID + password authentication |
| `auth-logout` | Revoke refresh session |
| `auth-refresh` | Refresh access token |
| `change-credentials` | Password / login ID change |

## RLS tests

```bash
# After db reset + seed
psql "<local db url>" -f supabase/tests/rls/m01_rls_tests.sql
```

## Deploy (when ready)

```bash
supabase db push
supabase functions deploy validate-society-code
supabase functions deploy auth-login
supabase functions deploy auth-logout
supabase functions deploy auth-refresh
supabase functions deploy change-credentials
```

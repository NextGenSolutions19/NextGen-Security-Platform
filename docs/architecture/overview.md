# Architecture Overview

> **Status:** Approved architecture (M00)  
> Full verification recorded in project discussion. This document is the in-repo architecture reference.

## System summary

```
┌─────────────────────────────────────────────────────────┐
│              Single Expo App (apps/mobile)              │
│   Splash → Society Code → Login → Guard | Admin UI    │
│   Guard: SQLite + offline sync  |  Admin: online-only  │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │       Supabase          │
              │  PostgreSQL + RLS       │
              │  Edge Functions         │
              │  Storage (photos)       │
              │  Push / Realtime        │
              └────────────▲────────────┘
                           │
              ┌────────────┴────────────┐
              │  platform/scripts (CLI) │
              │  Operator onboarding    │
              └─────────────────────────┘
```

## Repository layout

| Path | Purpose |
|------|---------|
| `apps/mobile/` | Single client app — Guard + Admin route groups |
| `packages/shared/` | Types, enums, event contracts |
| `packages/validation/` | Zod schemas (test-driven rules) |
| `packages/eslint-config/` | Shared lint configuration |
| `supabase/` | Migrations, Edge Functions, RLS tests (M01+) |
| `platform/` | Internal operator tooling (not in society app) |
| `docs/` | Requirements, flows, testing, ADRs |

## Roles

| Role | In-app login? |
|------|:-------------:|
| Guard | Yes |
| Society Admin | Yes |
| Platform Super Admin | No (operator CLI only) |
| Resident | No (data entity) |

## Multi-tenancy

- One shared PostgreSQL database
- Every society-owned record scoped by `society_id`
- RLS enforced at database level — not UI-only
- Mandatory RLS tests: Society A/B isolation, cross-society denial

## Offline and sync

- **Guard:** SQLite for approved offline workflows (M13)
- **Admin:** Online-only in V1
- **Sync:** Server-authoritative, unique event IDs, idempotent processing (M13)

## Canonical alignment

Implementation must align exactly with:

- [`docs/flows/FINAL-FLOW-TABLE.md`](../flows/FINAL-FLOW-TABLE.md)
- [`docs/testing/TESTING-RULE.md`](../testing/TESTING-RULE.md)
- [`docs/requirements/v1-spec.md`](../requirements/v1-spec.md)

## Module order

M00 (scaffold) → M01 (foundation + auth) → … → M18 (platform onboarding)

Each module requires explicit approval before the next begins.

## Deferred decisions

Decisions belonging to later modules remain **deferred** until that module. Do not invent final values during scaffold or unrelated modules.

Examples:

| Decision | Module |
|----------|--------|
| Visitor photo compression defaults | Visitor/photo module |
| Exact ID type list | Security policy / visitor module |
| QR model (one-time vs frequent vs both) | QR module |
| Emergency content format | Emergency module |
| Final Excel columns | Resident/import module |
| Failed-login lockout thresholds | Authentication hardening |

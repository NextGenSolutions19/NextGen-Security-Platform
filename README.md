# NextGen Security Platform

Society security-management application for **Security Guards** and **Society Admins**.

## Architecture (V1)

- **One Expo mobile application** — Guard and Admin are role-gated experiences inside the same app
- **Backend:** Supabase (PostgreSQL, Edge Functions, Storage, Push)
- **Offline:** SQLite for Guard critical workflows; Admin is online-only in V1
- **Monorepo:** pnpm workspaces

## Repository structure

```
apps/mobile/          Single Expo app (Guard + Admin)
packages/shared/      Shared types and contracts
packages/validation/  Zod validation schemas
packages/eslint-config/ Shared ESLint configuration
supabase/             Database, Edge Functions, RLS tests (from M01 onward)
platform/             Internal operator tooling (not in society app)
docs/                 Requirements, architecture, flows, testing
```

## Canonical project documents

The following documents are **canonical requirements** and must not be silently modified during implementation:

| Document | Location |
|----------|----------|
| V1 Specification | `docs/requirements/v1-spec.md` |
| Final Flow Table | `docs/flows/FINAL-FLOW-TABLE.md` |
| Testing Rule | `docs/testing/TESTING-RULE.md` |

## Development process

Modules follow the mandatory gate defined in `docs/testing/TESTING-RULE.md`:

**Build → Test → Record → Fix → Retest → Approve → Move Forward**

## Prerequisites

- Node.js 20 LTS (see `.nvmrc`)
- pnpm 9+
- Expo CLI / EAS (for mobile development)

## Getting started (after M01)

```bash
pnpm install
pnpm mobile
```

## Current phase

**M00 — Repository scaffold** (structure and configuration only; no business logic)

M01 (foundation + auth) begins only after explicit approval of M00.

## License

Proprietary — NextGen Web Solutions

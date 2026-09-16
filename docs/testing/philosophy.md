# Testing Philosophy

> This document supports the canonical **[Testing Rule](./TESTING-RULE.md)**.  
> If any conflict exists, **TESTING-RULE.md takes precedence**.

## Core principle

Testing is a **core requirement**, not an afterthought.

We build in controlled modules. Each module passes through the full gate before the next begins.

## Gate (canonical)

**Build → Test → Record → Fix → Retest → Approve → Move Forward**

See [`TESTING-RULE.md`](./TESTING-RULE.md) for full mandatory requirements.

## Where evidence lives

| Artifact | Location |
|----------|----------|
| Module checklists | `docs/testing/module-checklists/` |
| Dated test records | `docs/testing/test-records/` |
| RLS tests | `supabase/tests/rls/` (from M01) |
| Unit tests | Per-package `__tests__/` (from respective modules) |

## M00 status

M00 is scaffold-only. No functional test implementations in M00.

Structural checks (install, lint, typecheck) validate repository integrity only.

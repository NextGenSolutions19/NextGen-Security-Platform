# NextGen Security Platform — V1 Requirements Snapshot

> **Status:** Canonical requirements reference (M00 snapshot)  
> **Do not silently modify** requirements documented here or in linked canonical documents.

## Canonical documents

| Document | Path | Authority |
|----------|------|-----------|
| **Final Flow Table** | [`docs/flows/FINAL-FLOW-TABLE.md`](../flows/FINAL-FLOW-TABLE.md) | Defines approved Guard and Admin flows — must align **exactly** during implementation |
| **Testing Rule** | [`docs/testing/TESTING-RULE.md`](../testing/TESTING-RULE.md) | Defines mandatory development/testing gate |
| **Architecture** | [`docs/architecture/overview.md`](../architecture/overview.md) | Approved system architecture |

If implementation conflicts with any canonical document, **stop and report the conflict** — do not silently change requirements.

---

## Product

NextGen Security Platform is a society security-management application for:

- Security Guards
- Society Admins
- Residents (data entity — not a login role)
- Flats, Visitors, Group Visitors, Frequent Visitors
- QR-based visitor handling, Emergency alerts, Notifications
- Visitor history, Reports, Offline Guard operation

Multi-society, production-oriented.

---

## Application model (V1)

- **One Expo mobile application** for Guard and Society Admin
- **Two society login roles:** Guard, Society Admin
- **No Supervisor role**
- **Platform Super Admin:** internal operator tooling only (`platform/`) — not an in-app login role
- Login flow: **Splash → Society Code → Login → Role-based Dashboard**

---

## Technology (V1)

| Layer | Choice |
|-------|--------|
| Mobile | React Native + TypeScript + Expo (SDK 52) |
| Local DB | SQLite (Guard offline — from M13) |
| Backend | Supabase + PostgreSQL |
| Push | Expo Push Notifications |
| Package manager | pnpm + workspaces |
| Source control | Git + GitHub |

---

## Key V1 rules (summary)

- Globally unique login IDs
- Multi-tenant isolation via `society_id` + RLS (database-enforced)
- Admin online-only; Guard offline for approved workflows
- Server-authoritative sync with unique event IDs (from M13)
- Society-configurable security policies (not global hard-coded rules)
- Visitor history retention: **90-day default**, configurable per society
- Frequent Visitor: Admin direct; Guard requires Admin OTP authorization
- Audit logging for important actions
- Deferred decisions (photo compression, ID types, QR model, Excel columns, etc.) are resolved in their respective modules — see module checklists

---

## Version boundaries

**V1 includes:** Guard, Admin, Residents, Flats, Excel Import, Visitor Registration, Group Visitors, Visitor History, Frequent Visitors (core), QR, Emergency, Notifications, Reports, Security Policies, Offline Guard, Supabase, SQLite, Multi-society isolation.

**V2 excludes (for now):** Advanced Frequent Visitor functionality and other future enhancements.

---

## Development process

See [`docs/testing/TESTING-RULE.md`](../testing/TESTING-RULE.md).

**Build → Test → Record → Fix → Retest → Approve → Move Forward**

A module is **not complete** because it compiles.

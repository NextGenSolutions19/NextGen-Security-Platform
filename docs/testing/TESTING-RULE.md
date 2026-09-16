# Testing Rule

> **CANONICAL DOCUMENT**  
> This document defines the **mandatory development and testing gate** for the NextGen Security Platform.  
> **Do not silently modify** these requirements during implementation.

---

## Mandatory gate

Every module must follow this sequence:

```
Build → Test → Record → Fix → Retest → Approve → Move Forward
```

A module is **NOT complete** merely because it compiles.

No module may begin until the **previous module has been tested, recorded, approved, and committed**.

---

## Required test coverage (per module)

Each module must eventually cover **all applicable** categories below:

| Category | Description |
|----------|-------------|
| **Functional testing** | Happy-path behaviour matches requirements and Final Flow Table |
| **Invalid-input testing** | Empty fields, wrong formats, boundary violations |
| **Edge-case testing** | Unusual but valid scenarios, race conditions where applicable |
| **Database testing** | Schema, constraints, data integrity |
| **Permission testing** | Role-based access; unauthorized actions denied |
| **Navigation testing** | All screens, tabs, buttons, paths per Final Flow Table |
| **Error-handling testing** | Failures surfaced clearly; no silent failures |
| **Offline behaviour** | Where applicable (Guard modules): offline create, restart persistence, sync |
| **Regression testing** | Re-run applicable tests after every fix |

---

## RLS and security testing (mandatory for data-access modules)

- Society A isolation
- Society B isolation
- Unauthorized cross-society access denied
- RLS enforcement verified at database level

---

## Documentation requirements

For each module:

1. **Checklist:** `docs/testing/module-checklists/Mxx-<name>.md`
2. **Test record:** `docs/testing/test-records/YYYY-MM-DD-Mxx-<name>.md`
3. **Explicit approval** from project owner before proceeding

---

## Alignment with Final Flow Table

Functional and navigation tests must align with the approved flows in:

[`docs/flows/FINAL-FLOW-TABLE.md`](../flows/FINAL-FLOW-TABLE.md)

If a test reveals a conflict between implementation and the Final Flow Table, **report the conflict** — do not silently change either.

---

## E2E testing

E2E framework (Maestro, Detox, or other) is **not yet decided**.

**Manual testing remains mandatory** regardless of E2E framework choice.

---

## Module completion criteria

A module is complete only when:

1. Implementation matches approved requirements and flows
2. All applicable test categories have been executed
3. Bugs found are recorded
4. Bugs are fixed and retested
5. Test record is written and dated
6. Project owner has **explicitly approved**
7. Changes are committed to Git

Only then may development move to the next module.

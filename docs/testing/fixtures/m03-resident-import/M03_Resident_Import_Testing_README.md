# M03 Resident Import — Internal Testing Workbook

Internal development/QA only. This is **not** the Society Excel Template.

The society-facing template will be created after the entire M03 module is complete.

## Location

`docs/testing/fixtures/m03-resident-import/M03_Resident_Import_Testing.xlsx`

## Sheet

| Sheet | Visible | Purpose |
|---|---|---|
| **Resident Import Test Data** | Yes | All QA rows. Select this sheet. |
| `_parser_ignore` | Hidden | Parser must list it and must **not** auto-select it. |

Header row is frozen. `Move-in Date` cells are Excel dates. Mobiles, names, and messy building/flat values are stored as text so whitespace is preserved.

## Purpose

Exercise the future Admin Excel Import flow:

1. File pick (web + Android)
2. Parse (faithful read, original headers)
3. Column mapping (society-specific names)
4. Validation / classification
5. Preview — **no silent merge, update, or overwrite**

Do **not** import this file into the hosted DEMO/DEMO2 database as a whole. Several rows are invalid, conflicting, or unsafe until building-aware flat uniqueness is active.

## Columns

These headers resemble a messy society file. They are **not** a mandatory production format.

| Column | Role in later mapping |
|---|---|
| QA Case | Internal label only. Do not map as a resident field. |
| Building | Maps toward `wing_building` (with Wing, if used). |
| Wing | Extra society column; currently unused in rows. |
| Flat No | Maps toward `flat_number`. |
| Resident Name | Maps toward `residents.name`. |
| Resident Type | Maps toward `residents.resident_type`. Allowed later: Owner, Tenant, Family Member, Other. |
| Mobile 1 | Primary / first contact. |
| Mobile 2 | Additional contact. |
| Parking Slot | Custom field candidate. |
| Intercom | Custom field candidate. |
| Move-in Date | Custom field candidate (date). |
| Vehicle Sticker | Custom field candidate. |
| Emergency Contact | Custom field candidate (phone). |
| Notes | Custom field candidate. |

The importer must still accept arbitrary society headers through mapping. Do not hard-code these names.

## Excel row map

Header is row 1. Data starts at row 2.

| Excel row | QA Case | Expected future classification | Notes |
|---|---|---|---|
| 2 | TEST-A | `VALID_NEW` | Normal owner, Building A, flat 101, one valid mobile. |
| 3 | TEST-B1 | `VALID_NEW` | Family 102 owner. |
| 4 | TEST-B2 | `VALID_NEW` | Family 102. Same flat + different name + same mobile as B1 (**TEST-I**). Must not merge. |
| 5 | TEST-B3 | `VALID_NEW` | Family 102, distinct mobile. |
| 6 | TEST-C | `VALID_NEW` | One person, Mobile 1 + Mobile 2 both valid. |
| 7 | TEST-D1 | `VALID_NEW` later | Building **A / 201**. **Do not import yet.** |
| 8 | TEST-D2 | `VALID_NEW` later | Building **B / 201**. **Do not import yet.** Current `UNIQUE (society_id, flat_number)` cannot store both. |
| 9 | TEST-E1 | `VALID_NEW` | Building `A1`. |
| 10 | TEST-E2 | `VALID_NEW` | Building `Tower 1`. |
| 11 | TEST-E3 | `VALID_NEW` | Building `Tower A`. |
| 12 | TEST-E4 | `VALID_NEW` | Building `Emerald`. Resident Type `Other`. |
| 13 | TEST-G | `INTRA_FILE_DUPLICATE` | Exact duplicate of **TEST-A** (row 2): same building, flat, name, mobile. |
| 14 | TEST-H | `POSSIBLE_CONFLICT` | Same flat + same name as TEST-A, different mobile. |
| 15 | TEST-J | `POSSIBLE_CONFLICT` | Same mobile as TEST-A, different flat (A / 105). |
| 16 | TEST-K1 | `INVALID` | Mobile too short (`12345`). |
| 17 | TEST-K2 | `INVALID` | Mobile starts with 5 (`5123456789`). |
| 18 | TEST-L1 | `INVALID` | Missing resident name. |
| 19 | TEST-L2 | `INVALID` | Missing flat number. |
| 20 | TEST-M | `INVALID` | Resident Type `Chairman` unless mapping/config allows it. |
| 21 | TEST-N1 | `VALID_NEW` | Raw values `" Tower A "`, `" 701 "`, `" Tara Menon "`. Do not clean the file. |
| 22 | TEST-N2 | `VALID_NEW` | Building `tower a`, flat `702`. Compare-key equals TEST-N1 building; different flat. |
| 23 | TEST-O | `VALID_NEW` | Blank Building and Wing. Canonical no-building key. |
| 24 | TEST-P1 | `VALID_NEW` | Family 901 owner + additional mobile. |
| 25 | TEST-P2 | `VALID_NEW` | Family 901. Shares Mobile 1 with P1. Do not merge. |
| 26 | TEST-P3 | `VALID_NEW` | Family 901. Distinct mobile, shared with P4. |
| 27 | TEST-P4 | `VALID_NEW` | Family 901. Shares mobile with P3. |

`EXACT_DUPLICATE` applies only after a row already exists in the database. In a clean society this file should produce `INTRA_FILE_DUPLICATE` for TEST-G, not `EXACT_DUPLICATE`.

There is no `UPDATED` / `MERGED` / `OVERWRITTEN` outcome.

## Scenario coverage

| ID | Scenario | Rows |
|---|---|---|
| A | Normal valid resident | TEST-A |
| B | Multiple family members, same flat | TEST-B1, B2, B3 |
| C | Multiple mobiles, one person | TEST-C |
| D | Same flat number, different buildings | TEST-D1, D2 — **do not import until uniqueness is building-aware** |
| E | Flexible building labels | TEST-E1–E4, plus A/B/C elsewhere |
| F | Custom columns populated | Parking, Intercom, Move-in Date, Vehicle Sticker, Emergency Contact, Notes |
| G | Exact duplicate in-file | TEST-G duplicates TEST-A |
| H | Same flat + same name + different mobile | TEST-H |
| I | Same flat + different name + same mobile | TEST-B2 vs TEST-B1; TEST-P2 vs TEST-P1 |
| J | Same mobile + different flat | TEST-J vs TEST-A |
| K | Invalid mobile | TEST-K1, TEST-K2 |
| L | Missing required data | TEST-L1, TEST-L2 |
| M | Invalid resident type | TEST-M (`Chairman`) |
| N | Whitespace / case | TEST-N1, TEST-N2 (uncleaned) |
| O | Blank building | TEST-O |
| P | Family 3+; shared mobile; additional mobile | TEST-P1–P4 |

## Shared mobiles

Rows that share a mobile are intentional:

- TEST-B1 and TEST-B2: `9876500102`
- TEST-A, TEST-G, and TEST-J: `9876500001` (G is duplicate; J is a conflict)
- TEST-P1 and TEST-P2: `9876500901`
- TEST-P3 and TEST-P4: `9876500902`

Shared family numbers must **not** auto-merge residents.

## Current database constraint

Hosted uniqueness is still:

`UNIQUE (society_id, flat_number)`

Building-aware uniqueness is **not** active. Importing both TEST-D1 and TEST-D2 would fail or collide. Keep those rows for parser/mapping/preview tests only until `admin-resident` lookup is building-aware and the unique swap ships in the same release.

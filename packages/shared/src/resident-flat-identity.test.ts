import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LIVE_FLAT_UNIQUENESS_USES_SOCIETY_AND_FLAT_NUMBER,
  buildFlatIdentityKey,
  combineResidentWingBuilding,
  formatResidentFlatLabel,
  occupiesLiveFlatNumberSlot,
  residentFlatIdentityKeys,
  resolveBuildingAwareSocietyFlat,
  samePhysicalFlat,
} from "./resident-import-foundation.ts";
import { prepareResidentImportConfirm } from "./resident-import-confirm-ui.ts";
import {
  classifyResidentImportAgainstDatabase,
  proposedRowsForDatabaseVerification,
} from "./resident-import-db-verify.ts";
import {
  classifyResidentImportDecisionGate,
  createResidentImportDecisionSnapshot,
  setResidentImportRowDecision,
} from "./resident-import-decisions.ts";
import {
  applyResidentImportColumnTarget,
  createResidentImportMappingSnapshot,
} from "./resident-import-mapping.ts";
import type { WorkbookParseResult } from "./resident-import-parse.ts";
import { validateResidentImportWorkbook } from "./resident-import-validate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function workbookFromRows(
  headers: string[],
  rows: string[][],
): WorkbookParseResult {
  return {
    fileName: "building-aware.xlsx",
    fileBytes: 1,
    sheetNames: ["Sheet1"],
    hiddenSheetNames: [],
    visibleSheetNames: ["Sheet1"],
    selectedSheet: "Sheet1",
    columns: headers.map((header, index) => ({ index, header })),
    headers,
    duplicateHeaders: [],
    rows: rows.map((displayValues, index) => ({
      rowNumber: index + 2,
      displayValues,
      cells: displayValues.map((value, columnIndex) => ({
        address: `${columnIndex}:${index}`,
        kind: "string" as const,
        rawValue: value,
        displayValue: value,
      })),
    })),
    warnings: [],
    truncated: false,
  };
}

function mappingFor(workbook: WorkbookParseResult) {
  let mapping = createResidentImportMappingSnapshot(workbook);
  const targets = ["BUILDING", "FLAT_NUMBER", "RESIDENT_NAME", "PRIMARY_MOBILE"] as const;
  for (const [index, target] of targets.entries()) {
    const next = applyResidentImportColumnTarget(mapping, index, target);
    if (next.ok) {
      mapping = next.snapshot;
    }
  }
  return mapping;
}

test("A. Building A / 201 and Building B / 201 produce different flat identity keys", () => {
  const a201 = residentFlatIdentityKeys({ wingBuilding: "A", flatNumber: "201" });
  const b201 = residentFlatIdentityKeys({ wingBuilding: "B", flatNumber: "201" });
  assert.notDeepEqual(a201, b201);
  assert.equal(samePhysicalFlat(
    { wingBuilding: "A", flatNumber: "201" },
    { wingBuilding: "B", flatNumber: "201" },
  ), false);
  assert.notEqual(
    buildFlatIdentityKey("society-a", "A", "201"),
    buildFlatIdentityKey("society-a", "B", "201"),
  );
});

test("B. A / 201 and a / ' 201 ' compare as the same identity", () => {
  assert.equal(
    samePhysicalFlat(
      { wingBuilding: "A", flatNumber: "201" },
      { wingBuilding: "a", flatNumber: " 201 " },
    ),
    true,
  );
  assert.deepEqual(
    residentFlatIdentityKeys({ wingBuilding: "A", flatNumber: "201" }),
    residentFlatIdentityKeys({ wingBuilding: " a ", flatNumber: "201" }),
  );
});

test("C. Tower A / 201 and A / 201 remain different", () => {
  assert.equal(
    samePhysicalFlat(
      { wingBuilding: "Tower A", flatNumber: "201" },
      { wingBuilding: "A", flatNumber: "201" },
    ),
    false,
  );
});

test("D. Blank building / 201 and Building A / 201 remain different", () => {
  assert.equal(
    samePhysicalFlat(
      { wingBuilding: null, flatNumber: "201" },
      { wingBuilding: "A", flatNumber: "201" },
    ),
    false,
  );
  assert.equal(
    occupiesLiveFlatNumberSlot(
      { wingBuilding: null, flatNumber: "201" },
      { wingBuilding: "A", flatNumber: "201" },
    ),
    true,
  );
});

test("E. Existing flat A-202 + Wing A is not treated as Flat 202", () => {
  assert.equal(
    samePhysicalFlat(
      { wingBuilding: "A", flatNumber: "A-202" },
      { wingBuilding: "A", flatNumber: "202" },
    ),
    false,
  );
  const display = { wingBuilding: "A", flatNumber: "A-202" };
  assert.equal(display.flatNumber, "A-202");
  assert.equal(residentFlatIdentityKeys(display).flatNumberKey, "a-202");
});

test("F. Two family members in A / 201 share one physical flat identity", () => {
  const owner = { wingBuilding: "A", flatNumber: "201" };
  const family = { wingBuilding: "A", flatNumber: "201" };
  assert.equal(samePhysicalFlat(owner, family), true);

  const workbook = workbookFromRows(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "201", "Kiran Mehta", "9876500301"],
      ["A", "201", "Meera Mehta", "9876500303"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "VALID_NEW");
  assert.equal(outcome.rows[1]?.status, "VALID_NEW");
});

test("G. Excel local validation does not call A/201 vs B/201 a same-flat data conflict", () => {
  const workbook = workbookFromRows(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "201", "Kiran Mehta", "9876500301"],
      ["B", "201", "Farhan Qureshi", "9876500302"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  for (const row of outcome.rows) {
    const sameFlatConflict = row.warnings.some((issue) =>
      issue.code === "POSSIBLE_CONFLICT_FLAT_NAME_MOBILE" ||
      issue.code === "POSSIBLE_CONFLICT_FLAT_SHARED_MOBILE",
    );
    assert.equal(sameFlatConflict, false);
    assert.equal(
      row.warnings.some((issue) => issue.code === "FLAT_IDENTITY_BACKEND_LIMITATION"),
      false,
    );
    assert.equal(row.status, "VALID_NEW");
    const gate = classifyResidentImportDecisionGate(row);
    assert.equal(gate.kind, "valid");
    assert.equal(gate.blockReason, null);
  }
});

test("H. Database verification does not match A/201 existing flat to B/201 as the same physical flat", () => {
  const result = classifyResidentImportAgainstDatabase({
    proposed: [
      {
        rowNumber: 2,
        building: "B",
        wing: "",
        flatNumber: "201",
        residentName: "Farhan Qureshi",
        residentType: "Owner",
        primaryMobile: "9876500302",
        additionalMobiles: [],
      },
    ],
    existing: [
      {
        societyId: "society-a",
        residentName: "Kiran Mehta",
        flatNumber: "201",
        wingBuilding: "A",
        primaryMobile: "9876500301",
        additionalMobiles: [],
        status: "active",
      },
    ],
    societyId: "society-a",
  });
  assert.equal(result.rows[0]?.status, "READY_TO_IMPORT");
  assert.equal(
    samePhysicalFlat(
      { wingBuilding: "B", flatNumber: "201" },
      { wingBuilding: "A", flatNumber: "201" },
    ),
    false,
  );
});

test("I. Distinct B/201 is a legitimate create after building-aware uniqueness", () => {
  assert.equal(LIVE_FLAT_UNIQUENESS_USES_SOCIETY_AND_FLAT_NUMBER, false);
  const resolved = resolveBuildingAwareSocietyFlat(
    [{ id: "flat-a", flatNumber: "201", wingBuilding: "A" }],
    { wingBuilding: "B", flatNumber: "201" },
  );
  assert.equal(resolved.kind, "create");

  const workbook = workbookFromRows(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "201", "Kiran Mehta", "9876500301"],
      ["B", "201", "Farhan Qureshi", "9876500302"],
    ],
  );
  const validation = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(validation.ok, true);
  if (!validation.ok) {
    return;
  }
  const decisions = createResidentImportDecisionSnapshot(validation.rows);
  assert.equal(decisions.rows[0]?.decision, "IMPORT_NEW");
  assert.equal(decisions.rows[1]?.decision, "IMPORT_NEW");
  const attempt = setResidentImportRowDecision(
    decisions,
    validation.rows,
    validation.rows[1]?.rowNumber ?? 0,
    "SKIP",
  );
  assert.equal(attempt.ok, true);
});

test("J. Resident Management lookup never rewrites A/201 into B/201 because numbers match", () => {
  const existing = [{ id: "flat-a", flatNumber: "201", wingBuilding: "A" }];
  const matched = resolveBuildingAwareSocietyFlat(existing, {
    wingBuilding: "A",
    flatNumber: "201",
  });
  assert.equal(matched.kind, "match");
  if (matched.kind === "match") {
    assert.equal(matched.flat.id, "flat-a");
    assert.equal(matched.flat.wingBuilding, "A");
  }

  const distinct = resolveBuildingAwareSocietyFlat(existing, {
    wingBuilding: "B",
    flatNumber: "201",
  });
  assert.equal(distinct.kind, "create");
  if (matched.kind === "match") {
    assert.notEqual(matched.flat.wingBuilding, "B");
  }

  const created = resolveBuildingAwareSocietyFlat(existing, {
    wingBuilding: "A",
    flatNumber: "301",
  });
  assert.equal(created.kind, "create");
});

test("K. Guard flat label can distinguish A/201 and B/201", () => {
  assert.equal(formatResidentFlatLabel("A", "201"), "A · 201");
  assert.equal(formatResidentFlatLabel("B", "201"), "B · 201");
  assert.equal(formatResidentFlatLabel(null, "201"), "201");
  assert.equal(formatResidentFlatLabel("  ", "M02-T101"), "M02-T101");
  assert.notEqual(
    formatResidentFlatLabel("A", "201"),
    formatResidentFlatLabel("B", "201"),
  );
});

test("N. Society isolation semantics remain unchanged", () => {
  assert.notEqual(
    buildFlatIdentityKey("society-a", "A", "201"),
    buildFlatIdentityKey("society-b", "A", "201"),
  );
  const result = classifyResidentImportAgainstDatabase({
    proposed: [
      {
        rowNumber: 2,
        building: "A",
        wing: "",
        flatNumber: "201",
        residentName: "Kiran Mehta",
        residentType: "Owner",
        primaryMobile: "9876500301",
        additionalMobiles: [],
      },
    ],
    existing: [
      {
        societyId: "society-b",
        residentName: "Kiran Mehta",
        flatNumber: "201",
        wingBuilding: "A",
        primaryMobile: "9876500301",
        additionalMobiles: [],
        status: "active",
      },
    ],
    societyId: "society-a",
  });
  assert.equal(result.rows[0]?.status, "READY_TO_IMPORT");
});

test("display helpers never rewrite stored labels such as A-202 or M02-T101", () => {
  assert.equal(combineResidentWingBuilding("A", ""), "A");
  assert.equal(formatResidentFlatLabel("A", "A-202"), "A · A-202");
  assert.equal(formatResidentFlatLabel(null, "M02-T101"), "M02-T101");
  const raw = "A-202";
  residentFlatIdentityKeys({ wingBuilding: "A", flatNumber: raw });
  assert.equal(raw, "A-202");
});

test("admin-resident and Excel screens use building-aware resolve without loosening write guards", () => {
  const adminResident = readFileSync(
    join(ROOT, "supabase/functions/admin-resident/index.ts"),
    "utf8",
  );
  const validate = readFileSync(
    join(ROOT, "packages/shared/src/resident-import-validate.ts"),
    "utf8",
  );
  assert.match(adminResident, /resolveBuildingAwareSocietyFlat/);
  assert.match(adminResident, /AdminResidentBackendLimitationError/);
  assert.equal(adminResident.includes("sameFlatNumber("), false);
  assert.equal(validate.includes("backendFlatGroups"), false);
  assert.equal(LIVE_FLAT_UNIQUENESS_USES_SOCIETY_AND_FLAT_NUMBER, false);
  assert.equal(prepareResidentImportConfirm({ plan: null }).ok, false);
});

test("existing A/201 same resident is Already Exists; changed mobile is Possible Conflict", () => {
  const samePerson = classifyResidentImportAgainstDatabase({
    proposed: [
      {
        rowNumber: 2,
        building: "A",
        wing: "",
        flatNumber: "201",
        residentName: "Kiran Mehta",
        residentType: "Owner",
        primaryMobile: "9876500301",
        additionalMobiles: [],
      },
    ],
    existing: [
      {
        societyId: "society-a",
        residentName: "Kiran Mehta",
        flatNumber: "201",
        wingBuilding: "A",
        primaryMobile: "9876500301",
        additionalMobiles: [],
        status: "active",
      },
    ],
    societyId: "society-a",
  });
  assert.equal(samePerson.rows[0]?.status, "ALREADY_EXISTS");

  const archived = classifyResidentImportAgainstDatabase({
    proposed: samePerson.rows.length
      ? [
          {
            rowNumber: 2,
            building: "A",
            wing: "",
            flatNumber: "201",
            residentName: "Kiran Mehta",
            residentType: "Owner",
            primaryMobile: "9876500301",
            additionalMobiles: [],
          },
        ]
      : [],
    existing: [
      {
        societyId: "society-a",
        residentName: "Kiran Mehta",
        flatNumber: "201",
        wingBuilding: "A",
        primaryMobile: "9876500301",
        additionalMobiles: [],
        status: "disabled",
      },
    ],
    societyId: "society-a",
  });
  assert.equal(archived.rows[0]?.status, "ALREADY_EXISTS");
  assert.match(archived.rows[0]?.message ?? "", /archived/i);

  const changedMobile = classifyResidentImportAgainstDatabase({
    proposed: [
      {
        rowNumber: 2,
        building: "A",
        wing: "",
        flatNumber: "201",
        residentName: "Kiran Mehta",
        residentType: "Owner",
        primaryMobile: "9876500399",
        additionalMobiles: [],
      },
    ],
    existing: [
      {
        societyId: "society-a",
        residentName: "Kiran Mehta",
        flatNumber: "201",
        wingBuilding: "A",
        primaryMobile: "9876500301",
        additionalMobiles: [],
        status: "active",
      },
    ],
    societyId: "society-a",
  });
  assert.equal(changedMobile.rows[0]?.status, "POSSIBLE_DATABASE_CONFLICT");
});

test("proposed verification rows keep building and wing identity", () => {
  const rows = proposedRowsForDatabaseVerification({
    version: 1,
    summary: {
      totalExcelRows: 1,
      willImport: 1,
      willSkip: 0,
      validSelectedForImport: 1,
      conflictsApprovedAsSeparate: 0,
      duplicatesSkipped: 0,
      invalidSkipped: 0,
      backendBlockedSkipped: 0,
      manualSkips: 0,
    },
    willImport: [
      {
        rowNumber: 2,
        validationStatus: "VALID_NEW",
        decision: "IMPORT_NEW",
        decisionReason: "DEFAULT_VALID_NEW",
        decisionSource: "Valid row selected for import as a new resident.",
        mapped: {
          building: "B",
          wing: "",
          flatNumber: "201",
          residentName: "Farhan Qureshi",
          residentType: "Owner",
          primaryMobile: "9876500302",
          additionalMobiles: [],
          customFields: [],
        },
      },
    ],
    willSkip: [],
    databaseAwareVerification: "deferred",
  });
  assert.equal(rows[0]?.building, "B");
  assert.equal(rows[0]?.flatNumber, "201");
});

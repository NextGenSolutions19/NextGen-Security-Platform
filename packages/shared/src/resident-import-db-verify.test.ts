import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachResidentImportVerifyFingerprint,
  buildResidentImportVerifyRequest,
  classifyResidentImportAgainstDatabase,
  isResidentImportVerificationStale,
  parseResidentImportVerifyRequest,
  proposedRowsForDatabaseVerification,
  residentImportVerifyFingerprint,
  type ResidentImportExistingResident,
  type ResidentImportVerifyProposedRow,
} from "./resident-import-db-verify.ts";
import {
  createResidentImportDecisionSnapshot,
  buildResidentImportPlan,
  setResidentImportRowDecision,
} from "./resident-import-decisions.ts";
import { createResidentImportMappingSnapshot } from "./resident-import-mapping.ts";
import { parseResidentImportWorkbook } from "./resident-import-parse.ts";
import { validateResidentImportWorkbook } from "./resident-import-validate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = join(
  ROOT,
  "docs/testing/fixtures/m03-resident-import/M03_Resident_Import_Testing.xlsx",
);
const EDGE_FUNCTION_PATH = join(
  ROOT,
  "supabase/functions/admin-resident-import-verify/index.ts",
);

function proposed(
  overrides: Partial<ResidentImportVerifyProposedRow> & { rowNumber?: number },
): ResidentImportVerifyProposedRow {
  return {
    rowNumber: overrides.rowNumber ?? 2,
    building: overrides.building ?? "A",
    wing: overrides.wing ?? "",
    flatNumber: overrides.flatNumber ?? "101",
    residentName: overrides.residentName ?? "Asha Mehta",
    residentType: overrides.residentType ?? "Owner",
    primaryMobile: overrides.primaryMobile ?? "9876500001",
    additionalMobiles: overrides.additionalMobiles ?? [],
  };
}

function existing(
  overrides: Partial<ResidentImportExistingResident>,
): ResidentImportExistingResident {
  return {
    societyId: overrides.societyId ?? "society-a",
    residentName: overrides.residentName ?? "Asha Mehta",
    flatNumber: overrides.flatNumber ?? "101",
    wingBuilding: overrides.wingBuilding ?? "A",
    primaryMobile: overrides.primaryMobile ?? "9876500001",
    additionalMobiles: overrides.additionalMobiles ?? [],
    status: overrides.status ?? "active",
  };
}

function classify(
  rows: ResidentImportVerifyProposedRow[],
  residents: ResidentImportExistingResident[],
  societyId = "society-a",
) {
  return classifyResidentImportAgainstDatabase({
    proposed: rows,
    existing: residents,
    societyId,
  });
}

function loadFixturePlan() {
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const parsed = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    throw new Error("fixture parse failed");
  }
  const mapping = createResidentImportMappingSnapshot(parsed.result);
  const validation = validateResidentImportWorkbook({
    workbook: parsed.result,
    mapping,
  });
  assert.equal(validation.ok, true);
  if (!validation.ok) {
    throw new Error("fixture validation failed");
  }
  const decisions = createResidentImportDecisionSnapshot(validation.rows);
  const plan = buildResidentImportPlan({
    workbook: parsed.result,
    mapping,
    validation,
    decisions,
  });
  assert.ok(plan);
  if (!plan) {
    throw new Error("expected plan");
  }
  const byCase = new Map(
    validation.rows.map((row, index) => [
      parsed.result.rows[index]?.displayValues[0] ?? "",
      row,
    ]),
  );
  return { plan, validation, decisions, byCase };
}

test("only planned-import rows are verification candidates", () => {
  const { plan, byCase } = loadFixturePlan();
  const rows = proposedRowsForDatabaseVerification(plan);
  const request = buildResidentImportVerifyRequest(plan);
  assert.equal(rows.length, 16);
  assert.equal(request.rows.length, 16);
  assert.equal("society_id" in request, false);
  assert.equal("societyId" in request, false);

  const skippedCases = ["TEST-G", "TEST-K1", "TEST-L1", "TEST-M", "TEST-DB2"];
  for (const qaCase of skippedCases) {
    const row = byCase.get(qaCase);
    assert.ok(row);
    assert.equal(
      rows.some((item) => item.rowNumber === row.rowNumber),
      false,
      `${qaCase} must not be a verification candidate`,
    );
  }

  const validA = byCase.get("TEST-A");
  const validDb1 = byCase.get("TEST-DB1");
  assert.ok(validA);
  assert.ok(validDb1);
  assert.equal(rows.some((item) => item.rowNumber === validA.rowNumber), true);
  assert.equal(rows.some((item) => item.rowNumber === validDb1.rowNumber), true);
});

test("skipped, invalid, and duplicate rows are not candidates", () => {
  const { plan, byCase, validation, decisions } = loadFixturePlan();
  const validA = byCase.get("TEST-A");
  assert.ok(validA);
  const skipped = setResidentImportRowDecision(
    decisions,
    validation.rows,
    validA.rowNumber,
    "SKIP",
  );
  assert.equal(skipped.ok, true);
  if (!skipped.ok) {
    return;
  }
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const parsed = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const mapping = createResidentImportMappingSnapshot(parsed.result);
  const nextPlan = buildResidentImportPlan({
    workbook: parsed.result,
    mapping,
    validation,
    decisions: skipped.snapshot,
  });
  assert.ok(nextPlan);
  if (!nextPlan) {
    return;
  }
  const rows = proposedRowsForDatabaseVerification(nextPlan);
  assert.equal(rows.some((item) => item.rowNumber === validA.rowNumber), false);
  assert.equal(rows.length, plan.willImport.length - 1);
});

test("no-match is Ready to Import", () => {
  const result = classify([proposed({})], [], "society-a");
  assert.equal(result.rows[0]?.status, "READY_TO_IMPORT");
  assert.equal(result.summary.readyToImport, 1);
  assert.equal(result.readOnly, true);
});

test("existing exact resident is Already Exists", () => {
  const result = classify(
    [proposed({})],
    [existing({})],
  );
  assert.equal(result.rows[0]?.status, "ALREADY_EXISTS");
  assert.equal(result.rows[0]?.decisionLabel, "Do Not Import");
  assert.deepEqual(result.rows[0]?.matchedFields, [
    "Flat Number",
    "Resident Name",
    "Mobile",
  ]);
  assert.match(result.rows[0]?.message ?? "", /Asha Mehta/);
});

test("archived exact resident is Already Exists and is not reactivated", () => {
  const result = classify(
    [proposed({})],
    [existing({ status: "disabled" })],
  );
  assert.equal(result.rows[0]?.status, "ALREADY_EXISTS");
  assert.match(result.rows[0]?.message ?? "", /archived/);
});

test("same mobile on a different resident is a possible conflict", () => {
  const result = classify(
    [proposed({ residentName: "Bala Nair", flatNumber: "102" })],
    [existing({ residentName: "Asha Mehta", flatNumber: "101" })],
  );
  assert.equal(result.rows[0]?.status, "POSSIBLE_DATABASE_CONFLICT");
  assert.equal(result.rows[0]?.decisionLabel, "Requires Review");
  assert.match(result.rows[0]?.message ?? "", /already used/);
});

test("same mobile on a different flat is a possible conflict", () => {
  const result = classify(
    [proposed({ flatNumber: "105", residentName: "Farhan Qureshi" })],
    [existing({ flatNumber: "101", residentName: "Asha Mehta" })],
  );
  assert.equal(result.rows[0]?.status, "POSSIBLE_DATABASE_CONFLICT");
  assert.match(result.rows[0]?.message ?? "", /flat 101/);
});

test("same flat and name with a different mobile is a possible conflict", () => {
  const result = classify(
    [proposed({ primaryMobile: "9876500014" })],
    [existing({ primaryMobile: "9876500001" })],
  );
  assert.equal(result.rows[0]?.status, "POSSIBLE_DATABASE_CONFLICT");
  assert.match(result.rows[0]?.message ?? "", /mobile numbers do not match/);
});

test("same flat with a different name and different mobile is Ready to Import", () => {
  const result = classify(
    [
      proposed({
        residentName: "Bala Nair",
        primaryMobile: "9876500103",
        flatNumber: "102",
      }),
    ],
    [
      existing({
        residentName: "Asha Mehta",
        primaryMobile: "9876500102",
        flatNumber: "102",
      }),
    ],
  );
  assert.equal(result.rows[0]?.status, "READY_TO_IMPORT");
});

test("Building A/201 vs existing Building B/201 is Ready to Import", () => {
  const result = classify(
    [proposed({ building: "A", flatNumber: "201", residentName: "Ira Shah", primaryMobile: "9876500201" })],
    [
      existing({
        wingBuilding: "B",
        flatNumber: "201",
        residentName: "Kabir Rao",
        primaryMobile: "9876500202",
      }),
    ],
  );
  assert.equal(result.rows[0]?.status, "READY_TO_IMPORT");
});

test("tenant isolation ignores residents from another society", () => {
  const result = classify(
    [proposed({})],
    [
      existing({
        societyId: "society-b",
        residentName: "Asha Mehta",
        flatNumber: "101",
        primaryMobile: "9876500001",
      }),
    ],
    "society-a",
  );
  assert.equal(result.rows[0]?.status, "READY_TO_IMPORT");
  assert.equal(result.rows[0]?.existingResident, null);
});

test("parse ignores client society identifiers", () => {
  const parsed = parseResidentImportVerifyRequest({
    society_id: "should-be-ignored",
    societyId: "should-be-ignored",
    society_code: "DEMO2",
    rows: [
      {
        rowNumber: 2,
        building: "A",
        wing: "",
        flatNumber: "101",
        residentName: "Asha",
        residentType: "Owner",
        primaryMobile: "9876500001",
        additionalMobiles: ["9876501001"],
      },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.rows.length, 1);
  assert.equal("society_id" in parsed.rows[0], false);
  assert.equal(parsed.rows[0]?.flatNumber, "101");
  assert.deepEqual(parsed.rows[0]?.additionalMobiles, ["9876501001"]);
});

test("verification is stale after an import-plan change", () => {
  const { plan, validation, decisions, byCase } = loadFixturePlan();
  const classified = classify(
    proposedRowsForDatabaseVerification(plan),
    [],
  );
  const result = attachResidentImportVerifyFingerprint(classified, plan);
  assert.equal(isResidentImportVerificationStale(plan, result), false);

  const validA = byCase.get("TEST-A");
  assert.ok(validA);
  const skipped = setResidentImportRowDecision(
    decisions,
    validation.rows,
    validA.rowNumber,
    "SKIP",
  );
  assert.equal(skipped.ok, true);
  if (!skipped.ok) {
    return;
  }
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const parsed = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const mapping = createResidentImportMappingSnapshot(parsed.result);
  const nextPlan = buildResidentImportPlan({
    workbook: parsed.result,
    mapping,
    validation,
    decisions: skipped.snapshot,
  });
  assert.ok(nextPlan);
  if (!nextPlan) {
    return;
  }
  assert.notEqual(
    residentImportVerifyFingerprint(plan),
    residentImportVerifyFingerprint(nextPlan),
  );
  assert.equal(isResidentImportVerificationStale(nextPlan, result), true);
});

test("verification edge function is read-only", () => {
  const source = readFileSync(EDGE_FUNCTION_PATH, "utf8");
  assert.match(source, /\.select\(/);
  assert.equal(source.includes(".insert("), false);
  assert.equal(source.includes(".update("), false);
  assert.equal(source.includes(".delete("), false);
  assert.equal(source.includes("createServiceClient"), true);
  assert.equal(source.includes("authenticateAdminRequest"), true);
});

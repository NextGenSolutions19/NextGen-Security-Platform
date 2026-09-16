import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyResidentImportBulkAction,
  areResidentImportDecisionsComplete,
  buildResidentImportPlan,
  canReviewResidentImportPlan,
  classifyResidentImportDecisionGate,
  createResidentImportDecisionSnapshot,
  findResidentImportRowDecision,
  parseResidentImportDecisionSnapshot,
  parseResidentImportPlan,
  planSummaryReconciles,
  resetResidentImportDecisions,
  serializeResidentImportDecisionSnapshot,
  serializeResidentImportPlan,
  setResidentImportRowDecision,
} from "./resident-import-decisions.ts";
import {
  applyResidentImportColumnTarget,
  createResidentImportMappingSnapshot,
  updateResidentImportCustomField,
  type ResidentImportMappingSnapshot,
} from "./resident-import-mapping.ts";
import {
  parseResidentImportWorkbook,
  type WorkbookParseResult,
} from "./resident-import-parse.ts";
import { validateResidentImportWorkbook } from "./resident-import-validate.ts";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/testing/fixtures/m03-resident-import/M03_Resident_Import_Testing.xlsx",
);

function parseResult(headers: string[], rows: string[][]): WorkbookParseResult {
  return {
    fileName: "sample.xlsx",
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
        value,
        formula: null,
        numberFormat: null,
      })),
    })),
    totalDataRowCount: rows.length,
    warnings: [],
  };
}

function mappingFor(workbook: WorkbookParseResult): ResidentImportMappingSnapshot {
  return createResidentImportMappingSnapshot(workbook);
}

function validateWorkbook(workbook: WorkbookParseResult, mapping = mappingFor(workbook)) {
  const outcome = validateResidentImportWorkbook({ workbook, mapping });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    throw new Error("validation failed");
  }
  return { workbook, mapping, validation: outcome };
}

function loadFixture() {
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const outcome = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    throw new Error("fixture parse failed");
  }
  return validateWorkbook(outcome.result);
}

function requirePlan(
  workbook: WorkbookParseResult,
  mapping: ResidentImportMappingSnapshot,
  validation: ReturnType<typeof validateWorkbook>["validation"],
  decisions: ReturnType<typeof createResidentImportDecisionSnapshot>,
) {
  const plan = buildResidentImportPlan({
    workbook,
    mapping,
    validation,
    decisions,
  });
  assert.ok(plan);
  if (!plan) {
    throw new Error("expected import plan");
  }
  return plan;
}

test("VALID_NEW defaults to IMPORT_NEW and can be skipped then restored", () => {
  const { workbook, mapping, validation } = validateWorkbook(
    parseResult(
      ["Flat No", "Resident Name", "Mobile 1"],
      [["101", "Asha", "9876500001"]],
    ),
  );
  const row = validation.rows[0];
  assert.equal(row?.status, "VALID_NEW");
  const gate = classifyResidentImportDecisionGate(row);
  assert.equal(gate.kind, "valid");
  assert.equal(gate.defaultDecision, "IMPORT_NEW");

  let decisions = createResidentImportDecisionSnapshot(validation.rows);
  assert.equal(decisions.rows[0]?.decision, "IMPORT_NEW");
  assert.equal(decisions.rows[0]?.decisionReason, "DEFAULT_VALID_NEW");
  assert.equal(decisions.rows[0]?.isBlocked, false);

  const skipped = setResidentImportRowDecision(
    decisions,
    validation.rows,
    row.rowNumber,
    "SKIP",
  );
  assert.equal(skipped.ok, true);
  if (!skipped.ok) {
    return;
  }
  decisions = skipped.snapshot;
  assert.equal(decisions.rows[0]?.decision, "SKIP");
  assert.equal(decisions.rows[0]?.decisionReason, "MANUAL_SKIP_VALID");

  const restored = setResidentImportRowDecision(
    decisions,
    validation.rows,
    row.rowNumber,
    "IMPORT_NEW",
  );
  assert.equal(restored.ok, true);
  if (!restored.ok) {
    return;
  }
  assert.equal(restored.snapshot.rows[0]?.decision, "IMPORT_NEW");
  assert.equal(restored.snapshot.rows[0]?.decisionReason, "DEFAULT_VALID_NEW");

  const asSeparate = setResidentImportRowDecision(
    decisions,
    validation.rows,
    row.rowNumber,
    "IMPORT_NEW_AS_SEPARATE",
  );
  assert.equal(asSeparate.ok, false);

  const plan = requirePlan(workbook, mapping, validation, restored.snapshot);
  assert.equal(plan.willImport.length, 1);
  assert.equal(plan.summary.validSelectedForImport, 1);
});

test("INVALID rows are forced skip and cannot become import", () => {
  const { validation } = validateWorkbook(
    parseResult(
      ["Flat No", "Resident Name", "Mobile 1"],
      [["101", "Asha", "12345"]],
    ),
  );
  const row = validation.rows[0];
  assert.equal(row?.status, "INVALID");
  const gate = classifyResidentImportDecisionGate(row);
  assert.equal(gate.kind, "blocked_invalid");
  assert.equal(gate.isBlocked, true);

  const decisions = createResidentImportDecisionSnapshot(validation.rows);
  assert.equal(decisions.rows[0]?.decision, "SKIP");
  assert.equal(decisions.rows[0]?.blockReason, "INVALID");

  const attemptNew = setResidentImportRowDecision(
    decisions,
    validation.rows,
    row.rowNumber,
    "IMPORT_NEW",
  );
  const attemptSeparate = setResidentImportRowDecision(
    decisions,
    validation.rows,
    row.rowNumber,
    "IMPORT_NEW_AS_SEPARATE",
  );
  assert.equal(attemptNew.ok, false);
  assert.equal(attemptSeparate.ok, false);
  assert.equal(decisions.rows[0]?.decision, "SKIP");
});

test("INTRA_FILE_DUPLICATE is forced skip and cannot become import", () => {
  const { validation } = validateWorkbook(
    parseResult(
      ["Building", "Flat No", "Resident Name", "Mobile 1"],
      [
        ["A", "101", "Asha", "9876500001"],
        ["A", "101", "Asha", "9876500001"],
      ],
    ),
  );
  assert.equal(validation.rows[0]?.status, "VALID_NEW");
  assert.equal(validation.rows[1]?.status, "INTRA_FILE_DUPLICATE");
  const duplicate = validation.rows[1];
  assert.ok(duplicate);
  const gate = classifyResidentImportDecisionGate(duplicate);
  assert.equal(gate.kind, "blocked_duplicate");

  const decisions = createResidentImportDecisionSnapshot(validation.rows);
  assert.equal(decisions.rows[1]?.decision, "SKIP");
  assert.equal(decisions.rows[1]?.blockReason, "INTRA_FILE_DUPLICATE");

  const attempt = setResidentImportRowDecision(
    decisions,
    validation.rows,
    duplicate.rowNumber,
    "IMPORT_NEW",
  );
  assert.equal(attempt.ok, false);
});

test("distinct-building same-number rows are importable as separate flats", () => {
  const { validation } = validateWorkbook(
    parseResult(
      ["Building", "Flat No", "Resident Name", "Mobile 1"],
      [
        ["A", "201", "Ira Shah", "9876500201"],
        ["B", "201", "Kabir Rao", "9876500202"],
      ],
    ),
  );
  assert.equal(validation.rows[0]?.status, "VALID_NEW");
  assert.equal(validation.rows[1]?.status, "VALID_NEW");
  for (const row of validation.rows) {
    const gate = classifyResidentImportDecisionGate(row);
    assert.equal(gate.kind, "valid");
    assert.equal(gate.blockReason, null);
  }

  const decisions = createResidentImportDecisionSnapshot(validation.rows);
  assert.equal(decisions.rows[0]?.decision, "IMPORT_NEW");
  assert.equal(decisions.rows[0]?.isBlocked, false);
  assert.equal(decisions.rows[1]?.decision, "IMPORT_NEW");

  const attempt = setResidentImportRowDecision(
    decisions,
    validation.rows,
    validation.rows[0]?.rowNumber ?? 0,
    "SKIP",
  );
  assert.equal(attempt.ok, true);
});

test("POSSIBLE_CONFLICT defaults to SKIP and can be approved as a separate resident", () => {
  const { workbook, mapping, validation } = validateWorkbook(
    parseResult(
      ["Building", "Flat No", "Resident Name", "Mobile 1"],
      [
        ["A", "101", "Asha", "9876500001"],
        ["A", "101", "Asha", "9876500999"],
      ],
    ),
  );
  assert.equal(validation.rows[1]?.status, "POSSIBLE_CONFLICT");
  const conflict = validation.rows[1];
  assert.ok(conflict);
  const gate = classifyResidentImportDecisionGate(conflict);
  assert.equal(gate.kind, "overridable_conflict");
  assert.equal(gate.defaultDecision, "SKIP");

  let decisions = createResidentImportDecisionSnapshot(validation.rows);
  assert.equal(decisions.rows[1]?.decision, "SKIP");
  assert.equal(decisions.rows[1]?.decisionReason, "DEFAULT_CONFLICT_SKIP");

  const asImportNew = setResidentImportRowDecision(
    decisions,
    validation.rows,
    conflict.rowNumber,
    "IMPORT_NEW",
  );
  assert.equal(asImportNew.ok, false);

  const approved = setResidentImportRowDecision(
    decisions,
    validation.rows,
    conflict.rowNumber,
    "IMPORT_NEW_AS_SEPARATE",
  );
  assert.equal(approved.ok, true);
  if (!approved.ok) {
    return;
  }
  decisions = approved.snapshot;
  assert.equal(decisions.rows[1]?.decision, "IMPORT_NEW_AS_SEPARATE");
  assert.equal(decisions.rows[1]?.decisionReason, "APPROVED_SEPARATE_RESIDENT");

  const plan = requirePlan(workbook, mapping, validation, decisions);
  assert.equal(plan.summary.conflictsApprovedAsSeparate, 1);
  assert.equal(plan.willImport.some((row) => row.rowNumber === conflict.rowNumber), true);
  assert.match(
    plan.willImport.find((row) => row.rowNumber === conflict.rowNumber)?.decisionSource ?? "",
    /separate resident/i,
  );
  assert.match(
    plan.willImport.find((row) => row.rowNumber === conflict.rowNumber)?.decisionSource ?? "",
    /not merge/i,
  );
});

test("bulk import/skip valid, skip conflicts, and reset decisions", () => {
  const { validation } = validateWorkbook(
    parseResult(
      ["Building", "Flat No", "Resident Name", "Mobile 1"],
      [
        ["A", "101", "Asha", "9876500001"],
        ["A", "102", "Bala", "9876500002"],
        ["A", "101", "Asha", "9876500999"],
      ],
    ),
  );
  assert.equal(validation.rows[0]?.status, "VALID_NEW");
  assert.equal(validation.rows[1]?.status, "VALID_NEW");
  assert.equal(validation.rows[2]?.status, "POSSIBLE_CONFLICT");

  let decisions = createResidentImportDecisionSnapshot(validation.rows);
  const conflictRow = validation.rows[2];
  assert.ok(conflictRow);
  const approved = setResidentImportRowDecision(
    decisions,
    validation.rows,
    conflictRow.rowNumber,
    "IMPORT_NEW_AS_SEPARATE",
  );
  assert.equal(approved.ok, true);
  if (approved.ok) {
    decisions = approved.snapshot;
  }

  decisions = applyResidentImportBulkAction({
    action: "SKIP_ALL_VALID",
    validationRows: validation.rows,
    decisions,
  });
  assert.equal(findResidentImportRowDecision(decisions, 2)?.decision, "SKIP");
  assert.equal(findResidentImportRowDecision(decisions, 3)?.decision, "SKIP");
  assert.equal(
    findResidentImportRowDecision(decisions, conflictRow.rowNumber)?.decision,
    "IMPORT_NEW_AS_SEPARATE",
  );

  decisions = applyResidentImportBulkAction({
    action: "IMPORT_ALL_VALID",
    validationRows: validation.rows,
    decisions,
  });
  assert.equal(findResidentImportRowDecision(decisions, 2)?.decision, "IMPORT_NEW");
  assert.equal(findResidentImportRowDecision(decisions, 3)?.decision, "IMPORT_NEW");

  decisions = applyResidentImportBulkAction({
    action: "SKIP_ALL_CONFLICTS",
    validationRows: validation.rows,
    decisions,
  });
  assert.equal(
    findResidentImportRowDecision(decisions, conflictRow.rowNumber)?.decision,
    "SKIP",
  );
  assert.equal(findResidentImportRowDecision(decisions, 2)?.decision, "IMPORT_NEW");

  const reset = applyResidentImportBulkAction({
    action: "RESET",
    validationRows: validation.rows,
    decisions,
  });
  assert.deepEqual(reset, createResidentImportDecisionSnapshot(validation.rows));
  assert.deepEqual(resetResidentImportDecisions(validation.rows), reset);
});

test("import plan counts reconcile to total rows and include mobiles plus custom fields", () => {
  const workbook = parseResult(
    [
      "Flat No",
      "Resident Name",
      "Mobile 1",
      "Mobile 2",
      "Emergency Contact",
      "Parking Slot",
      "Move-in Date",
    ],
    [[
      "101",
      "Charu Iyer",
      "9876500003",
      "9876501003",
      "9876502003",
      "P-101",
      "2023-04-12",
    ]],
  );
  let mapping = mappingFor(workbook);
  const emergency = mapping.columns.find((column) => column.header === "Emergency Contact");
  assert.ok(emergency);
  const applied = applyResidentImportColumnTarget(
    mapping,
    emergency.columnIndex,
    "ADDITIONAL_MOBILE",
  );
  assert.equal(applied.ok, true);
  if (applied.ok) {
    mapping = applied.snapshot;
  }
  const parking = mapping.columns.find((column) => column.header === "Parking Slot");
  const moveIn = mapping.columns.find((column) => column.header === "Move-in Date");
  assert.ok(parking);
  assert.ok(moveIn);
  mapping = updateResidentImportCustomField(mapping, parking.columnIndex, {
    fieldType: "text",
    name: "Parking Slot",
  });
  mapping = updateResidentImportCustomField(mapping, moveIn.columnIndex, {
    fieldType: "date",
    name: "Move-in Date",
  });

  const { validation } = validateWorkbook(workbook, mapping);
  const decisions = createResidentImportDecisionSnapshot(validation.rows);
  const plan = requirePlan(workbook, mapping, validation, decisions);

  assert.equal(planSummaryReconciles(plan.summary), true);
  assert.equal(plan.summary.totalExcelRows, 1);
  assert.equal(plan.summary.willImport, 1);
  assert.equal(plan.willImport[0]?.mapped.primaryMobile, "9876500003");
  assert.deepEqual(plan.willImport[0]?.mapped.additionalMobiles, [
    "9876501003",
    "9876502003",
  ]);
  const parkingValue = plan.willImport[0]?.mapped.customFields.find(
    (field) => field.name === "Parking Slot",
  );
  const moveInValue = plan.willImport[0]?.mapped.customFields.find(
    (field) => field.name === "Move-in Date",
  );
  assert.equal(parkingValue?.displayValue, "P-101");
  assert.equal(moveInValue?.displayValue, "2023-04-12");
  assert.equal(
    plan.willImport[0]?.mapped.customFields.some(
      (field) => field.name === "Emergency Contact",
    ),
    false,
  );
});

test("testing workbook default plan reconciles to 28 and blocks unsafe rows", () => {
  const { workbook, mapping, validation } = loadFixture();
  const byCase = new Map(
    validation.rows.map((row, index) => [
      workbook.rows[index]?.displayValues[0] ?? "",
      row,
    ]),
  );
  const decisions = createResidentImportDecisionSnapshot(validation.rows);
  assert.equal(canReviewResidentImportPlan(validation, decisions), true);

  const testA = byCase.get("TEST-A");
  const testG = byCase.get("TEST-G");
  const testK1 = byCase.get("TEST-K1");
  const testD1 = byCase.get("TEST-D1");
  const testD2 = byCase.get("TEST-D2");
  const testH = byCase.get("TEST-H");
  const testC = byCase.get("TEST-C");
  const testDb1 = byCase.get("TEST-DB1");
  const testDb2 = byCase.get("TEST-DB2");
  assert.ok(testA && testG && testK1 && testD1 && testD2 && testH && testC && testDb1 && testDb2);

  assert.equal(
    findResidentImportRowDecision(decisions, testA.rowNumber)?.decision,
    "IMPORT_NEW",
  );
  assert.equal(
    findResidentImportRowDecision(decisions, testG.rowNumber)?.decision,
    "SKIP",
  );
  assert.equal(
    findResidentImportRowDecision(decisions, testG.rowNumber)?.isBlocked,
    true,
  );
  assert.equal(
    findResidentImportRowDecision(decisions, testK1.rowNumber)?.isBlocked,
    true,
  );
  assert.equal(
    classifyResidentImportDecisionGate(testD1).kind,
    "valid",
  );
  assert.equal(
    classifyResidentImportDecisionGate(testD2).kind,
    "valid",
  );
  assert.equal(
    classifyResidentImportDecisionGate(testH).kind,
    "overridable_conflict",
  );
  assert.equal(
    findResidentImportRowDecision(decisions, testDb1.rowNumber)?.decision,
    "IMPORT_NEW",
  );
  assert.equal(
    classifyResidentImportDecisionGate(testDb2).kind,
    "overridable_conflict",
  );

  const plan = requirePlan(workbook, mapping, validation, decisions);
  assert.equal(plan.summary.totalExcelRows, 28);
  assert.equal(plan.summary.validSelectedForImport, 16);
  assert.equal(plan.summary.conflictsApprovedAsSeparate, 0);
  assert.equal(plan.summary.duplicatesSkipped, 1);
  assert.equal(plan.summary.invalidSkipped, 5);
  assert.equal(plan.summary.backendBlockedSkipped, 0);
  assert.equal(plan.summary.manualSkips, 6);
  assert.equal(plan.summary.willImport, 16);
  assert.equal(plan.summary.willSkip, 12);
  assert.equal(planSummaryReconciles(plan.summary), true);
  assert.equal(plan.databaseAwareVerification, "deferred");

  const importedC = plan.willImport.find((row) => row.rowNumber === testC.rowNumber);
  assert.ok(importedC);
  assert.equal(importedC.mapped.additionalMobiles.length >= 1, true);
  assert.equal(
    importedC.mapped.customFields.some((field) => field.name === "Parking Slot"),
    true,
  );

  const skippedG = plan.willSkip.find((row) => row.rowNumber === testG.rowNumber);
  assert.equal(skippedG?.reason, "Duplicate of Excel row 2.");

  const skippedInvalid = plan.willSkip.find((row) => row.rowNumber === testK1.rowNumber);
  assert.match(skippedInvalid?.reason ?? "", /Correct the Excel file/i);

  assert.equal(
    plan.willImport.some((row) => row.rowNumber === testD1.rowNumber),
    true,
  );
  assert.equal(
    plan.willImport.some((row) => row.rowNumber === testD2.rowNumber),
    true,
  );
  assert.equal(
    plan.willImport.some((row) => row.rowNumber === testG.rowNumber),
    false,
  );
  assert.equal(
    plan.willImport.some((row) => row.rowNumber === testDb1.rowNumber),
    true,
  );
  assert.equal(
    plan.willImport.some((row) => row.rowNumber === testDb2.rowNumber),
    false,
  );
});

test("a new validation snapshot does not keep previous decisions", () => {
  const first = validateWorkbook(
    parseResult(
      ["Flat No", "Resident Name"],
      [["101", "Asha"]],
    ),
  );
  let decisions = createResidentImportDecisionSnapshot(first.validation.rows);
  const skipped = setResidentImportRowDecision(
    decisions,
    first.validation.rows,
    first.validation.rows[0]?.rowNumber ?? 0,
    "SKIP",
  );
  assert.equal(skipped.ok, true);
  if (skipped.ok) {
    decisions = skipped.snapshot;
  }

  const second = validateWorkbook(
    parseResult(
      ["Flat No", "Resident Name", "Mobile 1"],
      [
        ["201", "Bala", "9876500002"],
        ["202", "Charu", "123"],
      ],
    ),
  );
  assert.equal(
    areResidentImportDecisionsComplete(second.validation.rows, decisions),
    false,
  );
  assert.equal(
    canReviewResidentImportPlan(second.validation, decisions),
    false,
  );
  assert.equal(
    buildResidentImportPlan({
      workbook: second.workbook,
      mapping: second.mapping,
      validation: second.validation,
      decisions,
    }),
    null,
  );

  const fresh = createResidentImportDecisionSnapshot(second.validation.rows);
  assert.equal(fresh.rows[0]?.decision, "IMPORT_NEW");
  assert.equal(fresh.rows[1]?.decision, "SKIP");
  assert.equal(fresh.rows.length, 2);
  assert.equal(decisions.rows.length, 1);
  assert.equal(decisions.rows[0]?.decision, "SKIP");
  assert.equal(areResidentImportDecisionsComplete(second.validation.rows, fresh), true);
});

test("decision snapshot and import plan JSON round-trip", () => {
  const { workbook, mapping, validation } = loadFixture();
  const decisions = createResidentImportDecisionSnapshot(validation.rows);
  const rawDecisions = serializeResidentImportDecisionSnapshot(decisions);
  assert.deepEqual(parseResidentImportDecisionSnapshot(rawDecisions), decisions);
  assert.equal(rawDecisions.includes("IMPORT_NEW"), true);
  assert.equal(rawDecisions.includes("BACKEND_FLAT_LIMITATION"), false);

  const plan = requirePlan(workbook, mapping, validation, decisions);
  const rawPlan = serializeResidentImportPlan(plan);
  assert.deepEqual(parseResidentImportPlan(rawPlan), plan);
  assert.equal(rawPlan.includes("deferred"), true);
  assert.equal(rawPlan.includes("additionalMobiles"), true);
  assert.equal(rawPlan.includes("customFields"), true);
});

test("invalid serialized snapshots are rejected", () => {
  assert.throws(() => parseResidentImportDecisionSnapshot("{}"));
  assert.throws(() => parseResidentImportDecisionSnapshot('{"version":2,"rows":[]}'));
  assert.throws(() => parseResidentImportPlan("{}"));
});

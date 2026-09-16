import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BACK_TO_RESIDENT_MANAGEMENT_LABEL,
  CONFIRM_IMPORT_DIALOG_CANCEL_LABEL,
  CONFIRM_IMPORT_DIALOG_CONFIRM_LABEL,
  CONFIRM_IMPORT_DIALOG_TITLE,
  IMPORT_ANOTHER_EXCEL_FILE_LABEL,
  PARTIAL_IMPORT_EXPLANATION,
  RESIDENT_IMPORT_CONFIRM_FUNCTION_NAME,
  RESIDENT_IMPORT_CONFIRM_REQUEST_FAILED_MESSAGE,
  RESIDENT_IMPORT_UNSUPPORTED_FIELDS_WARNING,
  beginResidentImportConfirm,
  buildResidentImportConfirmRequest,
  buildResidentImportConfirmUiView,
  canConfirmResidentImport,
  cancelResidentImportConfirmDialog,
  completeResidentImportConfirm,
  createResidentImportConfirmFlowState,
  failResidentImportConfirm,
  formatResidentImportConfirmDialogMessage,
  formatResidentImportConfirmResultLabel,
  isFreshResidentImportVerification,
  openResidentImportConfirmDialog,
  parseResidentImportConfirmClientResponse,
  resetResidentImportConfirmFlow,
  residentImportHasUnsupportedPersistedFields,
  residentImportUnsupportedFieldsWarning,
  selectResidentImportReadyRows,
} from "./resident-import-confirm-ui.ts";
import { DATABASE_VERIFICATION_REQUIRED_MESSAGE } from "./resident-import-decisions.ts";
import {
  RESIDENT_IMPORT_CONFIRM_STATUSES,
  RESIDENT_IMPORT_CONFIRM_VERSION,
  mapResidentImportConfirmApplicationResult,
} from "./resident-import-confirm.ts";
import {
  attachResidentImportVerifyFingerprint,
  isResidentImportVerificationStale,
  type ResidentImportDatabaseRowResult,
  type ResidentImportDatabaseStatus,
  type ResidentImportDatabaseVerificationResult,
} from "./resident-import-db-verify.ts";
import type {
  ResidentImportMappedRowSnapshot,
  ResidentImportPlan,
  ResidentImportPlanWillImportRow,
  ResidentImportPlanWillSkipRow,
} from "./resident-import-decisions.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONFIRM_SERVICE_PATH = join(
  ROOT,
  "apps/mobile/src/features/admin-excel-import/residentImportConfirmService.ts",
);
const IMPORT_SCREEN_PATH = join(
  ROOT,
  "apps/mobile/app/(admin)/excel-import.tsx",
);
const IMPORT_PLAN_SECTION_PATH = join(
  ROOT,
  "apps/mobile/src/features/admin-excel-import/ImportPlanSection.tsx",
);
const IMPORT_RESULT_SECTION_PATH = join(
  ROOT,
  "apps/mobile/src/features/admin-excel-import/ImportResultSection.tsx",
);

function mapped(
  overrides: Partial<ResidentImportMappedRowSnapshot> & { rowNumber: number },
): ResidentImportMappedRowSnapshot {
  return {
    building: "A",
    wing: "",
    flatNumber: `${overrides.rowNumber}01`,
    residentName: `Resident ${overrides.rowNumber}`,
    residentType: "Owner",
    primaryMobile: "9876500001",
    additionalMobiles: [],
    customFields: [],
    ...overrides,
  };
}

function willImport(
  rowNumber: number,
  overrides: Partial<ResidentImportMappedRowSnapshot> = {},
): ResidentImportPlanWillImportRow {
  return {
    rowNumber,
    validationStatus: "VALID_NEW",
    decision: "IMPORT_NEW",
    decisionReason: "DEFAULT_VALID_NEW",
    decisionSource: "Valid row selected for import as a new resident.",
    mapped: mapped({ rowNumber, ...overrides }),
  };
}

function willSkip(
  rowNumber: number,
  overrides: Partial<ResidentImportPlanWillSkipRow> = {},
): ResidentImportPlanWillSkipRow {
  return {
    rowNumber,
    validationStatus: overrides.validationStatus ?? "VALID_NEW",
    decision: "SKIP",
    decisionReason: overrides.decisionReason ?? "MANUAL_SKIP_VALID",
    reason: overrides.reason ?? "This valid row was skipped by the Admin.",
    isBlocked: overrides.isBlocked ?? false,
    blockReason: overrides.blockReason ?? null,
  };
}

function plan(input: {
  importRows?: ResidentImportPlanWillImportRow[];
  skipRows?: ResidentImportPlanWillSkipRow[];
}): ResidentImportPlan {
  const willImportRows = input.importRows ?? [willImport(2)];
  const skipRows = input.skipRows ?? [];
  return {
    version: 1,
    summary: {
      totalExcelRows: willImportRows.length + skipRows.length,
      willImport: willImportRows.length,
      willSkip: skipRows.length,
      validSelectedForImport: willImportRows.length,
      conflictsApprovedAsSeparate: 0,
      duplicatesSkipped: skipRows.filter((row) => row.blockReason === "INTRA_FILE_DUPLICATE")
        .length,
      invalidSkipped: skipRows.filter((row) => row.blockReason === "INVALID").length,
      backendBlockedSkipped: skipRows.filter(
        (row) => row.blockReason === "BACKEND_FLAT_LIMITATION",
      ).length,
      manualSkips: skipRows.filter((row) => row.decisionReason === "MANUAL_SKIP_VALID").length,
    },
    willImport: willImportRows,
    willSkip: skipRows,
    databaseAwareVerification: "deferred",
  };
}

function verifyRow(
  rowNumber: number,
  status: ResidentImportDatabaseStatus,
): ResidentImportDatabaseRowResult {
  return {
    rowNumber,
    status,
    databaseStatusLabel: status,
    decisionLabel: status,
    message: status,
    matchedFields: [],
    existingResident: null,
  };
}

function verification(
  currentPlan: ResidentImportPlan,
  statuses: Array<[number, ResidentImportDatabaseStatus]>,
): ResidentImportDatabaseVerificationResult {
  return attachResidentImportVerifyFingerprint(
    {
      version: 1,
      readOnly: true,
      summary: {
        rowsChecked: statuses.length,
        readyToImport: statuses.filter(([, status]) => status === "READY_TO_IMPORT").length,
        alreadyExists: statuses.filter(([, status]) => status === "ALREADY_EXISTS").length,
        possibleConflicts: statuses.filter(
          ([, status]) => status === "POSSIBLE_DATABASE_CONFLICT",
        ).length,
        backendBlocked: statuses.filter(([, status]) => status === "BACKEND_BLOCKED").length,
      },
      rows: statuses.map(([rowNumber, status]) => verifyRow(rowNumber, status)),
    },
    currentPlan,
  );
}

function staleVerification(
  currentPlan: ResidentImportPlan,
): ResidentImportDatabaseVerificationResult {
  const fresh = verification(currentPlan, [[2, "READY_TO_IMPORT"]]);
  return { ...fresh, planFingerprint: "stale-fingerprint" };
}

test("confirm UI helpers stay aligned with confirm and verify modules", () => {
  const current = plan({});
  const verified = verification(current, [[2, "READY_TO_IMPORT"]]);
  const stale = staleVerification(current);
  assert.equal(
    isFreshResidentImportVerification(current, verified),
    !isResidentImportVerificationStale(current, verified),
  );
  assert.equal(
    isFreshResidentImportVerification(current, stale),
    !isResidentImportVerificationStale(current, stale),
  );
  assert.equal(RESIDENT_IMPORT_CONFIRM_VERSION, 1);
  assert.deepEqual([...RESIDENT_IMPORT_CONFIRM_STATUSES], [
    "IMPORTED",
    "ALREADY_EXISTS",
    "POSSIBLE_DATABASE_CONFLICT",
    "BACKEND_BLOCKED",
    "INVALID",
    "FAILED",
  ]);
  assert.equal(
    mapResidentImportConfirmApplicationResult("POSSIBLE_DATABASE_CONFLICT"),
    "CONFLICT",
  );
  assert.equal(
    DATABASE_VERIFICATION_REQUIRED_MESSAGE,
    "Database verification must be completed before import.",
  );
});

test("1. Confirm disabled before database verification", () => {
  const current = plan({});
  assert.equal(
    canConfirmResidentImport({ plan: current, verification: null }),
    false,
  );
});

test("2. Confirm enabled after fresh successful verification", () => {
  const current = plan({ importRows: [willImport(2), willImport(3)] });
  const verified = verification(current, [
    [2, "READY_TO_IMPORT"],
    [3, "READY_TO_IMPORT"],
  ]);
  assert.equal(
    canConfirmResidentImport({ plan: current, verification: verified }),
    true,
  );
});

test("3. stale verification disables Confirm", () => {
  const current = plan({});
  assert.equal(
    canConfirmResidentImport({
      plan: current,
      verification: staleVerification(current),
    }),
    false,
  );
  assert.equal(
    canConfirmResidentImport({
      plan: current,
      verificationState: {
        status: "stale",
        result: verification(current, [[2, "READY_TO_IMPORT"]]),
        verifiedFingerprint: "leftover",
      },
    }),
    false,
  );
});

test("4. zero READY_TO_IMPORT rows keeps Confirm disabled", () => {
  const current = plan({ importRows: [willImport(2), willImport(3)] });
  const verified = verification(current, [
    [2, "ALREADY_EXISTS"],
    [3, "POSSIBLE_DATABASE_CONFLICT"],
  ]);
  assert.equal(
    canConfirmResidentImport({ plan: current, verification: verified }),
    false,
  );
  assert.equal(
    selectResidentImportReadyRows({ plan: current, verification: verified }).length,
    0,
  );
});

test("5. confirmation modal opens", () => {
  const opened = openResidentImportConfirmDialog(
    createResidentImportConfirmFlowState(),
  );
  assert.equal(opened.dialogOpen, true);
  assert.equal(CONFIRM_IMPORT_DIALOG_TITLE, "Confirm Resident Import");
  assert.match(
    formatResidentImportConfirmDialogMessage(2),
    /You are about to import 2 resident\(s\)\./,
  );
});

test("6. cancel does not invoke confirm function", () => {
  const opened = openResidentImportConfirmDialog(
    createResidentImportConfirmFlowState(),
  );
  const cancelled = cancelResidentImportConfirmDialog(opened);
  const attempt = beginResidentImportConfirm(cancelled);
  assert.equal(cancelled.dialogOpen, false);
  assert.equal(attempt.shouldInvoke, false);
  assert.equal(CONFIRM_IMPORT_DIALOG_CANCEL_LABEL, "Cancel");
});

test("7. explicit confirm invokes Edge Function once", () => {
  const opened = openResidentImportConfirmDialog(
    createResidentImportConfirmFlowState(),
  );
  const first = beginResidentImportConfirm(opened);
  assert.equal(first.shouldInvoke, true);
  assert.equal(first.state.isImporting, true);
  assert.equal(CONFIRM_IMPORT_DIALOG_CONFIRM_LABEL, "Confirm Import");
});

test("8. double submit blocked", () => {
  const opened = openResidentImportConfirmDialog(
    createResidentImportConfirmFlowState(),
  );
  const first = beginResidentImportConfirm(opened);
  const second = beginResidentImportConfirm(first.state);
  assert.equal(first.shouldInvoke, true);
  assert.equal(second.shouldInvoke, false);
});

test("9. only READY_TO_IMPORT rows sent", () => {
  const current = plan({
    importRows: [willImport(2), willImport(3), willImport(4)],
    skipRows: [willSkip(5, { blockReason: "INVALID", validationStatus: "INVALID" })],
  });
  const verified = verification(current, [
    [2, "READY_TO_IMPORT"],
    [3, "ALREADY_EXISTS"],
    [4, "POSSIBLE_DATABASE_CONFLICT"],
  ]);
  const request = buildResidentImportConfirmRequest({
    plan: current,
    verification: verified,
  });
  assert.deepEqual(
    request.rows.map((row) => row.rowNumber),
    [2],
  );
});

test("10. society spoof values not relied upon", () => {
  const current = plan({});
  const verified = verification(current, [[2, "READY_TO_IMPORT"]]);
  const request = buildResidentImportConfirmRequest({
    plan: current,
    verification: verified,
    spoofSocietyId: "11111111-1111-1111-1111-111111111102",
    societyId: "spoofed-society",
    society_id: "spoofed-society",
    society_code: "DEMO2",
  });
  const serialized = JSON.stringify(request);
  assert.equal("society_id" in request, false);
  assert.equal("societyId" in request, false);
  assert.equal("society_code" in request, false);
  assert.equal(serialized.includes("society_id"), false);
  assert.equal(serialized.includes("societyId"), false);
  assert.equal(serialized.includes("DEMO2"), false);
  assert.equal(serialized.includes("additionalMobiles"), false);

  const serviceSource = readFileSync(CONFIRM_SERVICE_PATH, "utf8");
  assert.match(serviceSource, /RESIDENT_IMPORT_CONFIRM_FUNCTION_NAME/);
  assert.equal(RESIDENT_IMPORT_CONFIRM_FUNCTION_NAME, "admin-resident-import-confirm");
  assert.equal(serviceSource.includes(".rpc("), false);
  assert.equal(serviceSource.includes("society_id"), false);
});

test("11. IMPORTED result displayed", () => {
  assert.equal(
    formatResidentImportConfirmResultLabel("IMPORTED"),
    "Imported Successfully",
  );
});

test("12. ALREADY_EXISTS displayed", () => {
  assert.equal(
    formatResidentImportConfirmResultLabel("ALREADY_EXISTS"),
    "Already Exists — Not Imported",
  );
});

test("13. conflict result displayed", () => {
  assert.equal(
    formatResidentImportConfirmResultLabel("POSSIBLE_DATABASE_CONFLICT"),
    "Needs Review — Not Imported",
  );
});

test("14. backend blocked displayed", () => {
  assert.equal(
    formatResidentImportConfirmResultLabel("BACKEND_BLOCKED"),
    "Cannot Import",
  );
});

test("15. invalid displayed", () => {
  assert.equal(
    formatResidentImportConfirmResultLabel("INVALID"),
    "Invalid — Not Imported",
  );
});

test("16. failed displayed", () => {
  assert.equal(
    formatResidentImportConfirmResultLabel("FAILED"),
    "Import Failed",
  );
});

test("17. partial import summary", () => {
  const current = plan({
    importRows: [willImport(2, { flatNumber: "101" }), willImport(3, { flatNumber: "102" })],
  });
  const verified = verification(current, [
    [2, "READY_TO_IMPORT"],
    [3, "READY_TO_IMPORT"],
  ]);
  const parsed = parseResidentImportConfirmClientResponse({
    version: 1,
    rows: [
      { rowNumber: 2, status: "IMPORTED", message: "Resident created in this society." },
      { rowNumber: 3, status: "FAILED", message: "duplicate key value violates unique constraint" },
    ],
  });
  assert.ok(parsed);
  if (!parsed) {
    return;
  }
  const view = buildResidentImportConfirmUiView({
    plan: current,
    verification: verified,
    batch: parsed,
  });
  assert.equal(view.summary.title, "Partial Import Completed");
  assert.equal(view.summary.explanation, PARTIAL_IMPORT_EXPLANATION);
  assert.equal(view.rows[1]?.resultLabel, "Import Failed");
  assert.equal(
    view.rows[1]?.message.includes("duplicate key"),
    false,
  );
});

test("18. totals reconcile", () => {
  const current = plan({
    importRows: [willImport(2), willImport(3)],
    skipRows: [
      willSkip(4, { decisionReason: "MANUAL_SKIP_VALID" }),
      willSkip(5, {
        blockReason: "INTRA_FILE_DUPLICATE",
        validationStatus: "INTRA_FILE_DUPLICATE",
      }),
      willSkip(6, { blockReason: "INVALID", validationStatus: "INVALID" }),
      willSkip(7, { decisionReason: "DEFAULT_CONFLICT_SKIP" }),
    ],
  });
  const verified = verification(current, [
    [2, "READY_TO_IMPORT"],
    [3, "READY_TO_IMPORT"],
  ]);
  const parsed = parseResidentImportConfirmClientResponse({
    rows: [
      { rowNumber: 2, status: "IMPORTED", message: "Resident created in this society." },
      { rowNumber: 3, status: "ALREADY_EXISTS", message: "Already exists." },
    ],
  });
  assert.ok(parsed);
  if (!parsed) {
    return;
  }
  const view = buildResidentImportConfirmUiView({
    plan: current,
    verification: verified,
    batch: parsed,
  });
  assert.equal(view.summary.totalSubmitted, 2);
  assert.equal(view.summary.importedSuccessfully, 1);
  assert.equal(view.summary.alreadyExists, 1);
  assert.equal(view.summary.reconciles, true);
  assert.equal(
    view.summary.importedSuccessfully +
      view.summary.alreadyExists +
      view.summary.needsReview +
      view.summary.cannotImport +
      view.summary.invalid +
      view.summary.failed,
    view.summary.totalSubmitted,
  );
  assert.equal(view.summary.notSubmitted.skipped, 1);
  assert.equal(view.summary.notSubmitted.duplicate, 1);
  assert.equal(view.summary.notSubmitted.invalid, 1);
  assert.equal(view.summary.notSubmitted.conflict, 1);
  assert.equal(
    view.notSubmittedRows.every((row) => row.label.includes("Not Submitted")),
    true,
  );
});

test("19. successful rows not resubmitted", () => {
  const current = plan({ importRows: [willImport(2), willImport(3)] });
  const verified = verification(current, [
    [2, "READY_TO_IMPORT"],
    [3, "READY_TO_IMPORT"],
  ]);
  const parsed = parseResidentImportConfirmClientResponse({
    rows: [
      { rowNumber: 2, status: "IMPORTED", message: "Resident created in this society." },
      { rowNumber: 3, status: "FAILED", message: "Import failed." },
    ],
  });
  assert.ok(parsed);
  if (!parsed) {
    return;
  }
  const view = buildResidentImportConfirmUiView({
    plan: current,
    verification: verified,
    batch: parsed,
  });
  const next = completeResidentImportConfirm(
    beginResidentImportConfirm(
      openResidentImportConfirmDialog(createResidentImportConfirmFlowState()),
    ).state,
    view,
  );
  const request = buildResidentImportConfirmRequest({
    plan: current,
    verification: verified,
    excludeRowNumbers: next.completedRowNumbers,
  });
  assert.deepEqual(
    request.rows.map((row) => row.rowNumber),
    [3],
  );
  assert.equal(
    canConfirmResidentImport({
      plan: current,
      verification: verified,
      excludeRowNumbers: next.completedRowNumbers,
    }),
    true,
  );
});

test("20. unsupported-field warning shown where applicable", () => {
  const withExtras = plan({
    importRows: [
      willImport(2, {
        additionalMobiles: ["9876501999"],
        customFields: [
          {
            name: "Parking Slot",
            fieldType: "text",
            required: false,
            displayValue: "P-101",
          },
        ],
      }),
    ],
  });
  const withoutExtras = plan({ importRows: [willImport(2)] });
  assert.equal(residentImportHasUnsupportedPersistedFields(withExtras), true);
  assert.equal(
    residentImportUnsupportedFieldsWarning(withExtras),
    RESIDENT_IMPORT_UNSUPPORTED_FIELDS_WARNING,
  );
  assert.equal(residentImportHasUnsupportedPersistedFields(withoutExtras), false);
  assert.equal(residentImportUnsupportedFieldsWarning(withoutExtras), null);
});

test("21. Resident Management navigation action", () => {
  assert.equal(BACK_TO_RESIDENT_MANAGEMENT_LABEL, "Back to Resident Management");
  assert.equal(IMPORT_ANOTHER_EXCEL_FILE_LABEL, "Import Another Excel File");
  const screen = readFileSync(IMPORT_SCREEN_PATH, "utf8");
  const resultSection = readFileSync(IMPORT_RESULT_SECTION_PATH, "utf8");
  assert.match(screen, /\/\(admin\)\/residents/);
  assert.match(resultSection, /BACK_TO_RESIDENT_MANAGEMENT_LABEL/);
});

test("22. new file/reset clears imported result state", () => {
  const current = plan({});
  const verified = verification(current, [[2, "READY_TO_IMPORT"]]);
  const parsed = parseResidentImportConfirmClientResponse({
    rows: [{ rowNumber: 2, status: "IMPORTED", message: "Resident created in this society." }],
  });
  assert.ok(parsed);
  if (!parsed) {
    return;
  }
  const imported = completeResidentImportConfirm(
    beginResidentImportConfirm(
      openResidentImportConfirmDialog(createResidentImportConfirmFlowState()),
    ).state,
    buildResidentImportConfirmUiView({
      plan: current,
      verification: verified,
      batch: parsed,
    }),
  );
  assert.ok(imported.result);
  const reset = resetResidentImportConfirmFlow();
  assert.equal(reset.result, null);
  assert.deepEqual(reset.importedRowNumbers, []);
  assert.deepEqual(reset.completedRowNumbers, []);
  assert.equal(reset.dialogOpen, false);
  assert.equal(reset.isImporting, false);
  assert.equal(reset.requestError, null);
});

test("request-level failure does not mark rows imported", () => {
  const opened = openResidentImportConfirmDialog(
    createResidentImportConfirmFlowState(),
  );
  const started = beginResidentImportConfirm(opened);
  const failed = failResidentImportConfirm(
    started.state,
    "duplicate key value violates unique constraint residents_pkey",
  );
  assert.equal(failed.isImporting, false);
  assert.equal(failed.result, null);
  assert.deepEqual(failed.importedRowNumbers, []);
  assert.equal(failed.requestError, RESIDENT_IMPORT_CONFIRM_REQUEST_FAILED_MESSAGE);
});

test("wired UI uses the deployed confirm function and does not hard-disable Confirm", () => {
  const section = readFileSync(IMPORT_PLAN_SECTION_PATH, "utf8");
  const screen = readFileSync(IMPORT_SCREEN_PATH, "utf8");
  assert.match(section, /confirmEnabled/);
  assert.equal(section.includes("disabled\n"), false);
  assert.match(screen, /confirmResidentImportRows/);
  assert.match(screen, /prepareResidentImportConfirm/);
  assert.equal(RESIDENT_IMPORT_CONFIRM_FUNCTION_NAME, "admin-resident-import-confirm");
});

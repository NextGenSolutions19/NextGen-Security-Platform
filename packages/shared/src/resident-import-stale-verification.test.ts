import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE,
  canConfirmResidentImport,
  completeResidentImportVerification,
  createResidentImportConfirmFlowState,
  createResidentImportVerificationState,
  displayedResidentImportVerification,
  markResidentImportVerificationStale,
  prepareResidentImportConfirm,
  requestResidentImportConfirmDialog,
  reviewImportPlanDoesNotRestoreVerification,
} from "./resident-import-confirm-ui.ts";
import {
  attachResidentImportVerifyFingerprint,
  classifyResidentImportAgainstDatabase,
  isResidentImportVerificationStale,
  proposedRowsForDatabaseVerification,
  residentImportVerifyFingerprint,
  summarizeResidentImportDatabaseVerification,
  type ResidentImportDatabaseRowResult,
  type ResidentImportDatabaseStatus,
  type ResidentImportDatabaseVerificationResult,
} from "./resident-import-db-verify.ts";
import {
  buildResidentImportPlan,
  createResidentImportDecisionSnapshot,
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
const IMPORT_SCREEN_PATH = join(
  ROOT,
  "apps/mobile/app/(admin)/excel-import.tsx",
);
const IMPORT_PLAN_SECTION_PATH = join(
  ROOT,
  "apps/mobile/src/features/admin-excel-import/ImportPlanSection.tsx",
);
const CONFIRM_UI_PATH = join(
  ROOT,
  "packages/shared/src/resident-import-confirm-ui.ts",
);

const BACKEND_14_MARKER = "BACKEND-VERIFY-14-ROW-PLAN";
const BACKEND_13_MARKER = "BACKEND-VERIFY-13-ROW-PLAN";

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
  return {
    workbook: parsed.result,
    mapping,
    validation,
    decisions,
    plan,
    byCase,
  };
}

function rebuildPlan(
  fixture: ReturnType<typeof loadFixturePlan>,
  decisions: ReturnType<typeof createResidentImportDecisionSnapshot>,
) {
  const plan = buildResidentImportPlan({
    workbook: fixture.workbook,
    mapping: fixture.mapping,
    validation: fixture.validation,
    decisions,
  });
  assert.ok(plan);
  if (!plan) {
    throw new Error("expected rebuilt plan");
  }
  return plan;
}

function backendRow(
  rowNumber: number,
  status: ResidentImportDatabaseStatus,
  message: string,
): ResidentImportDatabaseRowResult {
  return {
    rowNumber,
    status,
    databaseStatusLabel:
      status === "READY_TO_IMPORT"
        ? "Ready to Import"
        : status === "ALREADY_EXISTS"
          ? "Already Exists"
          : status === "BACKEND_BLOCKED"
            ? "Backend Blocked"
            : "Possible Conflict",
    decisionLabel:
      status === "READY_TO_IMPORT" ? "Import New" : "Cannot Import",
    message,
    matchedFields: status === "ALREADY_EXISTS" ? ["flatNumber"] : [],
    existingResident: null,
  };
}

function backendVerificationResult(
  plan: NonNullable<ReturnType<typeof buildResidentImportPlan>>,
  message: string,
  alreadyExistsRowNumber?: number,
): Omit<ResidentImportDatabaseVerificationResult, "planFingerprint"> {
  const rows = plan.willImport.map((row) =>
    backendRow(
      row.rowNumber,
      row.rowNumber === alreadyExistsRowNumber
        ? "ALREADY_EXISTS"
        : "READY_TO_IMPORT",
      message,
    ),
  );
  return {
    version: 1,
    readOnly: true,
    summary: summarizeResidentImportDatabaseVerification(rows),
    rows,
  };
}

function verifyFromBackend(
  plan: NonNullable<ReturnType<typeof buildResidentImportPlan>>,
  message: string,
  alreadyExistsRowNumber?: number,
) {
  return completeResidentImportVerification({
    sentPlan: plan,
    currentPlan: plan,
    backendResult: backendVerificationResult(
      plan,
      message,
      alreadyExistsRowNumber,
    ),
  });
}

function locallyFilterVerificationOntoPlan(
  previous: ResidentImportDatabaseVerificationResult,
  nextPlan: NonNullable<ReturnType<typeof buildResidentImportPlan>>,
): ResidentImportDatabaseVerificationResult {
  const selected = new Set(nextPlan.willImport.map((row) => row.rowNumber));
  const rows = previous.rows.filter((row) => selected.has(row.rowNumber));
  return attachResidentImportVerifyFingerprint(
    {
      version: previous.version,
      readOnly: true,
      rows,
      summary: summarizeResidentImportDatabaseVerification(rows),
    },
    nextPlan,
  );
}

function skipImportRow(
  fixture: ReturnType<typeof loadFixturePlan>,
  rowNumber: number,
) {
  const skipped = setResidentImportRowDecision(
    fixture.decisions,
    fixture.validation.rows,
    rowNumber,
    "SKIP",
  );
  assert.equal(skipped.ok, true);
  if (!skipped.ok) {
    throw new Error("expected skip to succeed");
  }
  return {
    rowNumber,
    nextPlan: rebuildPlan(fixture, skipped.snapshot),
    snapshot: skipped.snapshot,
  };
}

function alreadyExistsImportRow(
  plan: NonNullable<ReturnType<typeof buildResidentImportPlan>>,
) {
  const existsRow = plan.willImport[plan.willImport.length - 1];
  assert.ok(existsRow);
  return existsRow;
}

test("1. Verify default import plan becomes VERIFIED from the backend result", () => {
  const fixture = loadFixturePlan();
  assert.equal(fixture.plan.willImport.length, 16);

  const existsRow = alreadyExistsImportRow(fixture.plan);
  const verified = verifyFromBackend(
    fixture.plan,
    BACKEND_14_MARKER,
    existsRow.rowNumber,
  );

  assert.equal(verified.status, "verified");
  assert.ok(verified.result);
  assert.ok(verified.verifiedFingerprint);
  assert.equal(
    verified.verifiedFingerprint,
    residentImportVerifyFingerprint(fixture.plan),
  );
  assert.equal(verified.result.summary.rowsChecked, 16);
  assert.equal(verified.result.summary.readyToImport, 15);
  assert.equal(verified.result.summary.alreadyExists, 1);
  assert.equal(
    verified.result.rows.every((row) => row.message === BACKEND_14_MARKER),
    true,
  );
  const displayed = displayedResidentImportVerification(verified, fixture.plan);
  assert.ok(displayed);
  assert.equal(displayed.summary.rowsChecked, 16);
  assert.equal(
    canConfirmResidentImport({
      plan: fixture.plan,
      verificationState: verified,
    }),
    true,
  );
  const prepared = prepareResidentImportConfirm({
    plan: fixture.plan,
    verificationState: verified,
  });
  assert.equal(prepared.ok, true);
});

test("2-6. Import New -> Skip immediately clears verification and blocks confirm/modal", () => {
  const fixture = loadFixturePlan();
  const existsRow = alreadyExistsImportRow(fixture.plan);
  const verified = verifyFromBackend(
    fixture.plan,
    BACKEND_14_MARKER,
    existsRow.rowNumber,
  );
  const skipped = skipImportRow(fixture, existsRow.rowNumber);
  assert.equal(skipped.nextPlan.willImport.length, 15);

  const stale = markResidentImportVerificationStale();
  assert.equal(stale.status, "stale");
  assert.equal(stale.result, null);
  assert.equal(stale.verifiedFingerprint, null);

  const displayed = displayedResidentImportVerification(stale, skipped.nextPlan);
  assert.equal(displayed, null);

  const leftoverDisplayed = displayedResidentImportVerification(
    verified,
    skipped.nextPlan,
  );
  assert.equal(leftoverDisplayed, null);

  const filtered = locallyFilterVerificationOntoPlan(
    verified.result!,
    skipped.nextPlan,
  );
  assert.equal(filtered.summary.rowsChecked, 15);
  assert.equal(filtered.summary.readyToImport, 15);
  assert.equal(filtered.summary.alreadyExists, 0);
  assert.equal(
    displayedResidentImportVerification(
      {
        status: "stale",
        result: filtered,
        verifiedFingerprint: filtered.planFingerprint,
      },
      skipped.nextPlan,
    ),
    null,
    "stale state must not show a locally filtered reduced-row summary",
  );

  assert.equal(
    canConfirmResidentImport({
      plan: skipped.nextPlan,
      verificationState: stale,
    }),
    false,
  );
  const prepared = prepareResidentImportConfirm({
    plan: skipped.nextPlan,
    verificationState: stale,
  });
  assert.equal(prepared.ok, false);
  if (!prepared.ok) {
    assert.equal(prepared.code, "STALE_VERIFICATION");
    assert.equal(prepared.message, CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE);
  }
  const opened = requestResidentImportConfirmDialog(
    createResidentImportConfirmFlowState(),
    prepared.ok,
  );
  assert.equal(opened.dialogOpen, false);
});

test("7. Review Import Plan does not restore verification", () => {
  const fixture = loadFixturePlan();
  const existsRow = alreadyExistsImportRow(fixture.plan);
  const verified = verifyFromBackend(
    fixture.plan,
    BACKEND_14_MARKER,
    existsRow.rowNumber,
  );
  const skipped = skipImportRow(fixture, existsRow.rowNumber);
  const stale = markResidentImportVerificationStale();

  const afterReview = reviewImportPlanDoesNotRestoreVerification(
    stale,
    skipped.nextPlan,
  );
  assert.equal(afterReview.status, "stale");
  assert.equal(afterReview.result, null);
  assert.equal(afterReview.verifiedFingerprint, null);
  assert.equal(
    displayedResidentImportVerification(afterReview, skipped.nextPlan),
    null,
  );
  assert.equal(
    canConfirmResidentImport({
      plan: skipped.nextPlan,
      verificationState: afterReview,
    }),
    false,
  );

  const leftoverAfterReview = reviewImportPlanDoesNotRestoreVerification(
    verified,
    skipped.nextPlan,
  );
  assert.equal(leftoverAfterReview.status, "stale");
  assert.equal(leftoverAfterReview.result, null);

  const unchangedReview = reviewImportPlanDoesNotRestoreVerification(
    verified,
    fixture.plan,
  );
  assert.equal(unchangedReview.status, "verified");
  assert.equal(unchangedReview.result?.summary.rowsChecked, 16);
});

test("8-9. only a new explicit backend verification restores VERIFIED for the reduced plan", () => {
  const fixture = loadFixturePlan();
  const existsRow = alreadyExistsImportRow(fixture.plan);
  const verified14 = verifyFromBackend(
    fixture.plan,
    BACKEND_14_MARKER,
    existsRow.rowNumber,
  );
  const skipped = skipImportRow(fixture, existsRow.rowNumber);
  const stale = markResidentImportVerificationStale();
  assert.equal(
    prepareResidentImportConfirm({
      plan: skipped.nextPlan,
      verificationState: stale,
    }).ok,
    false,
  );

  const filtered = locallyFilterVerificationOntoPlan(
    verified14.result!,
    skipped.nextPlan,
  );
  assert.equal(filtered.summary.rowsChecked, 15);
  assert.equal(
    filtered.rows.every((row) => row.message === BACKEND_14_MARKER),
    true,
  );

  const restored = completeResidentImportVerification({
    sentPlan: skipped.nextPlan,
    currentPlan: skipped.nextPlan,
    backendResult: backendVerificationResult(
      skipped.nextPlan,
      BACKEND_13_MARKER,
    ),
  });
  assert.equal(restored.status, "verified");
  assert.ok(restored.result);
  assert.equal(restored.result.summary.rowsChecked, 15);
  assert.equal(restored.result.summary.readyToImport, 15);
  assert.equal(restored.result.summary.alreadyExists, 0);
  assert.equal(
    restored.result.rows.every((row) => row.message === BACKEND_13_MARKER),
    true,
  );
  assert.equal(
    restored.result.rows.some((row) => row.message === BACKEND_14_MARKER),
    false,
  );
  assert.notEqual(restored.result.rows, filtered.rows);
  assert.equal(
    restored.verifiedFingerprint,
    residentImportVerifyFingerprint(skipped.nextPlan),
  );

  const displayed = displayedResidentImportVerification(
    restored,
    skipped.nextPlan,
  );
  assert.ok(displayed);
  assert.equal(displayed.summary.rowsChecked, 15);
  assert.equal(
    displayed.rows.every((row) => row.message === BACKEND_13_MARKER),
    true,
  );
  assert.equal(
    canConfirmResidentImport({
      plan: skipped.nextPlan,
      verificationState: restored,
    }),
    true,
  );
});

test("10. final handler rejects stale state even if UI is bypassed", () => {
  const fixture = loadFixturePlan();
  const existsRow = alreadyExistsImportRow(fixture.plan);
  const verified = verifyFromBackend(
    fixture.plan,
    BACKEND_14_MARKER,
    existsRow.rowNumber,
  );
  const skipped = skipImportRow(fixture, existsRow.rowNumber);

  const bypassedWithOldState = prepareResidentImportConfirm({
    plan: skipped.nextPlan,
    verificationState: verified,
  });
  assert.equal(bypassedWithOldState.ok, false);
  if (!bypassedWithOldState.ok) {
    assert.equal(bypassedWithOldState.code, "STALE_VERIFICATION");
    assert.equal("request" in bypassedWithOldState, false);
  }

  const bypassedWithOldResult = prepareResidentImportConfirm({
    plan: skipped.nextPlan,
    verification: verified.result,
  });
  assert.equal(bypassedWithOldResult.ok, false);
  if (!bypassedWithOldResult.ok) {
    assert.equal(bypassedWithOldResult.code, "STALE_VERIFICATION");
  }

  const filtered = locallyFilterVerificationOntoPlan(
    verified.result!,
    skipped.nextPlan,
  );
  const bypassedWithFiltered = prepareResidentImportConfirm({
    plan: skipped.nextPlan,
    verificationState: markResidentImportVerificationStale(),
  });
  assert.equal(bypassedWithFiltered.ok, false);
  assert.equal(filtered.summary.rowsChecked, 15);

  const opened = requestResidentImportConfirmDialog(
    createResidentImportConfirmFlowState(),
    bypassedWithOldState.ok,
  );
  assert.equal(opened.dialogOpen, false);
});

test("in-flight verify for a previous plan is discarded after a plan change", () => {
  const fixture = loadFixturePlan();
  const skipped = skipImportRow(
    fixture,
    alreadyExistsImportRow(fixture.plan).rowNumber,
  );
  const discarded = completeResidentImportVerification({
    sentPlan: fixture.plan,
    currentPlan: skipped.nextPlan,
    backendResult: backendVerificationResult(fixture.plan, BACKEND_14_MARKER),
  });
  assert.equal(discarded.status, "stale");
  assert.equal(discarded.result, null);
  assert.equal(displayedResidentImportVerification(discarded, skipped.nextPlan), null);
});

test("unchanged plan after verification remains eligible for final import", () => {
  const fixture = loadFixturePlan();
  const verification = attachResidentImportVerifyFingerprint(
    classifyResidentImportAgainstDatabase({
      proposed: proposedRowsForDatabaseVerification(fixture.plan),
      existing: [],
      societyId: "society-a",
    }),
    fixture.plan,
  );
  assert.equal(isResidentImportVerificationStale(fixture.plan, verification), false);
  assert.equal(
    canConfirmResidentImport({ plan: fixture.plan, verification }),
    true,
  );
});

test("Skip -> Import New invalidates verification", () => {
  const fixture = loadFixturePlan();
  const skipped = skipImportRow(
    fixture,
    alreadyExistsImportRow(fixture.plan).rowNumber,
  );
  const verified = verifyFromBackend(skipped.nextPlan, BACKEND_13_MARKER);
  const restored = setResidentImportRowDecision(
    skipped.snapshot,
    fixture.validation.rows,
    skipped.rowNumber,
    "IMPORT_NEW",
  );
  assert.equal(restored.ok, true);
  if (!restored.ok) {
    return;
  }
  const nextPlan = rebuildPlan(fixture, restored.snapshot);
  const stale = markResidentImportVerificationStale();
  assert.equal(
    displayedResidentImportVerification(verified, nextPlan),
    null,
  );
  const prepared = prepareResidentImportConfirm({
    plan: nextPlan,
    verificationState: stale,
  });
  assert.equal(prepared.ok, false);
  if (!prepared.ok) {
    assert.equal(prepared.code, "STALE_VERIFICATION");
  }
});

test("Skip conflict -> Import as Separate Resident invalidates verification", () => {
  const fixture = loadFixturePlan();
  const verified = verifyFromBackend(fixture.plan, BACKEND_14_MARKER);
  const testH = fixture.byCase.get("TEST-H");
  assert.ok(testH);
  const approved = setResidentImportRowDecision(
    fixture.decisions,
    fixture.validation.rows,
    testH.rowNumber,
    "IMPORT_NEW_AS_SEPARATE",
  );
  assert.equal(approved.ok, true);
  if (!approved.ok) {
    return;
  }
  const nextPlan = rebuildPlan(fixture, approved.snapshot);
  assert.notEqual(
    residentImportVerifyFingerprint(fixture.plan),
    residentImportVerifyFingerprint(nextPlan),
  );
  assert.equal(displayedResidentImportVerification(verified, nextPlan), null);
  const prepared = prepareResidentImportConfirm({
    plan: nextPlan,
    verificationState: verified,
  });
  assert.equal(prepared.ok, false);
  if (!prepared.ok) {
    assert.equal(prepared.code, "STALE_VERIFICATION");
    assert.equal(prepared.message, CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE);
  }
});

test("changing an import-relevant resident value invalidates verification", () => {
  const fixture = loadFixturePlan();
  const verified = verifyFromBackend(fixture.plan, BACKEND_14_MARKER);
  const changed = {
    ...fixture.plan,
    willImport: fixture.plan.willImport.map((row, index) =>
      index === 0
        ? {
            ...row,
            mapped: {
              ...row.mapped,
              flatNumber: `${row.mapped.flatNumber}-CHANGED`,
              residentType: "Tenant",
            },
          }
        : row,
    ),
  };
  assert.equal(displayedResidentImportVerification(verified, changed), null);
  const prepared = prepareResidentImportConfirm({
    plan: changed,
    verificationState: verified,
  });
  assert.equal(prepared.ok, false);
  if (!prepared.ok) {
    assert.equal(prepared.code, "STALE_VERIFICATION");
  }
});

test("replacing/reselecting workbook invalidates previous verification", () => {
  const fixture = loadFixturePlan();
  const verified = verifyFromBackend(fixture.plan, BACKEND_14_MARKER);
  const otherPlan = {
    ...fixture.plan,
    willImport: fixture.plan.willImport.slice(0, 1),
    willSkip: [
      ...fixture.plan.willSkip,
      ...fixture.plan.willImport.slice(1).map((row) => ({
        rowNumber: row.rowNumber,
        validationStatus: row.validationStatus,
        decision: "SKIP" as const,
        decisionReason: "MANUAL_SKIP_VALID" as const,
        reason: "Replaced workbook.",
        isBlocked: false,
        blockReason: null,
      })),
    ],
  };
  assert.equal(
    canConfirmResidentImport({
      plan: otherPlan,
      verificationState: verified,
    }),
    false,
  );
  assert.equal(
    canConfirmResidentImport({
      plan: otherPlan,
      verificationState: createResidentImportVerificationState(),
    }),
    false,
  );
});

test("screen and plan section never restore or locally rebuild verification", () => {
  const screen = readFileSync(IMPORT_SCREEN_PATH, "utf8");
  const section = readFileSync(IMPORT_PLAN_SECTION_PATH, "utf8");
  const confirmUi = readFileSync(CONFIRM_UI_PATH, "utf8");

  assert.match(screen, /createResidentImportVerificationState/);
  assert.match(screen, /markResidentImportVerificationStale/);
  assert.match(screen, /completeResidentImportVerification/);
  assert.match(screen, /displayedResidentImportVerification/);
  assert.match(screen, /reviewImportPlanDoesNotRestoreVerification/);
  assert.match(screen, /prepareResidentImportConfirm/);
  assert.match(screen, /verificationState/);
  assert.equal(screen.includes("classifyResidentImportAgainstDatabase"), false);
  assert.equal(screen.includes("attachResidentImportVerifyFingerprint"), false);
  assert.equal(screen.includes("summarizeResidentImportDatabaseVerification"), false);
  assert.equal(screen.includes("freshVerification"), false);
  assert.match(section, /verificationStatus === "verified"/);
  assert.match(section, /verificationStatus === "stale"/);
  assert.match(section, /CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE/);
  assert.match(confirmUi, /Never filters a previous result/);
});

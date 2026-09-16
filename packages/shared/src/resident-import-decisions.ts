/**
 * M03-T03 resident import row decisions and local import-plan review (Phase 3C).
 *
 * Validation classifies rows. This module records Admin decisions and the
 * intended import plan. Nothing is written to the database.
 *
 * Database-aware verification (existing residents, exact DB duplicates,
 * archived residents, flat matching) is implemented as a read-only check.
 * Actual writes happen only after database verification and explicit confirmation.
 *
 * Snapshots are JSON-serializable so they can later be stored on
 * resident_import_jobs / resident_import_job_rows — they are not saved
 * remotely in this phase.
 *
 * Type-only imports keep this module loadable by the Node test runner.
 */

import type { SocietyResidentFieldType } from "./resident-import-foundation";
import type { ResidentImportMappingSnapshot } from "./resident-import-mapping";
import type { WorkbookParseResult, WorkbookParsedRow } from "./resident-import-parse";
import type {
  ResidentImportValidatedRow,
  ResidentImportValidationStatus,
  ResidentImportValidationSuccess,
} from "./resident-import-validate";

export const RESIDENT_IMPORT_DECISION_SNAPSHOT_VERSION = 1 as const;
export const RESIDENT_IMPORT_PLAN_VERSION = 1 as const;

export const RESIDENT_IMPORT_DECISIONS = [
  "IMPORT_NEW",
  "IMPORT_NEW_AS_SEPARATE",
  "SKIP",
] as const;

export type ResidentImportDecision = (typeof RESIDENT_IMPORT_DECISIONS)[number];

export const RESIDENT_IMPORT_BLOCK_REASONS = [
  "INVALID",
  "INTRA_FILE_DUPLICATE",
  "BACKEND_FLAT_LIMITATION",
] as const;

export type ResidentImportBlockReason =
  (typeof RESIDENT_IMPORT_BLOCK_REASONS)[number];

export const RESIDENT_IMPORT_DECISION_REASONS = [
  "DEFAULT_VALID_NEW",
  "MANUAL_SKIP_VALID",
  "DEFAULT_CONFLICT_SKIP",
  "APPROVED_SEPARATE_RESIDENT",
  "FORCED_INVALID",
  "FORCED_DUPLICATE",
  "FORCED_BACKEND_LIMITATION",
] as const;

export type ResidentImportDecisionReason =
  (typeof RESIDENT_IMPORT_DECISION_REASONS)[number];

export const RESIDENT_IMPORT_BULK_ACTIONS = [
  "IMPORT_ALL_VALID",
  "SKIP_ALL_VALID",
  "SKIP_ALL_CONFLICTS",
  "RESET",
] as const;

export type ResidentImportBulkAction =
  (typeof RESIDENT_IMPORT_BULK_ACTIONS)[number];

export const BACKEND_FLAT_LIMITATION_BLOCK_MESSAGE =
  "Valid resident data, but this flat requires building-aware database support before it can be imported.";

export const INVALID_ROW_CANNOT_IMPORT_MESSAGE =
  "Correct the Excel file or mapping and validate again.";

export const DUPLICATE_ROW_SKIP_MESSAGE = "Duplicate rows are skipped.";

export const IMPORT_AS_SEPARATE_EXPLANATION =
  "Import as Separate Resident means a distinct resident will be created later. It does not merge, overwrite, replace a phone, or update an existing resident.";

export const DATABASE_VERIFICATION_REQUIRED_MESSAGE =
  "Database verification must be completed before import.";

export const CONFIRM_IMPORT_DISABLED_LABEL = "Confirm & Import Residents";

export type ResidentImportDecisionGateKind =
  | "valid"
  | "overridable_conflict"
  | "blocked_invalid"
  | "blocked_duplicate"
  | "blocked_backend";

export type ResidentImportDecisionGate = {
  kind: ResidentImportDecisionGateKind;
  defaultDecision: ResidentImportDecision;
  allowedDecisions: readonly ResidentImportDecision[];
  isBlocked: boolean;
  blockReason: ResidentImportBlockReason | null;
  blockMessage: string | null;
  defaultReason: ResidentImportDecisionReason;
  decisionLabel: string;
  explanation: string;
};

export type ResidentImportRowDecision = {
  rowNumber: number;
  validationStatus: ResidentImportValidationStatus;
  decision: ResidentImportDecision;
  decisionReason: ResidentImportDecisionReason;
  isBlocked: boolean;
  blockReason: ResidentImportBlockReason | null;
  blockMessage: string | null;
  relatedRowNumbers: number[];
};

export type ResidentImportDecisionSnapshot = {
  version: typeof RESIDENT_IMPORT_DECISION_SNAPSHOT_VERSION;
  rows: ResidentImportRowDecision[];
};

export type ResidentImportMappedCustomField = {
  name: string;
  fieldType: SocietyResidentFieldType;
  required: boolean;
  displayValue: string;
};

export type ResidentImportMappedRowSnapshot = {
  rowNumber: number;
  building: string;
  wing: string;
  flatNumber: string;
  residentName: string;
  residentType: string;
  primaryMobile: string;
  additionalMobiles: string[];
  customFields: ResidentImportMappedCustomField[];
};

export type ResidentImportPlanWillImportRow = {
  rowNumber: number;
  validationStatus: ResidentImportValidationStatus;
  decision: Extract<
    ResidentImportDecision,
    "IMPORT_NEW" | "IMPORT_NEW_AS_SEPARATE"
  >;
  decisionReason: ResidentImportDecisionReason;
  decisionSource: string;
  mapped: ResidentImportMappedRowSnapshot;
};

export type ResidentImportPlanWillSkipRow = {
  rowNumber: number;
  validationStatus: ResidentImportValidationStatus;
  decision: "SKIP";
  decisionReason: ResidentImportDecisionReason;
  reason: string;
  isBlocked: boolean;
  blockReason: ResidentImportBlockReason | null;
};

export type ResidentImportPlanSummary = {
  totalExcelRows: number;
  willImport: number;
  willSkip: number;
  validSelectedForImport: number;
  conflictsApprovedAsSeparate: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  backendBlockedSkipped: number;
  manualSkips: number;
};

export type ResidentImportPlan = {
  version: typeof RESIDENT_IMPORT_PLAN_VERSION;
  summary: ResidentImportPlanSummary;
  willImport: ResidentImportPlanWillImportRow[];
  willSkip: ResidentImportPlanWillSkipRow[];
  databaseAwareVerification: "deferred";
};

export type SetResidentImportDecisionResult =
  | { ok: true; snapshot: ResidentImportDecisionSnapshot }
  | {
      ok: false;
      code: "ROW_NOT_FOUND" | "DECISION_NOT_ALLOWED";
      message: string;
    };

function hasBackendFlatLimitation(row: ResidentImportValidatedRow): boolean {
  return [...row.errors, ...row.warnings].some(
    (issue) => issue.code === "FLAT_IDENTITY_BACKEND_LIMITATION",
  );
}

export function classifyResidentImportDecisionGate(
  row: ResidentImportValidatedRow,
): ResidentImportDecisionGate {
  if (row.status === "INVALID") {
    return {
      kind: "blocked_invalid",
      defaultDecision: "SKIP",
      allowedDecisions: ["SKIP"],
      isBlocked: true,
      blockReason: "INVALID",
      blockMessage: INVALID_ROW_CANNOT_IMPORT_MESSAGE,
      defaultReason: "FORCED_INVALID",
      decisionLabel: "Cannot Import",
      explanation: INVALID_ROW_CANNOT_IMPORT_MESSAGE,
    };
  }

  if (row.status === "INTRA_FILE_DUPLICATE") {
    return {
      kind: "blocked_duplicate",
      defaultDecision: "SKIP",
      allowedDecisions: ["SKIP"],
      isBlocked: true,
      blockReason: "INTRA_FILE_DUPLICATE",
      blockMessage: DUPLICATE_ROW_SKIP_MESSAGE,
      defaultReason: "FORCED_DUPLICATE",
      decisionLabel: "Skip",
      explanation: DUPLICATE_ROW_SKIP_MESSAGE,
    };
  }

  if (row.status === "POSSIBLE_CONFLICT" && hasBackendFlatLimitation(row)) {
    return {
      kind: "blocked_backend",
      defaultDecision: "SKIP",
      allowedDecisions: ["SKIP"],
      isBlocked: true,
      blockReason: "BACKEND_FLAT_LIMITATION",
      blockMessage: BACKEND_FLAT_LIMITATION_BLOCK_MESSAGE,
      defaultReason: "FORCED_BACKEND_LIMITATION",
      decisionLabel: "Cannot Import",
      explanation: BACKEND_FLAT_LIMITATION_BLOCK_MESSAGE,
    };
  }

  if (row.status === "POSSIBLE_CONFLICT") {
    return {
      kind: "overridable_conflict",
      defaultDecision: "SKIP",
      allowedDecisions: ["SKIP", "IMPORT_NEW_AS_SEPARATE"],
      isBlocked: false,
      blockReason: null,
      blockMessage: null,
      defaultReason: "DEFAULT_CONFLICT_SKIP",
      decisionLabel: "Skip",
      explanation: IMPORT_AS_SEPARATE_EXPLANATION,
    };
  }

  return {
    kind: "valid",
    defaultDecision: "IMPORT_NEW",
    allowedDecisions: ["IMPORT_NEW", "SKIP"],
    isBlocked: false,
    blockReason: null,
    blockMessage: null,
    defaultReason: "DEFAULT_VALID_NEW",
    decisionLabel: "Import New",
    explanation: "This row can be imported as a new resident, or skipped.",
  };
}

function reasonForDecision(
  gate: ResidentImportDecisionGate,
  decision: ResidentImportDecision,
): ResidentImportDecisionReason {
  if (gate.kind === "valid") {
    return decision === "SKIP" ? "MANUAL_SKIP_VALID" : "DEFAULT_VALID_NEW";
  }
  if (gate.kind === "overridable_conflict") {
    return decision === "IMPORT_NEW_AS_SEPARATE"
      ? "APPROVED_SEPARATE_RESIDENT"
      : "DEFAULT_CONFLICT_SKIP";
  }
  return gate.defaultReason;
}

function rowDecisionFromGate(
  row: ResidentImportValidatedRow,
  decision: ResidentImportDecision,
  reason: ResidentImportDecisionReason,
): ResidentImportRowDecision {
  const gate = classifyResidentImportDecisionGate(row);
  return {
    rowNumber: row.rowNumber,
    validationStatus: row.status,
    decision,
    decisionReason: reason,
    isBlocked: gate.isBlocked,
    blockReason: gate.blockReason,
    blockMessage: gate.blockMessage,
    relatedRowNumbers: row.relatedRowNumbers,
  };
}

export function createResidentImportDecisionSnapshot(
  rows: readonly ResidentImportValidatedRow[],
): ResidentImportDecisionSnapshot {
  return {
    version: RESIDENT_IMPORT_DECISION_SNAPSHOT_VERSION,
    rows: rows.map((row) => {
      const gate = classifyResidentImportDecisionGate(row);
      return rowDecisionFromGate(row, gate.defaultDecision, gate.defaultReason);
    }),
  };
}

export function resetResidentImportDecisions(
  rows: readonly ResidentImportValidatedRow[],
): ResidentImportDecisionSnapshot {
  return createResidentImportDecisionSnapshot(rows);
}

export function findResidentImportRowDecision(
  snapshot: ResidentImportDecisionSnapshot,
  rowNumber: number,
): ResidentImportRowDecision | undefined {
  return snapshot.rows.find((row) => row.rowNumber === rowNumber);
}

export function setResidentImportRowDecision(
  snapshot: ResidentImportDecisionSnapshot,
  rows: readonly ResidentImportValidatedRow[],
  rowNumber: number,
  decision: ResidentImportDecision,
): SetResidentImportDecisionResult {
  const validated = rows.find((row) => row.rowNumber === rowNumber);
  if (!validated) {
    return {
      ok: false,
      code: "ROW_NOT_FOUND",
      message: `Excel row ${rowNumber} was not found in the validation result.`,
    };
  }

  const gate = classifyResidentImportDecisionGate(validated);
  if (!gate.allowedDecisions.includes(decision)) {
    return {
      ok: false,
      code: "DECISION_NOT_ALLOWED",
      message: gate.isBlocked
        ? (gate.blockMessage ?? "This row cannot be imported.")
        : "That decision is not allowed for this row.",
    };
  }

  return {
    ok: true,
    snapshot: {
      version: RESIDENT_IMPORT_DECISION_SNAPSHOT_VERSION,
      rows: snapshot.rows.map((row) =>
        row.rowNumber === rowNumber
          ? rowDecisionFromGate(
              validated,
              decision,
              reasonForDecision(gate, decision),
            )
          : row,
      ),
    },
  };
}

export function applyResidentImportBulkAction(input: {
  action: ResidentImportBulkAction;
  validationRows: readonly ResidentImportValidatedRow[];
  decisions: ResidentImportDecisionSnapshot;
}): ResidentImportDecisionSnapshot {
  if (input.action === "RESET") {
    return resetResidentImportDecisions(input.validationRows);
  }

  let snapshot = input.decisions;
  for (const row of input.validationRows) {
    const gate = classifyResidentImportDecisionGate(row);
    if (input.action === "IMPORT_ALL_VALID" && gate.kind === "valid") {
      const next = setResidentImportRowDecision(
        snapshot,
        input.validationRows,
        row.rowNumber,
        "IMPORT_NEW",
      );
      if (next.ok) {
        snapshot = next.snapshot;
      }
    }
    if (input.action === "SKIP_ALL_VALID" && gate.kind === "valid") {
      const next = setResidentImportRowDecision(
        snapshot,
        input.validationRows,
        row.rowNumber,
        "SKIP",
      );
      if (next.ok) {
        snapshot = next.snapshot;
      }
    }
    if (
      input.action === "SKIP_ALL_CONFLICTS" &&
      gate.kind === "overridable_conflict"
    ) {
      const next = setResidentImportRowDecision(
        snapshot,
        input.validationRows,
        row.rowNumber,
        "SKIP",
      );
      if (next.ok) {
        snapshot = next.snapshot;
      }
    }
  }
  return snapshot;
}

export function areResidentImportDecisionsComplete(
  rows: readonly ResidentImportValidatedRow[],
  snapshot: ResidentImportDecisionSnapshot,
): boolean {
  if (snapshot.version !== RESIDENT_IMPORT_DECISION_SNAPSHOT_VERSION) {
    return false;
  }
  if (snapshot.rows.length !== rows.length) {
    return false;
  }
  return rows.every((row) => {
    const decision = findResidentImportRowDecision(snapshot, row.rowNumber);
    if (!decision || decision.validationStatus !== row.status) {
      return false;
    }
    const gate = classifyResidentImportDecisionGate(row);
    return gate.allowedDecisions.includes(decision.decision);
  });
}

export function canReviewResidentImportPlan(
  validation: ResidentImportValidationSuccess,
  snapshot: ResidentImportDecisionSnapshot,
): boolean {
  return areResidentImportDecisionsComplete(validation.rows, snapshot);
}

export function formatResidentImportDecision(
  decision: ResidentImportDecision,
  isBlocked: boolean,
): string {
  if (isBlocked) {
    return "Cannot Import";
  }
  switch (decision) {
    case "IMPORT_NEW":
      return "Import New";
    case "IMPORT_NEW_AS_SEPARATE":
      return "Import as Separate Resident";
    case "SKIP":
      return "Skip";
  }
}

function nonBlank(values: readonly string[]): string[] {
  return values.filter((value) => value.trim() !== "");
}

function mappedCustomFields(
  row: WorkbookParsedRow | undefined,
  mapping: ResidentImportMappingSnapshot,
): ResidentImportMappedCustomField[] {
  if (!row) {
    return [];
  }
  const fields: ResidentImportMappedCustomField[] = [];
  for (const column of mapping.columns) {
    if (column.target !== "CUSTOM_FIELD" || !column.customField) {
      continue;
    }
    fields.push({
      name: column.customField.name.trim() || column.header || `Column ${column.excelAddress}`,
      fieldType: column.customField.fieldType,
      required: column.customField.required,
      displayValue: row.displayValues[column.columnIndex] ?? "",
    });
  }
  return fields;
}

export function captureResidentImportMappedRow(
  validated: ResidentImportValidatedRow,
  workbook: WorkbookParseResult,
  mapping: ResidentImportMappingSnapshot,
): ResidentImportMappedRowSnapshot {
  const source = workbook.rows.find(
    (row) => row.rowNumber === validated.rowNumber,
  );
  return {
    rowNumber: validated.rowNumber,
    building: validated.display.building,
    wing: validated.display.wing,
    flatNumber: validated.display.flatNumber,
    residentName: validated.display.residentName,
    residentType: validated.display.residentType,
    primaryMobile: validated.display.primaryMobile,
    additionalMobiles: nonBlank(validated.display.additionalMobiles),
    customFields: mappedCustomFields(source, mapping),
  };
}

function importDecisionSource(decision: ResidentImportRowDecision): string {
  if (decision.decisionReason === "APPROVED_SEPARATE_RESIDENT") {
    return "Conflict approved as a separate resident. This will not merge or overwrite anyone.";
  }
  return "Valid row selected for import as a new resident.";
}

function skipReason(
  validated: ResidentImportValidatedRow,
  decision: ResidentImportRowDecision,
): string {
  if (decision.blockReason === "INVALID") {
    return INVALID_ROW_CANNOT_IMPORT_MESSAGE;
  }
  if (decision.blockReason === "BACKEND_FLAT_LIMITATION") {
    return BACKEND_FLAT_LIMITATION_BLOCK_MESSAGE;
  }
  if (decision.blockReason === "INTRA_FILE_DUPLICATE") {
    const duplicate = validated.warnings.find(
      (issue) => issue.code === "INTRA_FILE_DUPLICATE",
    );
    return duplicate?.message ?? DUPLICATE_ROW_SKIP_MESSAGE;
  }
  if (decision.decisionReason === "MANUAL_SKIP_VALID") {
    return "This valid row was skipped by the Admin.";
  }
  const conflict = validated.warnings[0]?.message;
  return conflict
    ? `${conflict} Skipped until explicitly approved as a separate resident.`
    : "Possible conflict — skipped until explicitly approved as a separate resident.";
}

export function summarizeResidentImportDecisions(
  rows: readonly ResidentImportValidatedRow[],
  snapshot: ResidentImportDecisionSnapshot,
): ResidentImportPlanSummary {
  const byNumber = new Map(
    snapshot.rows.map((row) => [row.rowNumber, row]),
  );
  let validSelectedForImport = 0;
  let conflictsApprovedAsSeparate = 0;
  let duplicatesSkipped = 0;
  let invalidSkipped = 0;
  let backendBlockedSkipped = 0;
  let manualSkips = 0;

  for (const row of rows) {
    const decision = byNumber.get(row.rowNumber);
    if (!decision) {
      continue;
    }
    const gate = classifyResidentImportDecisionGate(row);
    if (gate.kind === "valid" && decision.decision === "IMPORT_NEW") {
      validSelectedForImport += 1;
      continue;
    }
    if (
      gate.kind === "overridable_conflict" &&
      decision.decision === "IMPORT_NEW_AS_SEPARATE"
    ) {
      conflictsApprovedAsSeparate += 1;
      continue;
    }
    if (gate.kind === "blocked_duplicate") {
      duplicatesSkipped += 1;
      continue;
    }
    if (gate.kind === "blocked_invalid") {
      invalidSkipped += 1;
      continue;
    }
    if (gate.kind === "blocked_backend") {
      backendBlockedSkipped += 1;
      continue;
    }
    manualSkips += 1;
  }

  const willImport = validSelectedForImport + conflictsApprovedAsSeparate;
  const willSkip =
    duplicatesSkipped + invalidSkipped + backendBlockedSkipped + manualSkips;

  return {
    totalExcelRows: rows.length,
    willImport,
    willSkip,
    validSelectedForImport,
    conflictsApprovedAsSeparate,
    duplicatesSkipped,
    invalidSkipped,
    backendBlockedSkipped,
    manualSkips,
  };
}

export function planSummaryReconciles(summary: ResidentImportPlanSummary): boolean {
  return (
    summary.willImport + summary.willSkip === summary.totalExcelRows &&
    summary.validSelectedForImport +
      summary.conflictsApprovedAsSeparate +
      summary.duplicatesSkipped +
      summary.invalidSkipped +
      summary.backendBlockedSkipped +
      summary.manualSkips ===
      summary.totalExcelRows &&
    summary.willImport ===
      summary.validSelectedForImport + summary.conflictsApprovedAsSeparate
  );
}

export function buildResidentImportPlan(input: {
  workbook: WorkbookParseResult;
  mapping: ResidentImportMappingSnapshot;
  validation: ResidentImportValidationSuccess;
  decisions: ResidentImportDecisionSnapshot;
}): ResidentImportPlan | null {
  if (!canReviewResidentImportPlan(input.validation, input.decisions)) {
    return null;
  }

  const summary = summarizeResidentImportDecisions(
    input.validation.rows,
    input.decisions,
  );
  const willImport: ResidentImportPlanWillImportRow[] = [];
  const willSkip: ResidentImportPlanWillSkipRow[] = [];

  for (const row of input.validation.rows) {
    const decision = findResidentImportRowDecision(
      input.decisions,
      row.rowNumber,
    );
    if (!decision) {
      return null;
    }
    if (
      decision.decision === "IMPORT_NEW" ||
      decision.decision === "IMPORT_NEW_AS_SEPARATE"
    ) {
      willImport.push({
        rowNumber: row.rowNumber,
        validationStatus: row.status,
        decision: decision.decision,
        decisionReason: decision.decisionReason,
        decisionSource: importDecisionSource(decision),
        mapped: captureResidentImportMappedRow(
          row,
          input.workbook,
          input.mapping,
        ),
      });
      continue;
    }
    willSkip.push({
      rowNumber: row.rowNumber,
      validationStatus: row.status,
      decision: "SKIP",
      decisionReason: decision.decisionReason,
      reason: skipReason(row, decision),
      isBlocked: decision.isBlocked,
      blockReason: decision.blockReason,
    });
  }

  return {
    version: RESIDENT_IMPORT_PLAN_VERSION,
    summary,
    willImport,
    willSkip,
    databaseAwareVerification: "deferred",
  };
}

export function serializeResidentImportDecisionSnapshot(
  snapshot: ResidentImportDecisionSnapshot,
): string {
  return JSON.stringify(snapshot);
}

export function parseResidentImportDecisionSnapshot(
  raw: string,
): ResidentImportDecisionSnapshot {
  const parsed = JSON.parse(raw) as ResidentImportDecisionSnapshot;
  if (
    parsed?.version !== RESIDENT_IMPORT_DECISION_SNAPSHOT_VERSION ||
    !Array.isArray(parsed.rows)
  ) {
    throw new Error("Invalid decision snapshot");
  }
  return parsed;
}

export function serializeResidentImportPlan(plan: ResidentImportPlan): string {
  return JSON.stringify(plan);
}

export function parseResidentImportPlan(raw: string): ResidentImportPlan {
  const parsed = JSON.parse(raw) as ResidentImportPlan;
  if (
    parsed?.version !== RESIDENT_IMPORT_PLAN_VERSION ||
    !parsed.summary ||
    !Array.isArray(parsed.willImport) ||
    !Array.isArray(parsed.willSkip)
  ) {
    throw new Error("Invalid import plan");
  }
  return parsed;
}

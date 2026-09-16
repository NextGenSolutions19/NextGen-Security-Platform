/**
 * M03 Excel import — Phase 9 UI confirmation helpers.
 *
 * Pure client-side rules for enablement, payload selection, confirmation
 * copy, and result display. The mobile screen invokes
 * admin-resident-import-confirm; it never calls the RPC directly.
 *
 * Type-only sibling imports keep this module loadable by the Node test runner.
 */

import type {
  ResidentImportConfirmHttpRowResult,
  ResidentImportConfirmHttpSuccess,
  ResidentImportConfirmStatus,
} from "./resident-import-confirm";
import type {
  ResidentImportPlan,
  ResidentImportPlanWillSkipRow,
} from "./resident-import-decisions";
import type {
  ResidentImportDatabaseStatus,
  ResidentImportDatabaseVerificationResult,
} from "./resident-import-db-verify";

const RESIDENT_IMPORT_CONFIRM_STATUSES = [
  "IMPORTED",
  "ALREADY_EXISTS",
  "POSSIBLE_DATABASE_CONFLICT",
  "BACKEND_BLOCKED",
  "INVALID",
  "FAILED",
] as const;

const RESIDENT_IMPORT_CONFIRM_VERSION = 1 as const;

const DATABASE_VERIFICATION_REQUIRED_MESSAGE =
  "Database verification must be completed before import.";

export const RESIDENT_IMPORT_CONFIRM_FUNCTION_NAME =
  "admin-resident-import-confirm" as const;

export const CONFIRM_IMPORT_LABEL = "Confirm & Import Residents";
export const CONFIRM_IMPORT_DIALOG_TITLE = "Confirm Resident Import";
export const CONFIRM_IMPORT_DIALOG_CONFIRM_LABEL = "Confirm Import";
export const CONFIRM_IMPORT_DIALOG_CANCEL_LABEL = "Cancel";
export const IMPORTING_RESIDENTS_LABEL = "Importing Residents...";
export const BACK_TO_RESIDENT_MANAGEMENT_LABEL = "Back to Resident Management";
export const IMPORT_ANOTHER_EXCEL_FILE_LABEL = "Import Another Excel File";

export const RESIDENT_IMPORT_UNSUPPORTED_FIELDS_WARNING =
  "Some optional Excel fields are not included in this import version yet. Core resident details will be imported.";

export const RESIDENT_IMPORT_CONFIRM_REQUEST_FAILED_MESSAGE =
  "Import could not be completed. Please review the result and try again.";

export const PARTIAL_IMPORT_EXPLANATION =
  "Some residents were imported successfully. Some rows were not imported and need review.";

export const CONFIRM_IMPORT_NONE_REMAINING_MESSAGE =
  "There are no remaining verified residents to import.";

export const CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE =
  "Import plan changed. Please verify against existing residents again before importing.";

export const RESIDENT_IMPORT_VERIFICATION_STATUSES = [
  "unverified",
  "verifying",
  "verified",
  "stale",
] as const;

export type ResidentImportVerificationStatus =
  (typeof RESIDENT_IMPORT_VERIFICATION_STATUSES)[number];

export type ResidentImportVerificationState = {
  status: ResidentImportVerificationStatus;
  result: ResidentImportDatabaseVerificationResult | null;
  verifiedFingerprint: string | null;
};

export function createResidentImportVerificationState(): ResidentImportVerificationState {
  return {
    status: "unverified",
    result: null,
    verifiedFingerprint: null,
  };
}

export function markResidentImportVerificationStale(): ResidentImportVerificationState {
  return {
    status: "stale",
    result: null,
    verifiedFingerprint: null,
  };
}

export function beginResidentImportVerification(): ResidentImportVerificationState {
  return {
    status: "verifying",
    result: null,
    verifiedFingerprint: null,
  };
}

export function failResidentImportVerification(): ResidentImportVerificationState {
  return createResidentImportVerificationState();
}

/**
 * Accepts only a backend verification payload for the plan that was sent.
 * If the current plan changed while the request was in flight, the response
 * is discarded and the state becomes stale. Never filters a previous result.
 */
export function completeResidentImportVerification(input: {
  sentPlan: ResidentImportPlan;
  currentPlan: ResidentImportPlan | null;
  backendResult: Omit<
    ResidentImportDatabaseVerificationResult,
    "planFingerprint"
  >;
}): ResidentImportVerificationState {
  if (!input.currentPlan) {
    return markResidentImportVerificationStale();
  }
  const sentFingerprint = verifyFingerprint(input.sentPlan);
  const currentFingerprint = verifyFingerprint(input.currentPlan);
  if (sentFingerprint !== currentFingerprint) {
    return markResidentImportVerificationStale();
  }
  return {
    status: "verified",
    result: {
      ...input.backendResult,
      planFingerprint: sentFingerprint,
    },
    verifiedFingerprint: sentFingerprint,
  };
}

export function displayedResidentImportVerification(
  state: ResidentImportVerificationState,
  currentPlan?: ResidentImportPlan | null,
): ResidentImportDatabaseVerificationResult | null {
  if (
    state.status !== "verified" ||
    !state.result ||
    !state.verifiedFingerprint ||
    state.result.planFingerprint !== state.verifiedFingerprint
  ) {
    return null;
  }
  if (
    currentPlan &&
    state.verifiedFingerprint !== verifyFingerprint(currentPlan)
  ) {
    return null;
  }
  return state.result;
}

export function reviewImportPlanDoesNotRestoreVerification(
  state: ResidentImportVerificationState,
  currentPlan: ResidentImportPlan | null,
): ResidentImportVerificationState {
  if (state.status !== "verified" || !currentPlan || !state.verifiedFingerprint) {
    return state.status === "verified"
      ? markResidentImportVerificationStale()
      : state;
  }
  if (state.verifiedFingerprint !== verifyFingerprint(currentPlan)) {
    return markResidentImportVerificationStale();
  }
  return state;
}

const GENERIC_ROW_IMPORT_MESSAGE =
  "This row could not be imported. Please review it and try again.";

const UNSAFE_BACKEND_MESSAGE_PATTERN =
  /sqlstate|constraint|duplicate key|service[_ ]role|stack trace|permission denied|relation |postgres|pg_|jwt|rpc\b|insert into|update |delete from|syntax error/i;

export type ResidentImportConfirmClientRow = {
  rowNumber: number;
  flatNumber: string;
  residentName: string;
  residentType: string;
  primaryMobile: string;
  building: string;
  wing: string;
};

export type ResidentImportConfirmClientRequest = {
  rows: ResidentImportConfirmClientRow[];
};

export type ResidentImportNotSubmittedReason =
  | "skipped"
  | "duplicate"
  | "invalid"
  | "conflict"
  | "backend_blocked"
  | "already_exists";

export type ResidentImportNotSubmittedRow = {
  rowNumber: number;
  reason: ResidentImportNotSubmittedReason;
  label: string;
};

export type ResidentImportConfirmUiRow = {
  rowNumber: number;
  flatNumber: string;
  residentName: string;
  status: ResidentImportConfirmStatus;
  resultLabel: string;
  message: string;
};

export type ResidentImportConfirmUiSummary = {
  title: "Import Complete" | "Partial Import Completed";
  explanation: string | null;
  totalSubmitted: number;
  importedSuccessfully: number;
  alreadyExists: number;
  needsReview: number;
  cannotImport: number;
  invalid: number;
  failed: number;
  notSubmitted: {
    skipped: number;
    duplicate: number;
    invalid: number;
    conflict: number;
    backendBlocked: number;
    alreadyExists: number;
  };
  reconciles: boolean;
};

export type ResidentImportConfirmUiView = {
  summary: ResidentImportConfirmUiSummary;
  rows: ResidentImportConfirmUiRow[];
  notSubmittedRows: ResidentImportNotSubmittedRow[];
};

export type ResidentImportConfirmFlowState = {
  dialogOpen: boolean;
  isImporting: boolean;
  importedRowNumbers: number[];
  completedRowNumbers: number[];
  result: ResidentImportConfirmUiView | null;
  requestError: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function mapConfirmApplicationResult(
  status: ResidentImportConfirmStatus,
): ResidentImportConfirmHttpRowResult["result"] {
  switch (status) {
    case "IMPORTED":
      return "IMPORTED";
    case "ALREADY_EXISTS":
      return "ALREADY_EXISTS";
    case "POSSIBLE_DATABASE_CONFLICT":
      return "CONFLICT";
    case "BACKEND_BLOCKED":
      return "BLOCKED";
    case "INVALID":
      return "VALIDATION_ERROR";
    case "FAILED":
      return "SERVER_ERROR";
  }
}

function verifyFingerprint(plan: ResidentImportPlan): string {
  const importRows = [...plan.willImport]
    .sort((left, right) => left.rowNumber - right.rowNumber)
    .map((row) => ({
      rowNumber: row.rowNumber,
      decision: row.decision,
      decisionReason: row.decisionReason,
      validationStatus: row.validationStatus,
      building: row.mapped.building,
      wing: row.mapped.wing,
      flatNumber: row.mapped.flatNumber,
      residentName: row.mapped.residentName,
      residentType: row.mapped.residentType,
      primaryMobile: row.mapped.primaryMobile,
      additionalMobiles: [...row.mapped.additionalMobiles],
      customFields: row.mapped.customFields.map((field) => ({
        name: field.name,
        fieldType: field.fieldType,
        required: field.required,
        displayValue: field.displayValue,
      })),
    }));
  const skipRows = [...plan.willSkip]
    .sort((left, right) => left.rowNumber - right.rowNumber)
    .map((row) => ({
      rowNumber: row.rowNumber,
      decision: row.decision,
      decisionReason: row.decisionReason,
      validationStatus: row.validationStatus,
      blockReason: row.blockReason,
    }));
  return JSON.stringify({ import: importRows, skip: skipRows });
}

function isVerificationStale(
  plan: ResidentImportPlan,
  result: ResidentImportDatabaseVerificationResult | null,
): boolean {
  if (!result) {
    return true;
  }
  return result.planFingerprint !== verifyFingerprint(plan);
}

function verificationByRow(
  verification: ResidentImportDatabaseVerificationResult | null,
): Map<number, ResidentImportDatabaseStatus> {
  const map = new Map<number, ResidentImportDatabaseStatus>();
  if (!verification) {
    return map;
  }
  for (const row of verification.rows) {
    map.set(row.rowNumber, row.status);
  }
  return map;
}

export function formatResidentImportConfirmResultLabel(
  status: ResidentImportConfirmStatus,
): string {
  switch (status) {
    case "IMPORTED":
      return "Imported Successfully";
    case "ALREADY_EXISTS":
      return "Already Exists — Not Imported";
    case "POSSIBLE_DATABASE_CONFLICT":
      return "Needs Review — Not Imported";
    case "BACKEND_BLOCKED":
      return "Cannot Import";
    case "INVALID":
      return "Invalid — Not Imported";
    case "FAILED":
      return "Import Failed";
  }
}

export function formatResidentImportNotSubmittedLabel(
  reason: ResidentImportNotSubmittedReason,
): string {
  switch (reason) {
    case "skipped":
      return "Skipped — Not Submitted";
    case "duplicate":
      return "Duplicate — Not Submitted";
    case "invalid":
      return "Invalid — Not Submitted";
    case "conflict":
      return "Needs Review — Not Submitted";
    case "backend_blocked":
      return "Cannot Import — Not Submitted";
    case "already_exists":
      return "Already Exists — Not Submitted";
  }
}

export function sanitizeResidentImportConfirmUserMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed || UNSAFE_BACKEND_MESSAGE_PATTERN.test(trimmed)) {
    return GENERIC_ROW_IMPORT_MESSAGE;
  }
  return trimmed;
}

export function formatResidentImportConfirmDialogMessage(count: number): string {
  return [
    `You are about to import ${count} resident(s).`,
    "",
    "Rows marked as duplicates, invalid, conflicts, already existing, or skipped will not be imported.",
    "",
    "This action will create resident records in this society.",
  ].join("\n");
}

export function residentImportHasUnsupportedPersistedFields(
  plan: ResidentImportPlan,
): boolean {
  return plan.willImport.some((row) => {
    if (row.mapped.additionalMobiles.some((mobile) => mobile.trim() !== "")) {
      return true;
    }
    return row.mapped.customFields.some((field) => field.displayValue.trim() !== "");
  });
}

export function residentImportUnsupportedFieldsWarning(
  plan: ResidentImportPlan,
): string | null {
  return residentImportHasUnsupportedPersistedFields(plan)
    ? RESIDENT_IMPORT_UNSUPPORTED_FIELDS_WARNING
    : null;
}

export function isFreshResidentImportVerification(
  plan: ResidentImportPlan | null,
  verification: ResidentImportDatabaseVerificationResult | null,
): boolean {
  if (!plan || !verification) {
    return false;
  }
  return !isVerificationStale(plan, verification);
}

function resolveVerificationState(input: {
  plan: ResidentImportPlan | null;
  verification?: ResidentImportDatabaseVerificationResult | null;
  verificationState?: ResidentImportVerificationState;
}): ResidentImportVerificationState {
  if (input.verificationState) {
    if (input.verificationState.status !== "verified") {
      return {
        status: input.verificationState.status,
        result: null,
        verifiedFingerprint: null,
      };
    }
    if (
      !input.plan ||
      !input.verificationState.result ||
      !input.verificationState.verifiedFingerprint ||
      input.verificationState.verifiedFingerprint !==
        verifyFingerprint(input.plan) ||
      input.verificationState.result.planFingerprint !==
        input.verificationState.verifiedFingerprint
    ) {
      return markResidentImportVerificationStale();
    }
    return input.verificationState;
  }
  if (!input.plan || !input.verification) {
    return createResidentImportVerificationState();
  }
  if (isVerificationStale(input.plan, input.verification)) {
    return markResidentImportVerificationStale();
  }
  return {
    status: "verified",
    result: input.verification,
    verifiedFingerprint: input.verification.planFingerprint,
  };
}

export function selectResidentImportReadyRows(input: {
  plan: ResidentImportPlan;
  verification: ResidentImportDatabaseVerificationResult | null;
  excludeRowNumbers?: readonly number[];
}): ResidentImportConfirmClientRow[] {
  if (!isFreshResidentImportVerification(input.plan, input.verification)) {
    return [];
  }
  const excluded = new Set(input.excludeRowNumbers ?? []);
  const statuses = verificationByRow(input.verification);
  const rows: ResidentImportConfirmClientRow[] = [];

  for (const row of input.plan.willImport) {
    if (excluded.has(row.rowNumber)) {
      continue;
    }
    if (statuses.get(row.rowNumber) !== "READY_TO_IMPORT") {
      continue;
    }
    rows.push({
      rowNumber: row.rowNumber,
      flatNumber: row.mapped.flatNumber,
      residentName: row.mapped.residentName,
      residentType: row.mapped.residentType,
      primaryMobile: row.mapped.primaryMobile,
      building: row.mapped.building,
      wing: row.mapped.wing,
    });
  }

  return rows;
}

export type PrepareResidentImportConfirmResult =
  | {
      ok: true;
      request: ResidentImportConfirmClientRequest;
      fingerprint: string;
    }
  | {
      ok: false;
      code:
        | "MISSING_PLAN"
        | "MISSING_VERIFICATION"
        | "STALE_VERIFICATION"
        | "NO_READY_ROWS";
      message: string;
    };

/**
 * Fail-closed final-import guard. The UI must use this immediately before
 * opening Confirm and again immediately before invoking the Edge Function.
 * A missing, stale, or mismatched verification never produces a payload.
 */
export function prepareResidentImportConfirm(input: {
  plan: ResidentImportPlan | null;
  verification?: ResidentImportDatabaseVerificationResult | null;
  verificationState?: ResidentImportVerificationState;
  excludeRowNumbers?: readonly number[];
}): PrepareResidentImportConfirmResult {
  if (!input.plan) {
    return {
      ok: false,
      code: "MISSING_PLAN",
      message: DATABASE_VERIFICATION_REQUIRED_MESSAGE,
    };
  }
  const state = resolveVerificationState(input);
  if (state.status === "stale") {
    return {
      ok: false,
      code: "STALE_VERIFICATION",
      message: CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE,
    };
  }
  if (state.status !== "verified" || !state.result || !state.verifiedFingerprint) {
    return {
      ok: false,
      code: "MISSING_VERIFICATION",
      message: DATABASE_VERIFICATION_REQUIRED_MESSAGE,
    };
  }
  const currentFingerprint = verifyFingerprint(input.plan);
  if (state.verifiedFingerprint !== currentFingerprint) {
    return {
      ok: false,
      code: "STALE_VERIFICATION",
      message: CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE,
    };
  }
  const request = {
    rows: selectResidentImportReadyRows({
      plan: input.plan,
      verification: state.result,
      excludeRowNumbers: input.excludeRowNumbers,
    }),
  };
  if (request.rows.length === 0) {
    return {
      ok: false,
      code: "NO_READY_ROWS",
      message: CONFIRM_IMPORT_NONE_REMAINING_MESSAGE,
    };
  }
  return {
    ok: true,
    request,
    fingerprint: currentFingerprint,
  };
}

export function canConfirmResidentImport(input: {
  plan: ResidentImportPlan | null;
  verification?: ResidentImportDatabaseVerificationResult | null;
  verificationState?: ResidentImportVerificationState;
  excludeRowNumbers?: readonly number[];
}): boolean {
  return prepareResidentImportConfirm(input).ok;
}

export function residentImportConfirmDisabledReason(input: {
  plan: ResidentImportPlan | null;
  verification?: ResidentImportDatabaseVerificationResult | null;
  verificationState?: ResidentImportVerificationState;
  excludeRowNumbers?: readonly number[];
}): string {
  if (!input.plan) {
    return DATABASE_VERIFICATION_REQUIRED_MESSAGE;
  }
  const state = resolveVerificationState(input);
  if (state.status === "stale") {
    return CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE;
  }
  if (state.status !== "verified" || !state.result) {
    return DATABASE_VERIFICATION_REQUIRED_MESSAGE;
  }
  if (
    selectResidentImportReadyRows({
      plan: input.plan,
      verification: state.result,
      excludeRowNumbers: input.excludeRowNumbers,
    }).length === 0
  ) {
    return CONFIRM_IMPORT_NONE_REMAINING_MESSAGE;
  }
  return "";
}

export function buildResidentImportConfirmRequest(input: {
  plan: ResidentImportPlan;
  verification: ResidentImportDatabaseVerificationResult | null;
  excludeRowNumbers?: readonly number[];
  spoofSocietyId?: string;
  societyId?: string;
  society_id?: string;
  society_code?: string;
}): ResidentImportConfirmClientRequest {
  void input.spoofSocietyId;
  void input.societyId;
  void input.society_id;
  void input.society_code;
  return {
    rows: selectResidentImportReadyRows({
      plan: input.plan,
      verification: input.verification,
      excludeRowNumbers: input.excludeRowNumbers,
    }),
  };
}

function classifySkipReason(
  row: ResidentImportPlanWillSkipRow,
): ResidentImportNotSubmittedReason {
  if (row.blockReason === "INVALID") {
    return "invalid";
  }
  if (row.blockReason === "INTRA_FILE_DUPLICATE") {
    return "duplicate";
  }
  if (row.blockReason === "BACKEND_FLAT_LIMITATION") {
    return "backend_blocked";
  }
  if (row.decisionReason === "DEFAULT_CONFLICT_SKIP") {
    return "conflict";
  }
  return "skipped";
}

function classifyUnsubmittedImportReason(
  status: ResidentImportDatabaseStatus | undefined,
): ResidentImportNotSubmittedReason {
  if (status === "ALREADY_EXISTS") {
    return "already_exists";
  }
  if (status === "POSSIBLE_DATABASE_CONFLICT") {
    return "conflict";
  }
  if (status === "BACKEND_BLOCKED") {
    return "backend_blocked";
  }
  return "skipped";
}

export function collectResidentImportNotSubmittedRows(input: {
  plan: ResidentImportPlan;
  verification: ResidentImportDatabaseVerificationResult | null;
  submittedRowNumbers: readonly number[];
}): ResidentImportNotSubmittedRow[] {
  const submitted = new Set(input.submittedRowNumbers);
  const statuses = verificationByRow(input.verification);
  const rows: ResidentImportNotSubmittedRow[] = [];

  for (const row of input.plan.willSkip) {
    if (submitted.has(row.rowNumber)) {
      continue;
    }
    const reason = classifySkipReason(row);
    rows.push({
      rowNumber: row.rowNumber,
      reason,
      label: formatResidentImportNotSubmittedLabel(reason),
    });
  }

  for (const row of input.plan.willImport) {
    if (submitted.has(row.rowNumber)) {
      continue;
    }
    const reason = classifyUnsubmittedImportReason(statuses.get(row.rowNumber));
    rows.push({
      rowNumber: row.rowNumber,
      reason,
      label: formatResidentImportNotSubmittedLabel(reason),
    });
  }

  return rows;
}

function countNotSubmitted(
  rows: readonly ResidentImportNotSubmittedRow[],
): ResidentImportConfirmUiSummary["notSubmitted"] {
  return {
    skipped: rows.filter((row) => row.reason === "skipped").length,
    duplicate: rows.filter((row) => row.reason === "duplicate").length,
    invalid: rows.filter((row) => row.reason === "invalid").length,
    conflict: rows.filter((row) => row.reason === "conflict").length,
    backendBlocked: rows.filter((row) => row.reason === "backend_blocked").length,
    alreadyExists: rows.filter((row) => row.reason === "already_exists").length,
  };
}

export function parseResidentImportConfirmClientResponse(
  data: unknown,
): ResidentImportConfirmHttpSuccess | null {
  if (!isRecord(data) || !Array.isArray(data.rows)) {
    return null;
  }

  const rows: ResidentImportConfirmHttpRowResult[] = [];
  for (const item of data.rows) {
    if (!isRecord(item)) {
      return null;
    }
    const status = item.status;
    if (
      typeof status !== "string" ||
      !(RESIDENT_IMPORT_CONFIRM_STATUSES as readonly string[]).includes(status)
    ) {
      return null;
    }
    const rowNumber = item.rowNumber;
    if (typeof rowNumber !== "number" || !Number.isInteger(rowNumber)) {
      return null;
    }
    const confirmStatus = status as ResidentImportConfirmStatus;
    rows.push({
      rowNumber,
      status: confirmStatus,
      result: mapConfirmApplicationResult(confirmStatus),
      message:
        typeof item.message === "string"
          ? sanitizeResidentImportConfirmUserMessage(item.message)
          : GENERIC_ROW_IMPORT_MESSAGE,
    });
  }

  return {
    version: RESIDENT_IMPORT_CONFIRM_VERSION,
    summary: {
      rowsSubmitted: rows.length,
      imported: rows.filter((row) => row.status === "IMPORTED").length,
      alreadyExists: rows.filter((row) => row.status === "ALREADY_EXISTS").length,
      possibleConflicts: rows.filter(
        (row) => row.status === "POSSIBLE_DATABASE_CONFLICT",
      ).length,
      backendBlocked: rows.filter((row) => row.status === "BACKEND_BLOCKED").length,
      invalid: rows.filter((row) => row.status === "INVALID").length,
      failed: rows.filter((row) => row.status === "FAILED").length,
    },
    rows,
  };
}

export function buildResidentImportConfirmUiView(input: {
  plan: ResidentImportPlan;
  verification: ResidentImportDatabaseVerificationResult | null;
  batch: ResidentImportConfirmHttpSuccess;
}): ResidentImportConfirmUiView {
  const submittedRowNumbers = input.batch.rows.map((row) => row.rowNumber);
  const mappedByRow = new Map(
    input.plan.willImport.map((row) => [row.rowNumber, row.mapped]),
  );
  const rows: ResidentImportConfirmUiRow[] = input.batch.rows.map((row) => {
    const mapped = mappedByRow.get(row.rowNumber);
    return {
      rowNumber: row.rowNumber,
      flatNumber: mapped?.flatNumber ?? "",
      residentName: mapped?.residentName ?? "",
      status: row.status,
      resultLabel: formatResidentImportConfirmResultLabel(row.status),
      message: sanitizeResidentImportConfirmUserMessage(row.message),
    };
  });

  const notSubmittedRows = collectResidentImportNotSubmittedRows({
    plan: input.plan,
    verification: input.verification,
    submittedRowNumbers,
  });

  const importedSuccessfully = rows.filter((row) => row.status === "IMPORTED").length;
  const alreadyExists = rows.filter((row) => row.status === "ALREADY_EXISTS").length;
  const needsReview = rows.filter(
    (row) => row.status === "POSSIBLE_DATABASE_CONFLICT",
  ).length;
  const cannotImport = rows.filter((row) => row.status === "BACKEND_BLOCKED").length;
  const invalid = rows.filter((row) => row.status === "INVALID").length;
  const failed = rows.filter((row) => row.status === "FAILED").length;
  const totalSubmitted = rows.length;
  const partial = importedSuccessfully > 0 && importedSuccessfully < totalSubmitted;
  const reconciles =
    importedSuccessfully +
      alreadyExists +
      needsReview +
      cannotImport +
      invalid +
      failed ===
    totalSubmitted;

  return {
    summary: {
      title: partial ? "Partial Import Completed" : "Import Complete",
      explanation: partial ? PARTIAL_IMPORT_EXPLANATION : null,
      totalSubmitted,
      importedSuccessfully,
      alreadyExists,
      needsReview,
      cannotImport,
      invalid,
      failed,
      notSubmitted: countNotSubmitted(notSubmittedRows),
      reconciles,
    },
    rows,
    notSubmittedRows,
  };
}

export function createResidentImportConfirmFlowState(): ResidentImportConfirmFlowState {
  return {
    dialogOpen: false,
    isImporting: false,
    importedRowNumbers: [],
    completedRowNumbers: [],
    result: null,
    requestError: null,
  };
}

export function resetResidentImportConfirmFlow(): ResidentImportConfirmFlowState {
  return createResidentImportConfirmFlowState();
}

export function openResidentImportConfirmDialog(
  state: ResidentImportConfirmFlowState,
): ResidentImportConfirmFlowState {
  if (state.isImporting) {
    return state;
  }
  return {
    ...state,
    dialogOpen: true,
    requestError: null,
  };
}

export function requestResidentImportConfirmDialog(
  state: ResidentImportConfirmFlowState,
  allowed: boolean,
): ResidentImportConfirmFlowState {
  if (!allowed) {
    return {
      ...state,
      dialogOpen: false,
    };
  }
  return openResidentImportConfirmDialog(state);
}

export function cancelResidentImportConfirmDialog(
  state: ResidentImportConfirmFlowState,
): ResidentImportConfirmFlowState {
  if (state.isImporting) {
    return state;
  }
  return {
    ...state,
    dialogOpen: false,
  };
}

export function beginResidentImportConfirm(
  state: ResidentImportConfirmFlowState,
): { state: ResidentImportConfirmFlowState; shouldInvoke: boolean } {
  if (state.isImporting || !state.dialogOpen) {
    return { state, shouldInvoke: false };
  }
  return {
    state: {
      ...state,
      isImporting: true,
      requestError: null,
    },
    shouldInvoke: true,
  };
}

export function completeResidentImportConfirm(
  state: ResidentImportConfirmFlowState,
  result: ResidentImportConfirmUiView,
): ResidentImportConfirmFlowState {
  const imported = result.rows
    .filter((row) => row.status === "IMPORTED")
    .map((row) => row.rowNumber);
  const completed = result.rows
    .filter((row) => row.status !== "FAILED")
    .map((row) => row.rowNumber);
  return {
    ...state,
    dialogOpen: false,
    isImporting: false,
    importedRowNumbers: uniqueNumbers([...state.importedRowNumbers, ...imported]),
    completedRowNumbers: uniqueNumbers([
      ...state.completedRowNumbers,
      ...completed,
    ]),
    result,
    requestError: null,
  };
}

export function failResidentImportConfirm(
  state: ResidentImportConfirmFlowState,
  message?: string,
): ResidentImportConfirmFlowState {
  const trimmed = (message ?? RESIDENT_IMPORT_CONFIRM_REQUEST_FAILED_MESSAGE).trim();
  const requestError =
    !trimmed || UNSAFE_BACKEND_MESSAGE_PATTERN.test(trimmed)
      ? RESIDENT_IMPORT_CONFIRM_REQUEST_FAILED_MESSAGE
      : trimmed;
  return {
    ...state,
    dialogOpen: false,
    isImporting: false,
    requestError,
  };
}

export function completedResidentImportRowNumbers(
  state: ResidentImportConfirmFlowState,
): number[] {
  return uniqueNumbers([
    ...state.importedRowNumbers,
    ...state.completedRowNumbers,
  ]);
}

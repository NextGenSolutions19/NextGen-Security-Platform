/**
 * M03-T03 resident import database verification (Phase 3D).
 *
 * Local import plan -> server-side read-only comparison against existing
 * residents in the authenticated admin's society.
 *
 * Classification is pure. The Edge Function loads society residents using the
 * JWT society_id and then applies this classifier. The client never supplies
 * society_id for authorization.
 *
 * Actual writes happen only through admin-resident-import-confirm after a
 * fresh verification and explicit Admin confirmation.
 *
 * Type-only imports keep this module loadable by the Node test runner.
 */

import type { ResidentImportPlan } from "./resident-import-decisions";

export const RESIDENT_IMPORT_DB_VERIFY_VERSION = 1 as const;

export const VERIFY_AGAINST_EXISTING_RESIDENTS_LABEL =
  "Verify Against Existing Residents";

export const FINAL_IMPORT_QA_REQUIRED_MESSAGE =
  "Final import will be enabled after database verification QA is completed.";

export const RESIDENT_IMPORT_DB_STATUSES = [
  "READY_TO_IMPORT",
  "ALREADY_EXISTS",
  "POSSIBLE_DATABASE_CONFLICT",
  "BACKEND_BLOCKED",
] as const;

export type ResidentImportDatabaseStatus =
  (typeof RESIDENT_IMPORT_DB_STATUSES)[number];

const INDIAN_MOBILE_NUMBER_PATTERN = /^[6-9][0-9]{9}$/;

export type ResidentImportVerifyProposedRow = {
  rowNumber: number;
  building: string;
  wing: string;
  flatNumber: string;
  residentName: string;
  residentType: string;
  primaryMobile: string;
  additionalMobiles: string[];
};

export type ResidentImportExistingResident = {
  societyId: string;
  residentName: string;
  flatNumber: string;
  wingBuilding: string | null;
  primaryMobile: string | null;
  additionalMobiles: string[];
  status: "active" | "disabled";
};

export type ResidentImportDatabaseMatch = {
  residentName: string;
  flatNumber: string;
  wingBuilding: string;
  mobile: string;
  status: "active" | "disabled";
};

export type ResidentImportDatabaseRowResult = {
  rowNumber: number;
  status: ResidentImportDatabaseStatus;
  databaseStatusLabel: string;
  decisionLabel: string;
  message: string;
  matchedFields: string[];
  existingResident: ResidentImportDatabaseMatch | null;
};

export type ResidentImportDatabaseVerificationSummary = {
  rowsChecked: number;
  readyToImport: number;
  alreadyExists: number;
  possibleConflicts: number;
  backendBlocked: number;
};

export type ResidentImportDatabaseVerificationResult = {
  version: typeof RESIDENT_IMPORT_DB_VERIFY_VERSION;
  readOnly: true;
  summary: ResidentImportDatabaseVerificationSummary;
  rows: ResidentImportDatabaseRowResult[];
  planFingerprint: string;
};

export type ParseResidentImportVerifyRequestResult =
  | { ok: true; rows: ResidentImportVerifyProposedRow[] }
  | { ok: false; code: string; message: string; status: number };

const MAX_VERIFY_ROWS = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

/** Must stay aligned with residentImportCompareKey. */
export function residentImportDbCompareKey(
  value: string | null | undefined,
): string {
  if (value == null) {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Must stay aligned with normalizeResidentImportMobile. */
export function normalizeResidentImportVerifyMobile(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits.slice(0, 10);
}

export function isValidResidentImportVerifyMobile(value: string): boolean {
  if (/[a-zA-Z]/.test(value)) {
    return false;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return INDIAN_MOBILE_NUMBER_PATTERN.test(digits);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return INDIAN_MOBILE_NUMBER_PATTERN.test(digits.slice(2));
  }
  return false;
}

function proposedBuildingKey(building: string, wing: string): string {
  const parts = [
    residentImportDbCompareKey(building),
    residentImportDbCompareKey(wing),
  ].filter((part) => part.length > 0);
  return parts.join(" ");
}

function existingBuildingKey(wingBuilding: string | null | undefined): string {
  return residentImportDbCompareKey(wingBuilding);
}

function validMobiles(values: readonly string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (!value || value.trim() === "") {
      continue;
    }
    if (!isValidResidentImportVerifyMobile(value)) {
      continue;
    }
    const normalized = normalizeResidentImportVerifyMobile(value);
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

function proposedMobiles(row: ResidentImportVerifyProposedRow): string[] {
  return validMobiles([row.primaryMobile, ...row.additionalMobiles]);
}

function existingMobiles(row: ResidentImportExistingResident): string[] {
  return validMobiles([
    row.primaryMobile ?? "",
    ...row.additionalMobiles,
  ]);
}

function sharedMobiles(left: string[], right: string[]): string[] {
  return left.filter((mobile) => right.includes(mobile));
}

function toMatch(
  existing: ResidentImportExistingResident,
): ResidentImportDatabaseMatch {
  return {
    residentName: existing.residentName,
    flatNumber: existing.flatNumber,
    wingBuilding: existing.wingBuilding ?? "",
    mobile: existing.primaryMobile ?? existing.additionalMobiles[0] ?? "",
    status: existing.status,
  };
}

function statusLabel(status: ResidentImportDatabaseStatus): string {
  switch (status) {
    case "READY_TO_IMPORT":
      return "Ready to Import";
    case "ALREADY_EXISTS":
      return "Already Exists";
    case "POSSIBLE_DATABASE_CONFLICT":
      return "Possible Conflict";
    case "BACKEND_BLOCKED":
      return "Backend Blocked";
  }
}

function decisionLabel(status: ResidentImportDatabaseStatus): string {
  switch (status) {
    case "READY_TO_IMPORT":
      return "Ready to Import";
    case "ALREADY_EXISTS":
      return "Do Not Import";
    case "POSSIBLE_DATABASE_CONFLICT":
      return "Requires Review";
    case "BACKEND_BLOCKED":
      return "Cannot Import";
  }
}

function archivedNote(existing: ResidentImportExistingResident): string {
  return existing.status === "disabled"
    ? " This resident is archived. Import will not update or reactivate them."
    : "";
}

type Finding = {
  rank: number;
  status: ResidentImportDatabaseStatus;
  message: string;
  matchedFields: string[];
  existing: ResidentImportExistingResident;
};

function classifyOne(
  proposed: ResidentImportVerifyProposedRow,
  existingRows: readonly ResidentImportExistingResident[],
): ResidentImportDatabaseRowResult {
  const flatKey = residentImportDbCompareKey(proposed.flatNumber);
  const nameKey = residentImportDbCompareKey(proposed.residentName);
  const buildingKey = proposedBuildingKey(proposed.building, proposed.wing);
  const mobiles = proposedMobiles(proposed);
  const findings: Finding[] = [];

  for (const existing of existingRows) {
    const existingFlatKey = residentImportDbCompareKey(existing.flatNumber);
    const existingNameKey = residentImportDbCompareKey(existing.residentName);
    const existingBuilding = existingBuildingKey(existing.wingBuilding);
    const existingMobileList = existingMobiles(existing);
    const common = sharedMobiles(mobiles, existingMobileList);
    const sameFlat = flatKey !== "" && flatKey === existingFlatKey;
    const sameName = nameKey !== "" && nameKey === existingNameKey;
    const samePhysicalFlat = sameFlat && buildingKey === existingBuilding;

    if (samePhysicalFlat && sameName && common.length > 0) {
      findings.push({
        rank: 3,
        status: "ALREADY_EXISTS",
        message: `Matches existing resident ${existing.residentName} in flat ${existing.flatNumber} on mobile ${common[0]}.${archivedNote(existing)}`,
        matchedFields: ["Flat Number", "Resident Name", "Mobile"],
        existing,
      });
      continue;
    }

    if (samePhysicalFlat && sameName && common.length === 0) {
      findings.push({
        rank: 2,
        status: "POSSIBLE_DATABASE_CONFLICT",
        message: `Same flat and resident name as existing resident ${existing.residentName}, but the mobile numbers do not match.`,
        matchedFields: ["Flat Number", "Resident Name"],
        existing,
      });
    }

    if (samePhysicalFlat && !sameName && common.length > 0) {
      findings.push({
        rank: 2,
        status: "POSSIBLE_DATABASE_CONFLICT",
        message: `Same flat as existing resident ${existing.residentName}, with a different name and a shared mobile number.`,
        matchedFields: ["Flat Number", "Mobile"],
        existing,
      });
    }

    if (!samePhysicalFlat && common.length > 0 && existingFlatKey !== "") {
      findings.push({
        rank: 2,
        status: "POSSIBLE_DATABASE_CONFLICT",
        message: `Mobile ${common[0]} is already used by ${existing.residentName} in flat ${existing.flatNumber}.`,
        matchedFields: ["Mobile"],
        existing,
      });
    }

    if (sameName && !samePhysicalFlat && existingFlatKey !== "") {
      findings.push({
        rank: 2,
        status: "POSSIBLE_DATABASE_CONFLICT",
        message: `Resident name ${existing.residentName} already exists in a different flat (${existing.flatNumber}).`,
        matchedFields: ["Resident Name"],
        existing,
      });
    }
  }

  findings.sort((left, right) => right.rank - left.rank);
  const chosen = findings[0];
  if (!chosen) {
    return {
      rowNumber: proposed.rowNumber,
      status: "READY_TO_IMPORT",
      databaseStatusLabel: statusLabel("READY_TO_IMPORT"),
      decisionLabel: decisionLabel("READY_TO_IMPORT"),
      message: "No matching resident was found in this society.",
      matchedFields: [],
      existingResident: null,
    };
  }

  return {
    rowNumber: proposed.rowNumber,
    status: chosen.status,
    databaseStatusLabel: statusLabel(chosen.status),
    decisionLabel: decisionLabel(chosen.status),
    message: chosen.message,
    matchedFields: chosen.matchedFields,
    existingResident: toMatch(chosen.existing),
  };
}

export function summarizeResidentImportDatabaseVerification(
  rows: readonly ResidentImportDatabaseRowResult[],
): ResidentImportDatabaseVerificationSummary {
  return {
    rowsChecked: rows.length,
    readyToImport: rows.filter((row) => row.status === "READY_TO_IMPORT").length,
    alreadyExists: rows.filter((row) => row.status === "ALREADY_EXISTS").length,
    possibleConflicts: rows.filter(
      (row) => row.status === "POSSIBLE_DATABASE_CONFLICT",
    ).length,
    backendBlocked: rows.filter((row) => row.status === "BACKEND_BLOCKED").length,
  };
}

export function classifyResidentImportAgainstDatabase(input: {
  proposed: readonly ResidentImportVerifyProposedRow[];
  existing: readonly ResidentImportExistingResident[];
  societyId: string;
}): Omit<ResidentImportDatabaseVerificationResult, "planFingerprint"> {
  const existing = input.existing.filter(
    (row) => row.societyId === input.societyId,
  );
  const rows = input.proposed.map((row) => classifyOne(row, existing));
  return {
    version: RESIDENT_IMPORT_DB_VERIFY_VERSION,
    readOnly: true,
    summary: summarizeResidentImportDatabaseVerification(rows),
    rows,
  };
}

export function proposedRowsForDatabaseVerification(
  plan: ResidentImportPlan,
): ResidentImportVerifyProposedRow[] {
  return plan.willImport.map((row) => ({
    rowNumber: row.rowNumber,
    building: row.mapped.building,
    wing: row.mapped.wing,
    flatNumber: row.mapped.flatNumber,
    residentName: row.mapped.residentName,
    residentType: row.mapped.residentType,
    primaryMobile: row.mapped.primaryMobile,
    additionalMobiles: [...row.mapped.additionalMobiles],
  }));
}

export function buildResidentImportVerifyRequest(
  plan: ResidentImportPlan,
): { rows: ResidentImportVerifyProposedRow[] } {
  return { rows: proposedRowsForDatabaseVerification(plan) };
}

export function residentImportVerifyFingerprint(plan: ResidentImportPlan): string {
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

export function attachResidentImportVerifyFingerprint(
  result: Omit<ResidentImportDatabaseVerificationResult, "planFingerprint">,
  plan: ResidentImportPlan,
): ResidentImportDatabaseVerificationResult {
  return {
    ...result,
    planFingerprint: residentImportVerifyFingerprint(plan),
  };
}

export function isResidentImportVerificationStale(
  plan: ResidentImportPlan,
  result: ResidentImportDatabaseVerificationResult | null,
): boolean {
  if (!result) {
    return true;
  }
  return result.planFingerprint !== residentImportVerifyFingerprint(plan);
}

export function parseResidentImportVerifyRequest(
  body: unknown,
): ParseResidentImportVerifyRequestResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Request body must be valid JSON.",
      status: 400,
    };
  }

  const rowsValue = body.rows;
  if (!Array.isArray(rowsValue)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Verification requires a list of planned import rows.",
      status: 400,
    };
  }
  if (rowsValue.length > MAX_VERIFY_ROWS) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Too many rows were submitted for verification.",
      status: 400,
    };
  }

  const rows: ResidentImportVerifyProposedRow[] = [];
  for (const item of rowsValue) {
    if (!isRecord(item)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Each planned import row must be an object.",
        status: 400,
      };
    }
    const rowNumber = item.rowNumber;
    if (typeof rowNumber !== "number" || !Number.isInteger(rowNumber) || rowNumber < 2) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Each planned import row needs a valid Excel row number.",
        status: 400,
      };
    }
    rows.push({
      rowNumber,
      building: readString(item.building),
      wing: readString(item.wing),
      flatNumber: readString(item.flatNumber),
      residentName: readString(item.residentName),
      residentType: readString(item.residentType),
      primaryMobile: readString(item.primaryMobile),
      additionalMobiles: readStringArray(item.additionalMobiles),
    });
  }

  return { ok: true, rows };
}

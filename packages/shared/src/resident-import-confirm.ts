/**
 * M03 Excel import confirm planner (Phase 1).
 *
 * Decides whether a planned row may be written. Actual inserts happen only in
 * the admin-resident-import-confirm Edge Function, invoked from the Admin UI
 * after fresh database verification and an explicit confirmation.
 *
 * Type-only sibling imports keep this module loadable by the Node test runner.
 */

import type {
  ResidentImportDatabaseStatus,
  ResidentImportDatabaseVerificationResult,
  ResidentImportExistingResident,
  ResidentImportVerifyProposedRow,
} from "./resident-import-db-verify";

export const RESIDENT_IMPORT_CONFIRM_VERSION = 1 as const;
export const RESIDENT_IMPORT_CONFIRM_MAX_ROWS = 200;
export const ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC =
  "admin_confirm_resident_import_row" as const;
const RESIDENT_IMPORT_CONFIRM_LOCK_SEPARATOR = "\u001f";

export const RESIDENT_IMPORT_CONFIRM_CANONICAL_TYPES = [
  "Owner",
  "Tenant",
  "Family Member",
  "Other",
] as const;

export type ResidentImportConfirmCanonicalType =
  (typeof RESIDENT_IMPORT_CONFIRM_CANONICAL_TYPES)[number];

export const RESIDENT_IMPORT_CONFIRM_STATUSES = [
  "IMPORTED",
  "ALREADY_EXISTS",
  "POSSIBLE_DATABASE_CONFLICT",
  "BACKEND_BLOCKED",
  "INVALID",
  "FAILED",
] as const;

export type ResidentImportConfirmStatus =
  (typeof RESIDENT_IMPORT_CONFIRM_STATUSES)[number];

const INDIAN_MOBILE_NUMBER_PATTERN = /^[6-9][0-9]{9}$/;

export type ResidentImportConfirmProposedRow = ResidentImportVerifyProposedRow;

export type ResidentImportConfirmWrite = {
  rowNumber: number;
  flatNumber: string;
  residentName: string;
  residentType: ResidentImportConfirmCanonicalType | null;
  mobile: string | null;
  wingBuilding: string | null;
};

export type ResidentImportConfirmRowResult = {
  rowNumber: number;
  status: ResidentImportConfirmStatus;
  message: string;
};

export type ResidentImportConfirmSummary = {
  rowsSubmitted: number;
  imported: number;
  alreadyExists: number;
  possibleConflicts: number;
  backendBlocked: number;
  invalid: number;
  failed: number;
};

export type ResidentImportConfirmBatchResult = {
  version: typeof RESIDENT_IMPORT_CONFIRM_VERSION;
  summary: ResidentImportConfirmSummary;
  rows: ResidentImportConfirmRowResult[];
};

export type PersistResidentImportConfirmResult =
  | { ok: true; existing: ResidentImportExistingResident }
  | {
      ok: false;
      status: Exclude<ResidentImportConfirmStatus, "IMPORTED">;
      message: string;
    };

export type AdminConfirmResidentImportRowResult = {
  rowNumber: number;
  status: ResidentImportConfirmStatus;
  message: string;
  residentId: string | null;
  residentName: string | null;
  flatNumber: string | null;
  wingBuilding: string | null;
  mobile: string | null;
};

export type ClassifyAgainstDatabase = (input: {
  proposed: readonly ResidentImportVerifyProposedRow[];
  existing: readonly ResidentImportExistingResident[];
  societyId: string;
}) => Omit<ResidentImportDatabaseVerificationResult, "planFingerprint">;

type ParseConfirmRequestResult =
  | { ok: true; rows: ResidentImportConfirmProposedRow[] }
  | { ok: false; code: string; message: string; status: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function compareKey(value: string | null | undefined): string {
  if (value == null) {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeMobile(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits.slice(0, 10);
}

/**
 * Excel-compatible Indian mobile check that does not silently slice extra digits
 * into a valid number. Blank is handled by the caller.
 */
export function isStrictResidentImportConfirmMobile(value: string): boolean {
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

export function combineResidentImportWingBuilding(
  building: string,
  wing: string,
): string | null {
  const parts = [building.trim(), wing.trim()].filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }
  return parts.join(" ").replace(/\s+/g, " ");
}

export function canonicalizeResidentImportType(
  value: string,
): ResidentImportConfirmCanonicalType | null {
  const key = compareKey(value);
  if (!key) {
    return null;
  }
  return (
    RESIDENT_IMPORT_CONFIRM_CANONICAL_TYPES.find(
      (type) => compareKey(type) === key,
    ) ?? null
  );
}

export function validateResidentImportConfirmFields(
  row: ResidentImportConfirmProposedRow,
): { ok: true } | { ok: false; message: string } {
  if (row.flatNumber.trim() === "") {
    return { ok: false, message: "Flat Number is required." };
  }
  if (row.residentName.trim() === "") {
    return { ok: false, message: "Resident Name is required." };
  }
  if (
    row.primaryMobile.trim() !== ""
    && !isStrictResidentImportConfirmMobile(row.primaryMobile)
  ) {
    return {
      ok: false,
      message: "Primary Mobile must contain a valid 10-digit Indian mobile number.",
    };
  }
  if (
    row.residentType.trim() !== "" &&
    canonicalizeResidentImportType(row.residentType) == null
  ) {
    return {
      ok: false,
      message:
        "Resident Type must be Owner, Tenant, Family Member, or Other.",
    };
  }
  for (const extra of row.additionalMobiles) {
    if (extra.trim() === "") {
      continue;
    }
    if (!isStrictResidentImportConfirmMobile(extra)) {
      return {
        ok: false,
        message:
          "Each additional mobile must be a valid 10-digit Indian mobile number.",
      };
    }
  }
  return { ok: true };
}

function requireOptionalString(
  value: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: "" };
  }
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a string.` };
  }
  return { ok: true, value };
}

/**
 * Maps approved confirm-row aliases (mobile / wingBuilding) onto the planner row.
 * Does not treat client society identifiers as input.
 */
export function readResidentImportConfirmRowInput(
  item: Record<string, unknown>,
):
  | { ok: true; row: ResidentImportConfirmProposedRow }
  | { ok: false; message: string } {
  const rowNumber = item.rowNumber;
  if (typeof rowNumber !== "number" || !Number.isInteger(rowNumber) || rowNumber < 2) {
    return {
      ok: false,
      message: "Each planned import row needs a valid Excel row number.",
    };
  }

  const primaryMobileField = requireOptionalString(item.primaryMobile, "primaryMobile");
  if (!primaryMobileField.ok) {
    return primaryMobileField;
  }
  const mobileField = requireOptionalString(item.mobile, "mobile");
  if (!mobileField.ok) {
    return mobileField;
  }
  if (
    primaryMobileField.value.trim() !== ""
    && mobileField.value.trim() !== ""
    && primaryMobileField.value.trim() !== mobileField.value.trim()
  ) {
    return {
      ok: false,
      message: "mobile and primaryMobile must match when both are sent.",
    };
  }

  const flatNumber = requireOptionalString(item.flatNumber, "flatNumber");
  if (!flatNumber.ok) {
    return flatNumber;
  }
  const residentName = requireOptionalString(item.residentName, "residentName");
  if (!residentName.ok) {
    return residentName;
  }
  const residentType = requireOptionalString(item.residentType, "residentType");
  if (!residentType.ok) {
    return residentType;
  }
  const building = requireOptionalString(item.building, "building");
  if (!building.ok) {
    return building;
  }
  const wing = requireOptionalString(item.wing, "wing");
  if (!wing.ok) {
    return wing;
  }
  const wingBuilding = requireOptionalString(item.wingBuilding, "wingBuilding");
  if (!wingBuilding.ok) {
    return wingBuilding;
  }

  const fromParts = combineResidentImportWingBuilding(building.value, wing.value);
  if (
    wingBuilding.value.trim() !== ""
    && fromParts
    && compareKey(wingBuilding.value) !== compareKey(fromParts)
  ) {
    return {
      ok: false,
      message: "wingBuilding must match building and wing when both are sent.",
    };
  }

  let additionalMobiles: string[] = [];
  if (item.additionalMobiles !== undefined && item.additionalMobiles !== null) {
    if (
      !Array.isArray(item.additionalMobiles)
      || !item.additionalMobiles.every((entry) => typeof entry === "string")
    ) {
      return {
        ok: false,
        message: "additionalMobiles must be an array of strings.",
      };
    }
    additionalMobiles = item.additionalMobiles;
  }

  return {
    ok: true,
    row: {
      rowNumber,
      building: wingBuilding.value.trim() !== "" ? wingBuilding.value : building.value,
      wing: wingBuilding.value.trim() !== "" ? "" : wing.value,
      flatNumber: flatNumber.value,
      residentName: residentName.value,
      residentType: residentType.value,
      primaryMobile:
        primaryMobileField.value !== "" ? primaryMobileField.value : mobileField.value,
      additionalMobiles,
    },
  };
}

export function buildResidentImportConfirmLockKey(input: {
  societyId: string;
  wingBuilding?: string | null;
  flatNumber: string;
  residentName: string;
  primaryMobile: string | null | undefined;
}): string {
  const mobile = input.primaryMobile?.trim()
    ? normalizeMobile(input.primaryMobile)
    : "";
  return [
    input.societyId,
    compareKey(input.wingBuilding),
    compareKey(input.flatNumber),
    compareKey(input.residentName),
    mobile,
  ].join(RESIDENT_IMPORT_CONFIRM_LOCK_SEPARATOR);
}

export function parseAdminConfirmResidentImportRowResult(
  value: unknown,
): AdminConfirmResidentImportRowResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = readString(value.status);
  if (
    !(RESIDENT_IMPORT_CONFIRM_STATUSES as readonly string[]).includes(status)
  ) {
    return null;
  }
  const rowNumber = value.row_number ?? value.rowNumber;
  if (typeof rowNumber !== "number" || !Number.isInteger(rowNumber)) {
    return null;
  }
  const residentId = readString(value.resident_id ?? value.residentId);
  return {
    rowNumber,
    status: status as ResidentImportConfirmStatus,
    message: readString(value.message),
    residentId: residentId || null,
    residentName: readString(value.resident_name ?? value.residentName) || null,
    flatNumber: readString(value.flat_number ?? value.flatNumber) || null,
    wingBuilding: readString(value.wing_building ?? value.wingBuilding) || null,
    mobile: readString(value.mobile) || null,
  };
}

export function buildResidentImportConfirmWrite(
  row: ResidentImportConfirmProposedRow,
): ResidentImportConfirmWrite {
  const mobile = row.primaryMobile.trim();
  return {
    rowNumber: row.rowNumber,
    flatNumber: row.flatNumber.trim(),
    residentName: row.residentName.trim(),
    residentType: canonicalizeResidentImportType(row.residentType),
    mobile: mobile ? normalizeMobile(mobile) : null,
    wingBuilding: combineResidentImportWingBuilding(row.building, row.wing),
  };
}

export function residentImportBuildingReuseBlocked(
  existingWing: string | null | undefined,
  proposedWing: string | null | undefined,
): boolean {
  return compareKey(existingWing) !== compareKey(proposedWing);
}

function mapSkipStatus(
  status: Exclude<ResidentImportDatabaseStatus, "READY_TO_IMPORT">,
): Exclude<ResidentImportConfirmStatus, "IMPORTED" | "FAILED" | "INVALID"> {
  return status;
}

function summarize(
  rows: readonly ResidentImportConfirmRowResult[],
): ResidentImportConfirmSummary {
  return {
    rowsSubmitted: rows.length,
    imported: rows.filter((row) => row.status === "IMPORTED").length,
    alreadyExists: rows.filter((row) => row.status === "ALREADY_EXISTS").length,
    possibleConflicts: rows.filter(
      (row) => row.status === "POSSIBLE_DATABASE_CONFLICT",
    ).length,
    backendBlocked: rows.filter((row) => row.status === "BACKEND_BLOCKED").length,
    invalid: rows.filter((row) => row.status === "INVALID").length,
    failed: rows.filter((row) => row.status === "FAILED").length,
  };
}

/**
 * Parses planned confirm rows. society_id / societyId / society_code are ignored.
 */
export function parseResidentImportConfirmRequest(
  body: unknown,
): ParseConfirmRequestResult {
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
      message: "Confirmation requires a list of planned import rows.",
      status: 400,
    };
  }
  if (rowsValue.length > RESIDENT_IMPORT_CONFIRM_MAX_ROWS) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Too many rows were submitted for confirmation.",
      status: 400,
    };
  }

  const rows: ResidentImportConfirmProposedRow[] = [];
  for (const item of rowsValue) {
    if (!isRecord(item)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Each planned import row must be an object.",
        status: 400,
      };
    }
    const mapped = readResidentImportConfirmRowInput(item);
    if (!mapped.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: mapped.message,
        status: 400,
      };
    }
    rows.push(mapped.row);
  }

  return { ok: true, rows };
}

export async function processResidentImportConfirmRows(input: {
  proposed: readonly ResidentImportConfirmProposedRow[];
  existing: readonly ResidentImportExistingResident[];
  societyId: string;
  classifyAgainstDatabase: ClassifyAgainstDatabase;
  persist: (
    write: ResidentImportConfirmWrite,
  ) => Promise<PersistResidentImportConfirmResult>;
}): Promise<ResidentImportConfirmBatchResult> {
  const rows: ResidentImportConfirmRowResult[] = [];
  let existing = input.existing.filter((row) => row.societyId === input.societyId);

  for (const proposed of input.proposed) {
    const fields = validateResidentImportConfirmFields(proposed);
    if (!fields.ok) {
      rows.push({
        rowNumber: proposed.rowNumber,
        status: "INVALID",
        message: fields.message,
      });
      continue;
    }

    const classified = input.classifyAgainstDatabase({
      proposed: [proposed],
      existing,
      societyId: input.societyId,
    });
    const verdict = classified.rows[0];
    if (!verdict) {
      rows.push({
        rowNumber: proposed.rowNumber,
        status: "FAILED",
        message: "This row could not be re-verified against existing residents.",
      });
      continue;
    }
    if (verdict.status !== "READY_TO_IMPORT") {
      rows.push({
        rowNumber: proposed.rowNumber,
        status: mapSkipStatus(verdict.status),
        message: verdict.message,
      });
      continue;
    }

    const write = buildResidentImportConfirmWrite(proposed);
    const persisted = await input.persist(write);
    if (!persisted.ok) {
      rows.push({
        rowNumber: proposed.rowNumber,
        status: persisted.status,
        message: persisted.message,
      });
      continue;
    }

    existing = [...existing, persisted.existing];
    rows.push({
      rowNumber: proposed.rowNumber,
      status: "IMPORTED",
      message: "Resident created in this society.",
    });
  }

  return {
    version: RESIDENT_IMPORT_CONFIRM_VERSION,
    summary: summarize(rows),
    rows,
  };
}

export const RESIDENT_IMPORT_CONFIRM_ALLOWED_BODY_KEYS = [
  "rows",
  "society_id",
  "societyId",
  "society_code",
] as const;

export const RESIDENT_IMPORT_CONFIRM_ALLOWED_ROW_KEYS = [
  "rowNumber",
  "flatNumber",
  "residentName",
  "residentType",
  "mobile",
  "primaryMobile",
  "wingBuilding",
  "building",
  "wing",
  "additionalMobiles",
  "society_id",
  "societyId",
  "society_code",
] as const;

export type ResidentImportConfirmApplicationResult =
  | "IMPORTED"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  | "BLOCKED"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SERVER_ERROR";

export type ResidentImportConfirmHttpErrorCode = Extract<
  ResidentImportConfirmApplicationResult,
  "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "SERVER_ERROR"
>;

export type ResidentImportConfirmAuthDecision =
  | { ok: true }
  | {
      ok: false;
      code: Extract<ResidentImportConfirmHttpErrorCode, "UNAUTHORIZED" | "FORBIDDEN">;
      status: 401 | 403;
      message: string;
    };

export type ParseResidentImportConfirmHttpRequestResult =
  | { ok: true; rows: ResidentImportConfirmProposedRow[] }
  | {
      ok: false;
      code: "VALIDATION_ERROR";
      message: string;
      status: 400;
    };

export type AdminConfirmResidentImportRpcArgs = {
  p_society_id: string;
  p_row_number: number;
  p_flat_number: string;
  p_resident_name: string;
  p_resident_type: string | null;
  p_mobile: string | null;
  p_wing_building: string | null;
  p_additional_mobiles: string[];
};

export type ResidentImportConfirmHttpRowResult = {
  rowNumber: number;
  status: ResidentImportConfirmStatus;
  result: Exclude<
    ResidentImportConfirmApplicationResult,
    "UNAUTHORIZED" | "FORBIDDEN"
  >;
  message: string;
};

export type ResidentImportConfirmHttpSuccess = {
  version: ResidentImportConfirmBatchResult["version"];
  summary: ResidentImportConfirmBatchResult["summary"];
  rows: ResidentImportConfirmHttpRowResult[];
};

const ALLOWED_BODY_KEYS = new Set<string>(RESIDENT_IMPORT_CONFIRM_ALLOWED_BODY_KEYS);
const ALLOWED_ROW_KEYS = new Set<string>(RESIDENT_IMPORT_CONFIRM_ALLOWED_ROW_KEYS);
const GENERIC_SERVER_ERROR_MESSAGE = "Unable to confirm the resident import.";

function firstUnexpectedKey(
  record: Record<string, unknown>,
  allowed: Set<string>,
): string | null {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      return key;
    }
  }
  return null;
}

/**
 * Mirrors authenticateAdminRequest JWT/role gates without changing that helper.
 */
export function classifyResidentImportConfirmAuth(input: {
  bearerToken: string | null;
  tokenVerification: "missing" | "invalid" | "expired" | "ok";
  appRole?: "guard" | "society_admin";
}): ResidentImportConfirmAuthDecision {
  if (input.bearerToken == null || input.bearerToken.trim() === "") {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      status: 401,
      message: "Authentication required.",
    };
  }
  if (
    input.tokenVerification === "missing"
    || input.tokenVerification === "invalid"
    || input.tokenVerification === "expired"
  ) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      status: 401,
      message: "Authentication required.",
    };
  }
  if (input.appRole !== "society_admin") {
    return {
      ok: false,
      code: "FORBIDDEN",
      status: 403,
      message: "Only society admins can perform this action.",
    };
  }
  return { ok: true };
}

/**
 * Confirmed society always comes from the verified JWT/server identity.
 * Client society identifiers are ignored even if present.
 */
export function resolveResidentImportConfirmSocietyId(
  jwtSocietyId: string,
  _clientBody?: unknown,
): string {
  return jwtSocietyId;
}

export function parseResidentImportConfirmHttpRequest(
  body: unknown,
): ParseResidentImportConfirmHttpRequestResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Request body must be valid JSON.",
      status: 400,
    };
  }

  const unexpectedBodyKey = firstUnexpectedKey(body, ALLOWED_BODY_KEYS);
  if (unexpectedBodyKey) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Request contains unexpected fields.",
      status: 400,
    };
  }

  const rowsValue = body.rows;
  if (!Array.isArray(rowsValue)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Confirmation requires a list of planned import rows.",
      status: 400,
    };
  }
  if (rowsValue.length > RESIDENT_IMPORT_CONFIRM_MAX_ROWS) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Too many rows were submitted for confirmation.",
      status: 400,
    };
  }

  const rows: ResidentImportConfirmProposedRow[] = [];
  for (const item of rowsValue) {
    if (!isRecord(item)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Each planned import row must be an object.",
        status: 400,
      };
    }
    const unexpectedRowKey = firstUnexpectedKey(item, ALLOWED_ROW_KEYS);
    if (unexpectedRowKey) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "A planned import row contains unexpected fields.",
        status: 400,
      };
    }
    const mapped = readResidentImportConfirmRowInput(item);
    if (!mapped.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: mapped.message,
        status: 400,
      };
    }
    const fields = validateResidentImportConfirmFields(mapped.row);
    if (!fields.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: fields.message,
        status: 400,
      };
    }
    rows.push(mapped.row);
  }

  return { ok: true, rows };
}

export function buildAdminConfirmResidentImportRpcArgs(input: {
  societyId: string;
  write: ResidentImportConfirmWrite;
  additionalMobiles?: readonly string[];
}): AdminConfirmResidentImportRpcArgs {
  return {
    p_society_id: input.societyId,
    p_row_number: input.write.rowNumber,
    p_flat_number: input.write.flatNumber,
    p_resident_name: input.write.residentName,
    p_resident_type: input.write.residentType,
    p_mobile: input.write.mobile,
    p_wing_building: input.write.wingBuilding,
    p_additional_mobiles: [...(input.additionalMobiles ?? [])],
  };
}

export function mapResidentImportConfirmRpcArgsFromApprovedRow(input: {
  jwtSocietyId: string;
  clientSocietyId?: unknown;
  row: ResidentImportConfirmProposedRow;
}): AdminConfirmResidentImportRpcArgs {
  const write = buildResidentImportConfirmWrite(input.row);
  return buildAdminConfirmResidentImportRpcArgs({
    societyId: resolveResidentImportConfirmSocietyId(
      input.jwtSocietyId,
      { society_id: input.clientSocietyId },
    ),
    write,
    additionalMobiles: input.row.additionalMobiles,
  });
}

export function mapResidentImportConfirmApplicationResult(
  status: ResidentImportConfirmStatus,
): Exclude<ResidentImportConfirmApplicationResult, "UNAUTHORIZED" | "FORBIDDEN"> {
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

export function toResidentImportConfirmHttpSuccess(
  batch: ResidentImportConfirmBatchResult,
): ResidentImportConfirmHttpSuccess {
  return {
    version: batch.version,
    summary: batch.summary,
    rows: batch.rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      result: mapResidentImportConfirmApplicationResult(row.status),
      message: row.message,
    })),
  };
}

export function sanitizeResidentImportConfirmServerError(): {
  code: "SERVER_ERROR";
  message: string;
  status: 500;
} {
  return {
    code: "SERVER_ERROR",
    message: GENERIC_SERVER_ERROR_MESSAGE,
    status: 500,
  };
}

export function sanitizeResidentImportConfirmRpcFailure(): {
  ok: false;
  status: "FAILED";
  message: string;
} {
  return {
    ok: false,
    status: "FAILED",
    message:
      "Resident and flat link could not be written together. This confirm path will not fall back to a two-step write.",
  };
}

export function buildResidentImportConfirmSafeLog(input: {
  societyId: string;
  rowNumber: number;
  result: string;
}): { societyId: string; rowNumber: number; result: string } {
  return {
    societyId: input.societyId,
    rowNumber: input.rowNumber,
    result: input.result,
  };
}

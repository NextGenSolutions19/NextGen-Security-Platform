/**
 * Confirm-row planner for admin-resident-import-confirm.
 * Must stay aligned with packages/shared/src/resident-import-confirm.ts.
 * society_id from the client is ignored.
 */

import {
  classifyResidentImportAgainstDatabase,
  type ResidentImportExistingResident,
  type ResidentImportVerifyProposedRow,
} from "./resident-import-verify.ts";

export const RESIDENT_IMPORT_CONFIRM_VERSION = 1 as const;
export const RESIDENT_IMPORT_CONFIRM_MAX_ROWS = 200;
export const ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC =
  "admin_confirm_resident_import_row" as const;
const RESIDENT_IMPORT_CONFIRM_LOCK_SEPARATOR = "\u001f";
export const RESIDENT_IMPORT_CONFIRM_STATUSES = [
  "IMPORTED",
  "ALREADY_EXISTS",
  "POSSIBLE_DATABASE_CONFLICT",
  "BACKEND_BLOCKED",
  "INVALID",
  "FAILED",
] as const;

export const RESIDENT_IMPORT_CONFIRM_CANONICAL_TYPES = [
  "Owner",
  "Tenant",
  "Family Member",
  "Other",
] as const;

export type ResidentImportConfirmCanonicalType =
  (typeof RESIDENT_IMPORT_CONFIRM_CANONICAL_TYPES)[number];

export type ResidentImportConfirmStatus =
  | "IMPORTED"
  | "ALREADY_EXISTS"
  | "POSSIBLE_DATABASE_CONFLICT"
  | "BACKEND_BLOCKED"
  | "INVALID"
  | "FAILED";

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

export function sameResidentImportFlatNumber(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function residentImportBuildingsIncompatible(
  existingWing: string | null | undefined,
  proposedWing: string | null | undefined,
): boolean {
  const existingKey = compareKey(existingWing);
  const proposedKey = compareKey(proposedWing);
  return existingKey !== "" && proposedKey !== "" && existingKey !== proposedKey;
}

export function residentImportBuildingReuseBlocked(
  existingWing: string | null | undefined,
  proposedWing: string | null | undefined,
): boolean {
  return compareKey(existingWing) !== compareKey(proposedWing);
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

/**
 * Parses planned confirm rows. society_id / societyId / society_code are ignored.
 */
export function parseResidentImportConfirmRequest(body: unknown):
  | { ok: true; rows: ResidentImportConfirmProposedRow[] }
  | { ok: false; code: string; message: string; status: number } {
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
  persist: (
    write: ResidentImportConfirmWrite,
  ) => Promise<PersistResidentImportConfirmResult>;
}): Promise<{
  version: typeof RESIDENT_IMPORT_CONFIRM_VERSION;
  summary: {
    rowsSubmitted: number;
    imported: number;
    alreadyExists: number;
    possibleConflicts: number;
    backendBlocked: number;
    invalid: number;
    failed: number;
  };
  rows: ResidentImportConfirmRowResult[];
}> {
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

    const classified = classifyResidentImportAgainstDatabase({
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
        status: verdict.status,
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
    summary: {
      rowsSubmitted: rows.length,
      imported: rows.filter((row) => row.status === "IMPORTED").length,
      alreadyExists: rows.filter((row) => row.status === "ALREADY_EXISTS").length,
      possibleConflicts: rows.filter(
        (row) => row.status === "POSSIBLE_DATABASE_CONFLICT",
      ).length,
      backendBlocked: rows.filter((row) => row.status === "BACKEND_BLOCKED")
        .length,
      invalid: rows.filter((row) => row.status === "INVALID").length,
      failed: rows.filter((row) => row.status === "FAILED").length,
    },
    rows,
  };
}

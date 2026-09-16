/**
 * Application-facing HTTP contract for admin-resident-import-confirm.
 * Must stay aligned with packages/shared/src/resident-import-confirm-http.ts.
 */

import {
  ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC,
  RESIDENT_IMPORT_CONFIRM_MAX_ROWS,
  buildResidentImportConfirmWrite,
  readResidentImportConfirmRowInput,
  validateResidentImportConfirmFields,
  type ResidentImportConfirmBatchResult,
  type ResidentImportConfirmProposedRow,
  type ResidentImportConfirmStatus,
  type ResidentImportConfirmWrite,
} from "./resident-import-confirm.ts";

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

const GENERIC_SERVER_ERROR_MESSAGE =
  "Unable to confirm the resident import.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

export const RESIDENT_IMPORT_CONFIRM_RPC_NAME = ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC;

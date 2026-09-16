export const ADMIN_RESIDENT_TYPES = [
  "Owner",
  "Tenant",
  "Family Member",
  "Other",
] as const;

export type AdminResidentType = (typeof ADMIN_RESIDENT_TYPES)[number];

export const INDIAN_MOBILE_NUMBER_PATTERN = /^[6-9][0-9]{9}$/;
export const INDIAN_MOBILE_VALIDATION_MESSAGE =
  "Enter a valid 10-digit Indian mobile number.";

export type AdminResidentAction = "create" | "update" | "archive" | "reactivate";

export interface AdminResidentFormValue {
  flatNumber: string;
  residentName: string;
  mobile: string;
  wingBuilding: string | null;
  residentType: AdminResidentType | null;
}

export interface ParsedCreateResidentInput {
  action: "create";
  form: AdminResidentFormValue;
}

export interface ParsedUpdateResidentInput {
  action: "update";
  residentId: string;
  residentFlatId: string;
  form: AdminResidentFormValue;
}

export interface ParsedArchiveResidentInput {
  action: "archive";
  residentId: string;
}

export interface ParsedReactivateResidentInput {
  action: "reactivate";
  residentId: string;
}

export type ParsedAdminResidentInput =
  | ParsedCreateResidentInput
  | ParsedUpdateResidentInput
  | ParsedArchiveResidentInput
  | ParsedReactivateResidentInput;

export type AdminResidentValidationResult =
  | { ok: true; value: ParsedAdminResidentInput }
  | { ok: false; code: string; message: string; status: number };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeIndianMobileNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits.slice(0, 10);
}

function isValidIndianMobileNumber(value: string): boolean {
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

function normalizeOptionalText(value: unknown): string | null {
  const trimmed = readString(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAdminResidentType(value: string): value is AdminResidentType {
  return (ADMIN_RESIDENT_TYPES as readonly string[]).includes(value);
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseForm(
  body: Record<string, unknown>,
): { ok: true; value: AdminResidentFormValue } | { ok: false; message: string } {
  const flatNumber = readString(body.flatNumber).trim();
  const residentName = readString(body.residentName).trim();
  const rawMobile = readString(body.mobile);
  const mobile = normalizeIndianMobileNumber(rawMobile);
  const wingBuilding = normalizeOptionalText(body.wingBuilding);
  const residentType = normalizeOptionalText(body.residentType);

  if (!flatNumber) {
    return { ok: false, message: "Enter a flat number." };
  }

  if (!residentName) {
    return { ok: false, message: "Enter a resident name." };
  }

  if (!rawMobile.trim()) {
    return { ok: false, message: "Enter a mobile number." };
  }

  if (!isValidIndianMobileNumber(rawMobile)) {
    return { ok: false, message: INDIAN_MOBILE_VALIDATION_MESSAGE };
  }

  if (residentType && !isAdminResidentType(residentType)) {
    return { ok: false, message: "Select a valid resident type." };
  }

  return {
    ok: true,
    value: {
      flatNumber,
      residentName,
      mobile,
      wingBuilding,
      residentType: residentType && isAdminResidentType(residentType)
        ? residentType
        : null,
    },
  };
}

/**
 * Parses Admin resident mutations.
 * society_id / societyId / society_code from the client are ignored.
 * Create ignores any client-supplied residentId.
 */
export function validateAdminResidentInput(
  body: unknown,
): AdminResidentValidationResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Request body must be valid JSON.",
      status: 400,
    };
  }

  const action = readString(body.action).trim() as AdminResidentAction;
  if (
    action !== "create" &&
    action !== "update" &&
    action !== "archive" &&
    action !== "reactivate"
  ) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Select a valid resident action.",
      status: 400,
    };
  }

  if (action === "create") {
    const form = parseForm(body);
    if (!form.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: form.message,
        status: 400,
      };
    }

    return {
      ok: true,
      value: {
        action: "create",
        form: form.value,
      },
    };
  }

  const residentId = readString(body.residentId).trim();
  if (!isUuid(residentId)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Resident is required.",
      status: 400,
    };
  }

  if (action === "archive") {
    return { ok: true, value: { action: "archive", residentId } };
  }

  if (action === "reactivate") {
    return { ok: true, value: { action: "reactivate", residentId } };
  }

  const residentFlatId = readString(body.residentFlatId).trim();
  if (!isUuid(residentFlatId)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Resident record is required.",
      status: 400,
    };
  }

  const form = parseForm(body);
  if (!form.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: form.message,
      status: 400,
    };
  }

  return {
    ok: true,
    value: {
      action: "update",
      residentId,
      residentFlatId,
      form: form.value,
    },
  };
}

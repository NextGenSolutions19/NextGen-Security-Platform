/**
 * Admin create-recurring-pass request parsing.
 *
 * Keep field rules aligned with packages/shared/src/recurring-visitor-pass.ts
 * and packages/shared/src/admin-recurring-pass-create.ts. Deno Edge Functions
 * cannot import the workspace package.
 */

import {
  isValidIndianMobileNumber,
  normalizeIndianMobileNumber,
} from "./visitor-purposes.ts";
import { VISITOR_PHOTO_ALLOWED_MIME_TYPE_SET } from "./storage-config.ts";

export const RECURRING_VISITOR_TYPE_DEFINITIONS = [
  { code: "DOMESTIC_HELP", label: "Domestic Help / Maid" },
  { code: "DRIVER", label: "Driver" },
  { code: "MILKMAN", label: "Milkman" },
  { code: "NEWSPAPER_VENDOR", label: "Newspaper Vendor" },
  { code: "COOK", label: "Cook" },
  { code: "CLEANER", label: "Cleaner" },
  { code: "TUTOR", label: "Tutor" },
  { code: "CAREGIVER", label: "Caregiver" },
  { code: "OTHER", label: "Other" },
] as const;

export type RecurringVisitorTypeCode =
  (typeof RECURRING_VISITOR_TYPE_DEFINITIONS)[number]["code"];

const VISITOR_TYPE_CODES = new Set<string>(
  RECURRING_VISITOR_TYPE_DEFINITIONS.map((type) => type.code),
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const VISITOR_NAME_MAX_LENGTH = 80;
const VISITOR_TYPE_LABEL_MAX_LENGTH = 80;
const DESTINATION_TEXT_MAX_LENGTH = 80;
const VEHICLE_NUMBER_MAX_LENGTH = 20;
const NOTES_MAX_LENGTH = 500;

const FORBIDDEN_CLIENT_FIELDS = [
  "society_id",
  "societyId",
  "id",
  "pass_id",
  "passId",
  "status",
  "created_by_app_user_id",
  "createdByAppUserId",
  "token_hash",
  "tokenHash",
] as const;

export interface AdminCreateRecurringPassValue {
  visitorName: string;
  visitorMobile: string;
  visitorTypeCode: RecurringVisitorTypeCode;
  visitorTypeLabel: string;
  flatId: string | null;
  residentId: string | null;
  destinationText: string | null;
  vehicleNumber: string | null;
  validFrom: string;
  validUntil: string;
  allowedDaysOfWeek: number[];
  allowedEntryFromTime: string | null;
  allowedEntryToTime: string | null;
  notes: string | null;
  imageBase64: string;
  contentType: string;
}

export type AdminCreateRecurringPassValidation =
  | { ok: true; value: AdminCreateRecurringPassValue }
  | { ok: false; code: string; message: string; status: number };

function fail(message: string): Extract<AdminCreateRecurringPassValidation, { ok: false }> {
  return { ok: false, code: "VALIDATION_ERROR", message, status: 400 };
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function parseIsoDate(
  value: unknown,
  requiredMessage: string,
): { ok: true; isoDate: string } | { ok: false; message: string } {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { ok: false, message: requiredMessage };
  }
  const match = ISO_CALENDAR_DATE_PATTERN.exec(raw);
  if (!match) {
    return { ok: false, message: requiredMessage };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealCalendarDate(year, month, day)) {
    return { ok: false, message: requiredMessage };
  }
  return { ok: true, isoDate: `${match[1]}-${match[2]}-${match[3]}` };
}

function timeToSeconds(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  return hour * 3600 + minute * 60 + second;
}

function formatSqlTime(totalSeconds: number): string {
  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;
  return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function catalogLabel(code: RecurringVisitorTypeCode): string {
  return (
    RECURRING_VISITOR_TYPE_DEFINITIONS.find((type) => type.code === code)?.label ??
    code
  );
}

export function validateAdminCreateRecurringPassInput(
  body: unknown,
): AdminCreateRecurringPassValidation {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return fail("Request body must be a JSON object.");
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (field in record) {
      if (field === "society_id" || field === "societyId") {
        return fail("Society is taken from the authenticated session.");
      }
      return fail("Server-derived fields must not be supplied by the client.");
    }
  }

  const visitorName = String(record.visitor_name ?? "").trim();
  if (!visitorName) {
    return fail("Enter the visitor's full name.");
  }
  if (visitorName.length > VISITOR_NAME_MAX_LENGTH) {
    return fail(`Full name must be ${VISITOR_NAME_MAX_LENGTH} characters or fewer.`);
  }

  const visitorMobile = normalizeIndianMobileNumber(
    String(record.visitor_mobile ?? ""),
  );
  if (!isValidIndianMobileNumber(visitorMobile)) {
    return fail("Enter a valid 10-digit Indian mobile number.");
  }

  const visitorTypeCodeRaw = String(record.visitor_type_code ?? "").trim();
  if (!VISITOR_TYPE_CODES.has(visitorTypeCodeRaw)) {
    return fail("Select a visitor type.");
  }
  const visitorTypeCode = visitorTypeCodeRaw as RecurringVisitorTypeCode;

  let visitorTypeLabel: string;
  if (visitorTypeCode === "OTHER") {
    const customLabel = String(record.custom_visitor_type ?? "").trim();
    if (!customLabel) {
      return fail("Specify the visitor type.");
    }
    if (customLabel.length > VISITOR_TYPE_LABEL_MAX_LENGTH) {
      return fail(
        `Visitor type must be ${VISITOR_TYPE_LABEL_MAX_LENGTH} characters or fewer.`,
      );
    }
    visitorTypeLabel = customLabel;
  } else {
    visitorTypeLabel = catalogLabel(visitorTypeCode);
  }

  const flatIdRaw = String(record.flat_id ?? "").trim();
  const destinationTextRaw = String(record.destination_text ?? "").trim();
  const residentIdRaw = optionalText(record.resident_id);
  const hasFlat = Boolean(flatIdRaw);
  const hasDestination = Boolean(destinationTextRaw);

  if (!hasFlat && !hasDestination) {
    return fail("Select an existing flat or enter an Other destination.");
  }
  if (hasFlat && hasDestination) {
    return fail("Choose either an existing flat or Other destination, not both.");
  }

  let flatId: string | null = null;
  let destinationText: string | null = null;
  let residentId: string | null = null;

  if (hasFlat) {
    if (!isUuid(flatIdRaw)) {
      return fail("flat_id must be a valid UUID.");
    }
    flatId = flatIdRaw;
    if (residentIdRaw) {
      if (!isUuid(residentIdRaw)) {
        return fail("resident_id must be a valid UUID.");
      }
      residentId = residentIdRaw;
    }
  } else {
    if (destinationTextRaw.length > DESTINATION_TEXT_MAX_LENGTH) {
      return fail(
        `Destination must be ${DESTINATION_TEXT_MAX_LENGTH} characters or fewer.`,
      );
    }
    destinationText = destinationTextRaw;
    if (residentIdRaw) {
      return fail("Other destination cannot be linked to a resident.");
    }
  }

  const vehicleRaw = optionalText(record.vehicle_number);
  if (vehicleRaw && vehicleRaw.length > VEHICLE_NUMBER_MAX_LENGTH) {
    return fail(
      `Vehicle number must be ${VEHICLE_NUMBER_MAX_LENGTH} characters or fewer.`,
    );
  }

  const notesRaw = optionalText(record.notes);
  if (notesRaw && notesRaw.length > NOTES_MAX_LENGTH) {
    return fail(`Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`);
  }

  const validFrom = parseIsoDate(record.valid_from, "Enter a valid from date.");
  if (!validFrom.ok) {
    return fail(validFrom.message);
  }
  const validUntil = parseIsoDate(record.valid_until, "Enter a valid until date.");
  if (!validUntil.ok) {
    return fail(validUntil.message);
  }
  if (validUntil.isoDate < validFrom.isoDate) {
    return fail("Valid Until cannot be before Valid From.");
  }

  const daysRaw = record.allowed_days_of_week;
  if (!Array.isArray(daysRaw)) {
    return fail("Select at least one allowed day.");
  }
  const days = new Set<number>();
  for (const value of daysRaw) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) {
      return fail("Allowed days must be between 0 (Sunday) and 6 (Saturday).");
    }
    days.add(value);
  }
  if (days.size === 0) {
    return fail("Select at least one allowed day.");
  }
  const allowedDaysOfWeek = [...days].sort((left, right) => left - right);

  const fromRaw = optionalText(record.allowed_entry_from_time) ?? "";
  const toRaw = optionalText(record.allowed_entry_to_time) ?? "";
  let allowedEntryFromTime: string | null = null;
  let allowedEntryToTime: string | null = null;
  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) {
      return fail(
        "Enter both Allowed Entry From and Allowed Entry To, or leave both blank.",
      );
    }
    const fromSeconds = timeToSeconds(fromRaw);
    const toSeconds = timeToSeconds(toRaw);
    if (fromSeconds === null || toSeconds === null) {
      return fail("Enter a valid 24-hour time (HH:MM).");
    }
    if (toSeconds <= fromSeconds) {
      return fail("Allowed Entry To must be later than Allowed Entry From.");
    }
    allowedEntryFromTime = formatSqlTime(fromSeconds);
    allowedEntryToTime = formatSqlTime(toSeconds);
  }

  const imageBase64 = String(record.image_base64 ?? "").trim();
  if (!imageBase64) {
    return fail("A visitor photo is required.");
  }

  const contentType = String(record.content_type ?? "image/jpeg")
    .trim()
    .toLowerCase();
  if (!VISITOR_PHOTO_ALLOWED_MIME_TYPE_SET.has(contentType)) {
    return fail("Unsupported photo content type.");
  }

  return {
    ok: true,
    value: {
      visitorName,
      visitorMobile,
      visitorTypeCode,
      visitorTypeLabel,
      flatId,
      residentId,
      destinationText,
      vehicleNumber: vehicleRaw,
      validFrom: validFrom.isoDate,
      validUntil: validUntil.isoDate,
      allowedDaysOfWeek,
      allowedEntryFromTime,
      allowedEntryToTime,
      notes: notesRaw,
      imageBase64,
      contentType,
    },
  };
}

export function validateRecurringPassPhotoRequest(body: unknown):
  | { ok: true; passId: string }
  | { ok: false; code: string; message: string; status: number } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return fail("Request body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  if ("society_id" in record || "societyId" in record) {
    return fail("Society is taken from the authenticated session.");
  }
  const passId = String(record.pass_id ?? "").trim();
  if (!passId || !isUuid(passId)) {
    return fail("pass_id must be a valid UUID.");
  }
  return { ok: true, passId };
}

const UPDATE_FORBIDDEN_FIELDS = [
  "society_id",
  "societyId",
  "status",
  "visitor_name",
  "visitorName",
  "visitor_mobile",
  "visitorMobile",
  "visitor_type_code",
  "visitorTypeCode",
  "visitor_type_label",
  "custom_visitor_type",
  "flat_id",
  "resident_id",
  "destination_text",
  "image_base64",
  "content_type",
  "photo",
  "suspended_at",
  "suspension_reason",
  "suspended_by_app_user_id",
  "revoked_at",
  "revocation_reason",
  "revoked_by_app_user_id",
  "token_hash",
  "tokenHash",
  "created_by_app_user_id",
  "createdByAppUserId",
  "id",
] as const;

export interface AdminUpdateRecurringPassScheduleValue {
  passId: string;
  validFrom: string;
  validUntil: string;
  allowedDaysOfWeek: number[];
  allowedEntryFromTime: string | null;
  allowedEntryToTime: string | null;
  vehicleNumber: string | null;
  notes: string | null;
}

export function validateAdminUpdateRecurringPassScheduleInput(
  body: unknown,
):
  | { ok: true; value: AdminUpdateRecurringPassScheduleValue }
  | { ok: false; code: string; message: string; status: number } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return fail("Request body must be a JSON object.");
  }

  const record = body as Record<string, unknown>;

  for (const field of UPDATE_FORBIDDEN_FIELDS) {
    if (field in record) {
      if (field === "society_id" || field === "societyId") {
        return fail("Society is taken from the authenticated session.");
      }
      return fail("Server-derived fields must not be supplied by the client.");
    }
  }

  const passId = String(record.pass_id ?? "").trim();
  if (!passId || !isUuid(passId)) {
    return fail("pass_id must be a valid UUID.");
  }

  const validFrom = parseIsoDate(record.valid_from, "Enter a valid from date.");
  if (!validFrom.ok) {
    return fail(validFrom.message);
  }
  const validUntil = parseIsoDate(record.valid_until, "Enter a valid until date.");
  if (!validUntil.ok) {
    return fail(validUntil.message);
  }
  if (validUntil.isoDate < validFrom.isoDate) {
    return fail("Valid Until cannot be before Valid From.");
  }

  const daysRaw = record.allowed_days_of_week;
  if (!Array.isArray(daysRaw)) {
    return fail("Select at least one allowed day.");
  }
  const days = new Set<number>();
  for (const value of daysRaw) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) {
      return fail("Allowed days must be between 0 (Sunday) and 6 (Saturday).");
    }
    days.add(value);
  }
  if (days.size === 0) {
    return fail("Select at least one allowed day.");
  }

  const vehicleRaw = optionalText(record.vehicle_number);
  if (vehicleRaw && vehicleRaw.length > VEHICLE_NUMBER_MAX_LENGTH) {
    return fail(
      `Vehicle number must be ${VEHICLE_NUMBER_MAX_LENGTH} characters or fewer.`,
    );
  }

  const notesRaw = optionalText(record.notes);
  if (notesRaw && notesRaw.length > NOTES_MAX_LENGTH) {
    return fail(`Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`);
  }

  const fromRaw = optionalText(record.allowed_entry_from_time) ?? "";
  const toRaw = optionalText(record.allowed_entry_to_time) ?? "";
  let allowedEntryFromTime: string | null = null;
  let allowedEntryToTime: string | null = null;
  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) {
      return fail(
        "Enter both Allowed Entry From and Allowed Entry To, or leave both blank.",
      );
    }
    const fromSeconds = timeToSeconds(fromRaw);
    const toSeconds = timeToSeconds(toRaw);
    if (fromSeconds === null || toSeconds === null) {
      return fail("Enter a valid 24-hour time (HH:MM).");
    }
    if (toSeconds <= fromSeconds) {
      return fail("Allowed Entry To must be later than Allowed Entry From.");
    }
    allowedEntryFromTime = formatSqlTime(fromSeconds);
    allowedEntryToTime = formatSqlTime(toSeconds);
  }

  return {
    ok: true,
    value: {
      passId,
      validFrom: validFrom.isoDate,
      validUntil: validUntil.isoDate,
      allowedDaysOfWeek: [...days].sort((left, right) => left - right),
      allowedEntryFromTime,
      allowedEntryToTime,
      vehicleNumber: vehicleRaw,
      notes: notesRaw,
    },
  };
}

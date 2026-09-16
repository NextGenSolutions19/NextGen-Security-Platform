/**
 * M04-T01 recurring visitor pass foundation.
 *
 * Keep every limit and allowed value in sync with
 * supabase/migrations/20260909140000_m04_recurring_visitor_pass_foundation.sql.
 *
 * Two invariants this module exists to protect:
 *
 * 1. "Expired" is never persisted. The database stores active | suspended |
 *    revoked only, and expiry is derived from valid_until against the current
 *    Asia/Kolkata date. `resolveRecurringPassDisplayState` is the only place
 *    that derivation should happen.
 *
 * 2. QR validation and the "QR Not Available" fallback must never drift apart.
 *    Both call `evaluateRecurringPassUsability`. Do not reimplement these
 *    checks in either path.
 */

import { ASIA_KOLKATA_TIMEZONE } from "./admin-visitor-history.ts";

// ---------------------------------------------------------------------------
// Persisted status vs derived display state
// ---------------------------------------------------------------------------

export const RECURRING_VISITOR_PASS_STATUSES = [
  "active",
  "suspended",
  "revoked",
] as const;

export type RecurringVisitorPassStatus =
  (typeof RECURRING_VISITOR_PASS_STATUSES)[number];

/** Admin-facing states. `expired` is derived and never stored. */
export const RECURRING_VISITOR_PASS_DISPLAY_STATES = [
  "active",
  "suspended",
  "expired",
  "revoked",
] as const;

export type RecurringVisitorPassDisplayState =
  (typeof RECURRING_VISITOR_PASS_DISPLAY_STATES)[number];

export const RECURRING_VISITOR_PASS_STATE_LABELS: Record<
  RecurringVisitorPassDisplayState,
  string
> = {
  active: "Active",
  suspended: "Suspended",
  expired: "Expired",
  revoked: "Revoked",
};

export function isRecurringVisitorPassStatus(
  value: string,
): value is RecurringVisitorPassStatus {
  return (RECURRING_VISITOR_PASS_STATUSES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Recurring personnel categories
// ---------------------------------------------------------------------------

export interface RecurringVisitorTypeDefinition {
  code: string;
  label: string;
  sortOrder: number;
}

export const RECURRING_VISITOR_TYPES = [
  { code: "DOMESTIC_HELP", label: "Domestic Help / Maid", sortOrder: 10 },
  { code: "DRIVER", label: "Driver", sortOrder: 20 },
  { code: "MILKMAN", label: "Milkman", sortOrder: 30 },
  { code: "NEWSPAPER_VENDOR", label: "Newspaper Vendor", sortOrder: 40 },
  { code: "COOK", label: "Cook", sortOrder: 50 },
  { code: "CLEANER", label: "Cleaner", sortOrder: 60 },
  { code: "TUTOR", label: "Tutor", sortOrder: 70 },
  { code: "CAREGIVER", label: "Caregiver", sortOrder: 80 },
  { code: "OTHER", label: "Other", sortOrder: 90 },
] as const satisfies readonly RecurringVisitorTypeDefinition[];

export type RecurringVisitorTypeCode =
  (typeof RECURRING_VISITOR_TYPES)[number]["code"];

export function isRecurringVisitorTypeCode(
  value: string,
): value is RecurringVisitorTypeCode {
  return RECURRING_VISITOR_TYPES.some((type) => type.code === value);
}

export function getRecurringVisitorType(
  code: string,
): RecurringVisitorTypeDefinition | undefined {
  return RECURRING_VISITOR_TYPES.find((type) => type.code === code);
}

/**
 * Label to persist alongside the code, so a future display-name change does not
 * rewrite history. Mirrors how visitor_entries stores purpose_label next to
 * purpose_code.
 */
export function resolveRecurringVisitorTypeLabel(code: string): string | null {
  return getRecurringVisitorType(code)?.label ?? null;
}

export const RECURRING_PASS_VISITOR_TYPE_LABEL_MAX_LENGTH = 80;
export const RECURRING_PASS_TYPE_REQUIRED_MESSAGE = "Select a visitor type.";
export const RECURRING_PASS_OTHER_TYPE_REQUIRED_MESSAGE =
  "Specify the visitor type.";
export const RECURRING_PASS_OTHER_TYPE_TOO_LONG_MESSAGE =
  `Visitor type must be ${RECURRING_PASS_VISITOR_TYPE_LABEL_MAX_LENGTH} characters or fewer.`;

export function requiresCustomRecurringVisitorType(
  code: RecurringVisitorTypeCode | null | undefined,
): boolean {
  return code === "OTHER";
}

export type RecurringVisitorTypeResolveResult =
  | { ok: true; code: RecurringVisitorTypeCode; label: string }
  | {
      ok: false;
      field: "visitorTypeCode" | "customVisitorType";
      message: string;
    };

/**
 * Resolve the persisted code + label pair.
 *
 * Predefined types always store the catalog label and ignore leftover Other
 * text, so switching Other → Driver cannot keep "Gardener" as the Driver label.
 * OTHER stores the Admin's trimmed custom type, never the catalog word "Other".
 */
export function resolvePersistedRecurringVisitorType(input: {
  code: RecurringVisitorTypeCode | null | undefined;
  customLabel?: string | null;
}): RecurringVisitorTypeResolveResult {
  const code = input.code ?? null;
  if (!code || !isRecurringVisitorTypeCode(code)) {
    return {
      ok: false,
      field: "visitorTypeCode",
      message: RECURRING_PASS_TYPE_REQUIRED_MESSAGE,
    };
  }

  if (code !== "OTHER") {
    const label = resolveRecurringVisitorTypeLabel(code);
    if (!label) {
      return {
        ok: false,
        field: "visitorTypeCode",
        message: RECURRING_PASS_TYPE_REQUIRED_MESSAGE,
      };
    }
    return { ok: true, code, label };
  }

  const trimmed = (input.customLabel ?? "").trim();
  if (!trimmed) {
    return {
      ok: false,
      field: "customVisitorType",
      message: RECURRING_PASS_OTHER_TYPE_REQUIRED_MESSAGE,
    };
  }

  if (trimmed.length > RECURRING_PASS_VISITOR_TYPE_LABEL_MAX_LENGTH) {
    return {
      ok: false,
      field: "customVisitorType",
      message: RECURRING_PASS_OTHER_TYPE_TOO_LONG_MESSAGE,
    };
  }

  return { ok: true, code: "OTHER", label: trimmed };
}

/** Human-facing type: stored label, never the raw code. */
export function formatStoredRecurringVisitorType(item: {
  visitorTypeCode: string;
  visitorTypeLabel: string;
}): string {
  const stored = item.visitorTypeLabel.trim();
  if (stored) {
    return stored;
  }
  return resolveRecurringVisitorTypeLabel(item.visitorTypeCode) ?? item.visitorTypeCode;
}

/**
 * visitor_entries.purpose_code / purpose_label written by recurring check-ins.
 *
 * Deliberately NOT added to VISITOR_PURPOSE_DEFINITIONS: adding an enabled
 * definition would change the Guard's manual purpose picker, and M03 is frozen.
 * visitor_entries.purpose_code is plain text with no FK or CHECK, and already
 * holds the out-of-picker value 'legacy' for pre-M02 rows, so this follows an
 * established precedent. The specific worker category lives in
 * recurring_visitor_passes.visitor_type_code instead.
 */
export const RECURRING_SERVICE_PURPOSE_CODE = "recurring_service" as const;
export const RECURRING_SERVICE_PURPOSE_LABEL = "Recurring Service" as const;

export interface VisitorEntryPurposeSnapshot {
  purpose?: string | null;
  purposeCode?: string | null;
  purposeLabel?: string | null;
  customPurposeText?: string | null;
}

export function isRecurringServiceVisit(
  item: VisitorEntryPurposeSnapshot,
): boolean {
  return (item.purposeCode ?? "").trim() === RECURRING_SERVICE_PURPOSE_CODE;
}

export function resolveVisitorEntryTypeLabel(
  item: VisitorEntryPurposeSnapshot,
): string {
  if (isRecurringServiceVisit(item)) {
    return RECURRING_SERVICE_PURPOSE_LABEL;
  }
  return (item.purposeLabel ?? item.purpose ?? "").trim() || "—";
}

export function resolveVisitRecurringVisitorTypeLabel(
  item: VisitorEntryPurposeSnapshot,
): string | null {
  if (!isRecurringServiceVisit(item)) {
    return null;
  }
  const label = item.customPurposeText?.trim();
  return label ? label : null;
}

export function formatVisitPurposeSummary(
  item: VisitorEntryPurposeSnapshot,
): string {
  if (isRecurringServiceVisit(item)) {
    const visitorType = resolveVisitRecurringVisitorTypeLabel(item);
    if (visitorType) {
      return `${RECURRING_SERVICE_PURPOSE_LABEL} - ${visitorType}`;
    }
    return RECURRING_SERVICE_PURPOSE_LABEL;
  }
  return (item.purposeLabel || item.purpose || "").trim() || "—";
}

export function resolveAdminReportPurposeSummaryLabel(
  item: VisitorEntryPurposeSnapshot,
): string {
  if (!isRecurringServiceVisit(item)) {
    return resolveVisitorEntryTypeLabel(item);
  }
  const visitorType = resolveVisitRecurringVisitorTypeLabel(item);
  if (visitorType) {
    return `${visitorType} (${RECURRING_SERVICE_PURPOSE_LABEL})`;
  }
  return RECURRING_SERVICE_PURPOSE_LABEL;
}

// ---------------------------------------------------------------------------
// Entry method and fallback reasons
// ---------------------------------------------------------------------------

export const RECURRING_PASS_ENTRY_METHODS = [
  "RECURRING_QR",
  "RECURRING_FALLBACK",
] as const;

export type RecurringPassEntryMethod =
  (typeof RECURRING_PASS_ENTRY_METHODS)[number];

export const RECURRING_PASS_ENTRY_METHOD_LABELS: Record<
  RecurringPassEntryMethod,
  string
> = {
  RECURRING_QR: "Recurring QR",
  RECURRING_FALLBACK: "Recurring Pass Manual Fallback",
};

export function isRecurringPassEntryMethod(
  value: string,
): value is RecurringPassEntryMethod {
  return (RECURRING_PASS_ENTRY_METHODS as readonly string[]).includes(value);
}

export const RECURRING_PASS_NO_QR_REASONS = [
  "QR_FORGOTTEN",
  "QR_DAMAGED",
  "PHONE_UNAVAILABLE",
  "OTHER",
] as const;

export type RecurringPassNoQrReason =
  (typeof RECURRING_PASS_NO_QR_REASONS)[number];

export const RECURRING_PASS_NO_QR_REASON_LABELS: Record<
  RecurringPassNoQrReason,
  string
> = {
  QR_FORGOTTEN: "QR Forgotten",
  QR_DAMAGED: "QR Damaged",
  PHONE_UNAVAILABLE: "Phone Unavailable",
  OTHER: "Other",
};

export function isRecurringPassNoQrReason(
  value: string,
): value is RecurringPassNoQrReason {
  return (RECURRING_PASS_NO_QR_REASONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Append-only timeline event types
// ---------------------------------------------------------------------------

export const RECURRING_PASS_EVENT_TYPES = [
  "PASS_CREATED",
  "PASS_UPDATED",
  "PASS_SUSPENDED",
  "PASS_REACTIVATED",
  "PASS_REVOKED",
  "VALIDITY_RENEWED",
  "CREDENTIAL_ISSUED",
  "CREDENTIAL_REVOKED",
  "QR_VALIDATED",
  "QR_VALIDATION_REJECTED",
  "CHECKIN_VIA_QR",
  "CHECKIN_VIA_FALLBACK",
] as const;

export type RecurringPassEventType =
  (typeof RECURRING_PASS_EVENT_TYPES)[number];

export function isRecurringPassEventType(
  value: string,
): value is RecurringPassEventType {
  return (RECURRING_PASS_EVENT_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Field limits (mirror the migration CHECK constraints)
// ---------------------------------------------------------------------------

export const RECURRING_PASS_VISITOR_NAME_MAX_LENGTH = 80;
export const RECURRING_PASS_DESTINATION_TEXT_MAX_LENGTH = 80;
export const RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH = 20;
export const RECURRING_PASS_REASON_MAX_LENGTH = 200;
export const RECURRING_PASS_NOTES_MAX_LENGTH = 500;

/** SHA-256 lowercase hex, matching hashToken() output and the DB CHECK. */
export const RECURRING_PASS_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isRecurringPassTokenHash(value: string): boolean {
  return RECURRING_PASS_TOKEN_HASH_PATTERN.test(value);
}

/**
 * Opaque QR credential. Prefix is a product marker only — it is not a pass id,
 * society id, or personal field. The 42 hex chars are 21 CSPRNG bytes.
 * Total length is 48 so the DB CHECK cannot accept this plaintext as a hash.
 */
export const RECURRING_PASS_QR_TOKEN_PREFIX = "NGSP1.";
export const RECURRING_PASS_QR_TOKEN_RANDOM_BYTES = 21;
export const RECURRING_PASS_QR_TOKEN_LENGTH = 48;
export const RECURRING_PASS_QR_TOKEN_PATTERN = /^NGSP1\.[0-9a-f]{42}$/;

function getSecureRandomValues(bytes: Uint8Array): void {
  const webCrypto = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (!webCrypto?.getRandomValues) {
    throw new Error("Secure randomness is not available.");
  }
  webCrypto.getRandomValues(bytes);
}

export function generateRecurringPassQrToken(): string {
  const bytes = new Uint8Array(RECURRING_PASS_QR_TOKEN_RANDOM_BYTES);
  getSecureRandomValues(bytes);
  const secret = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${RECURRING_PASS_QR_TOKEN_PREFIX}${secret}`;
}

export function isRecurringPassQrToken(value: string): boolean {
  return (
    value.length === RECURRING_PASS_QR_TOKEN_LENGTH &&
    RECURRING_PASS_QR_TOKEN_PATTERN.test(value)
  );
}

export function parseRequiredRecurringPassReason(
  value: unknown,
): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = String(value ?? "").trim();
  if (!reason) {
    return { ok: false, message: "Enter a reason." };
  }
  if (reason.length > RECURRING_PASS_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `Reason must be ${RECURRING_PASS_REASON_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, reason };
}

// ---------------------------------------------------------------------------
// Allowed days of week (0 = Sunday .. 6 = Saturday, Asia/Kolkata)
// ---------------------------------------------------------------------------

export const RECURRING_PASS_WEEKDAYS = [
  { day: 0, label: "Sunday", shortLabel: "Sun" },
  { day: 1, label: "Monday", shortLabel: "Mon" },
  { day: 2, label: "Tuesday", shortLabel: "Tue" },
  { day: 3, label: "Wednesday", shortLabel: "Wed" },
  { day: 4, label: "Thursday", shortLabel: "Thu" },
  { day: 5, label: "Friday", shortLabel: "Fri" },
  { day: 6, label: "Saturday", shortLabel: "Sat" },
] as const;

export const ALLOWED_DAYS_REQUIRED_MESSAGE =
  "Select at least one allowed day.";
export const ALLOWED_DAYS_INVALID_MESSAGE =
  "Allowed days must be between 0 (Sunday) and 6 (Saturday).";

/**
 * Deduplicates and sorts weekday input so the stored smallint[] is canonical.
 * The database trigger rejects nulls and duplicates; this keeps the client from
 * ever producing them.
 */
export function normalizeAllowedDaysOfWeek(
  values: readonly unknown[],
): { ok: true; days: number[] } | { ok: false; message: string } {
  const days = new Set<number>();

  for (const value of values) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return { ok: false, message: ALLOWED_DAYS_INVALID_MESSAGE };
    }
    if (value < 0 || value > 6) {
      return { ok: false, message: ALLOWED_DAYS_INVALID_MESSAGE };
    }
    days.add(value);
  }

  if (days.size === 0) {
    return { ok: false, message: ALLOWED_DAYS_REQUIRED_MESSAGE };
  }

  return { ok: true, days: [...days].sort((left, right) => left - right) };
}

export function formatAllowedDaysOfWeek(days: readonly number[]): string {
  const normalized = normalizeAllowedDaysOfWeek(days);
  if (!normalized.ok) {
    return "";
  }

  if (normalized.days.length === 7) {
    return "Every day";
  }

  return normalized.days
    .map(
      (day) =>
        RECURRING_PASS_WEEKDAYS.find((weekday) => weekday.day === day)
          ?.shortLabel ?? "",
    )
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Asia/Kolkata evaluation helpers
// ---------------------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Current Asia/Kolkata calendar date as YYYY-MM-DD, for comparing date columns. */
export function getIstDateString(instant: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASIA_KOLKATA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

/**
 * Weekday of the Asia/Kolkata calendar date, 0 = Sunday .. 6 = Saturday.
 *
 * Derived from the IST calendar date rather than the raw instant, so a scan at
 * 00:30 IST Monday is Monday and not the previous UTC Sunday.
 */
export function getIstWeekday(instant: Date = new Date()): number {
  const [year, month, day] = getIstDateString(instant).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Current Asia/Kolkata wall-clock time as HH:MM:SS. */
export function getIstTimeOfDay(instant: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: ASIA_KOLKATA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  const second = Number(
    parts.find((part) => part.type === "second")?.value ?? "0",
  );

  return `${pad2(hour % 24)}:${pad2(minute)}:${pad2(second)}`;
}

/** Postgres `time` values arrive as HH:MM or HH:MM:SS. */
export function timeToSeconds(value: string): number | null {
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

export const RECURRING_PASS_TIME_WINDOW_INCOMPLETE_MESSAGE =
  "Enter both Allowed Entry From and Allowed Entry To, or leave both blank.";
export const RECURRING_PASS_TIME_WINDOW_INVALID_MESSAGE =
  "Enter a valid 24-hour time (HH:MM).";
export const RECURRING_PASS_TIME_WINDOW_ORDER_MESSAGE =
  "Allowed Entry To must be later than Allowed Entry From.";
export const RECURRING_PASS_VALID_FROM_REQUIRED_MESSAGE =
  "Enter a valid from date.";
export const RECURRING_PASS_VALID_UNTIL_REQUIRED_MESSAGE =
  "Enter a valid until date.";
export const RECURRING_PASS_VALIDITY_ORDER_MESSAGE =
  "Valid Until cannot be before Valid From.";
export const RECURRING_PASS_PHOTO_REQUIRED_MESSAGE =
  "A visitor photo is required.";
export const RECURRING_PASS_VEHICLE_TOO_LONG_MESSAGE =
  `Vehicle number must be ${RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH} characters or fewer.`;
export const RECURRING_PASS_NOTES_TOO_LONG_MESSAGE =
  `Notes must be ${RECURRING_PASS_NOTES_MAX_LENGTH} characters or fewer.`;

const ISO_CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatRecurringPassSqlTime(totalSeconds: number): string {
  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;
  return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function isRealIsoCalendarDate(year: number, month: number, day: number): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1000 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function parseRecurringPassIsoDate(
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
  if (!isRealIsoCalendarDate(year, month, day)) {
    return { ok: false, message: requiredMessage };
  }

  return { ok: true, isoDate: `${match[1]}-${match[2]}-${match[3]}` };
}

export function parseRecurringPassValidityRange(input: {
  validFrom?: unknown;
  validUntil?: unknown;
}):
  | { ok: true; validFrom: string; validUntil: string }
  | { ok: false; field: "validFrom" | "validUntil"; message: string } {
  const from = parseRecurringPassIsoDate(
    input.validFrom,
    RECURRING_PASS_VALID_FROM_REQUIRED_MESSAGE,
  );
  if (!from.ok) {
    return { ok: false, field: "validFrom", message: from.message };
  }

  const until = parseRecurringPassIsoDate(
    input.validUntil,
    RECURRING_PASS_VALID_UNTIL_REQUIRED_MESSAGE,
  );
  if (!until.ok) {
    return { ok: false, field: "validUntil", message: until.message };
  }

  if (until.isoDate < from.isoDate) {
    return {
      ok: false,
      field: "validUntil",
      message: RECURRING_PASS_VALIDITY_ORDER_MESSAGE,
    };
  }

  return { ok: true, validFrom: from.isoDate, validUntil: until.isoDate };
}

export function parseRecurringPassTimeWindow(input: {
  from?: string | null;
  to?: string | null;
}):
  | { ok: true; from: string | null; to: string | null }
  | {
      ok: false;
      field: "allowedEntryFromTime" | "allowedEntryToTime";
      message: string;
    } {
  const fromRaw = String(input.from ?? "").trim();
  const toRaw = String(input.to ?? "").trim();

  if (!fromRaw && !toRaw) {
    return { ok: true, from: null, to: null };
  }

  if (!fromRaw || !toRaw) {
    return {
      ok: false,
      field: fromRaw ? "allowedEntryToTime" : "allowedEntryFromTime",
      message: RECURRING_PASS_TIME_WINDOW_INCOMPLETE_MESSAGE,
    };
  }

  const fromSeconds = timeToSeconds(fromRaw);
  const toSeconds = timeToSeconds(toRaw);
  if (fromSeconds === null) {
    return {
      ok: false,
      field: "allowedEntryFromTime",
      message: RECURRING_PASS_TIME_WINDOW_INVALID_MESSAGE,
    };
  }
  if (toSeconds === null) {
    return {
      ok: false,
      field: "allowedEntryToTime",
      message: RECURRING_PASS_TIME_WINDOW_INVALID_MESSAGE,
    };
  }

  if (toSeconds <= fromSeconds) {
    return {
      ok: false,
      field: "allowedEntryToTime",
      message: RECURRING_PASS_TIME_WINDOW_ORDER_MESSAGE,
    };
  }

  return {
    ok: true,
    from: formatRecurringPassSqlTime(fromSeconds),
    to: formatRecurringPassSqlTime(toSeconds),
  };
}

export function parseOptionalRecurringPassVehicle(
  value: unknown,
): { ok: true; vehicleNumber: string | null } | { ok: false; message: string } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return { ok: true, vehicleNumber: null };
  }
  if (trimmed.length > RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH) {
    return { ok: false, message: RECURRING_PASS_VEHICLE_TOO_LONG_MESSAGE };
  }
  return { ok: true, vehicleNumber: trimmed };
}

export function parseOptionalRecurringPassNotes(
  value: unknown,
): { ok: true; notes: string | null } | { ok: false; message: string } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return { ok: true, notes: null };
  }
  if (trimmed.length > RECURRING_PASS_NOTES_MAX_LENGTH) {
    return { ok: false, message: RECURRING_PASS_NOTES_TOO_LONG_MESSAGE };
  }
  return { ok: true, notes: trimmed };
}

// ---------------------------------------------------------------------------
// Derived expiry and display state
// ---------------------------------------------------------------------------

export interface RecurringVisitorPassValidity {
  status: RecurringVisitorPassStatus;
  /** IST calendar date, YYYY-MM-DD. Inclusive. */
  validFrom: string;
  /** IST calendar date, YYYY-MM-DD. Inclusive. */
  validUntil: string;
}

/**
 * Derived, never stored. A revoked pass reports `revoked` rather than `expired`
 * even after its validity lapses, because revocation is the terminal fact.
 */
export function resolveRecurringPassDisplayState(
  pass: RecurringVisitorPassValidity,
  at: Date = new Date(),
): RecurringVisitorPassDisplayState {
  if (pass.status === "revoked") {
    return "revoked";
  }

  if (pass.validUntil < getIstDateString(at)) {
    return "expired";
  }

  return pass.status === "suspended" ? "suspended" : "active";
}

export function isRecurringPassExpired(
  pass: RecurringVisitorPassValidity,
  at: Date = new Date(),
): boolean {
  return resolveRecurringPassDisplayState(pass, at) === "expired";
}

/**
 * Mirrors the database transition trigger: a suspended pass may only return to
 * active while it is neither revoked nor expired.
 */
export function canReactivateRecurringPass(
  pass: RecurringVisitorPassValidity,
  at: Date = new Date(),
): { ok: true } | { ok: false; message: string } {
  if (pass.status === "revoked") {
    return {
      ok: false,
      message: "A revoked pass cannot be reactivated. Create a new pass instead.",
    };
  }

  if (pass.status !== "suspended") {
    return { ok: false, message: "Only a suspended pass can be reactivated." };
  }

  if (isRecurringPassExpired(pass, at)) {
    return {
      ok: false,
      message: "This pass has expired. Renew its validity before reactivating.",
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Single usability predicate shared by QR validation and manual fallback
// ---------------------------------------------------------------------------

export const RECURRING_PASS_REJECTION_CODES = [
  "PASS_REVOKED",
  "PASS_SUSPENDED",
  "PASS_NOT_YET_VALID",
  "PASS_EXPIRED",
  "DAY_NOT_ALLOWED",
  "TIME_NOT_ALLOWED",
  "SCHEDULE_INVALID",
] as const;

export type RecurringPassRejectionCode =
  (typeof RECURRING_PASS_REJECTION_CODES)[number];

export const RECURRING_PASS_REJECTION_MESSAGES: Record<
  RecurringPassRejectionCode,
  string
> = {
  PASS_REVOKED: "This pass has been revoked. Entry is not allowed.",
  PASS_SUSPENDED: "This pass is suspended. Entry is not allowed.",
  PASS_NOT_YET_VALID: "This pass is not valid yet.",
  PASS_EXPIRED: "This pass has expired. Entry is not allowed.",
  DAY_NOT_ALLOWED: "This pass is not valid on today's day of the week.",
  TIME_NOT_ALLOWED: "This pass is outside its allowed entry time window.",
  SCHEDULE_INVALID: "This pass has an invalid schedule. Contact the Admin.",
};

export interface RecurringVisitorPassSchedule
  extends RecurringVisitorPassValidity {
  allowedDaysOfWeek: readonly number[];
  /** HH:MM or HH:MM:SS, Asia/Kolkata wall clock. Both null or both set. */
  allowedEntryFromTime: string | null;
  allowedEntryToTime: string | null;
}

export type RecurringPassUsability =
  | { ok: true }
  | { ok: false; code: RecurringPassRejectionCode; message: string };

function reject(code: RecurringPassRejectionCode): RecurringPassUsability {
  return { ok: false, code, message: RECURRING_PASS_REJECTION_MESSAGES[code] };
}

/**
 * The only place pass usability is decided.
 *
 * Both the QR scan path and the "QR Not Available" fallback path must call this
 * so the fallback can never become the weaker of the two. Society isolation is
 * NOT checked here: the caller must already have matched the pass society
 * against the authenticated context before asking about usability.
 */
export function evaluateRecurringPassUsability(
  pass: RecurringVisitorPassSchedule,
  at: Date = new Date(),
): RecurringPassUsability {
  if (pass.status === "revoked") {
    return reject("PASS_REVOKED");
  }

  if (pass.status === "suspended") {
    return reject("PASS_SUSPENDED");
  }

  const istDate = getIstDateString(at);

  if (istDate < pass.validFrom) {
    return reject("PASS_NOT_YET_VALID");
  }

  if (istDate > pass.validUntil) {
    return reject("PASS_EXPIRED");
  }

  const allowedDays = normalizeAllowedDaysOfWeek(pass.allowedDaysOfWeek);
  if (!allowedDays.ok) {
    return reject("SCHEDULE_INVALID");
  }

  if (!allowedDays.days.includes(getIstWeekday(at))) {
    return reject("DAY_NOT_ALLOWED");
  }

  const hasFrom = pass.allowedEntryFromTime !== null;
  const hasTo = pass.allowedEntryToTime !== null;

  if (hasFrom !== hasTo) {
    return reject("SCHEDULE_INVALID");
  }

  if (hasFrom && hasTo) {
    const from = timeToSeconds(pass.allowedEntryFromTime as string);
    const to = timeToSeconds(pass.allowedEntryToTime as string);
    const now = timeToSeconds(getIstTimeOfDay(at));

    if (from === null || to === null || now === null) {
      return reject("SCHEDULE_INVALID");
    }

    // Overnight windows are rejected by the database CHECK (to > from) and are
    // not silently reinterpreted here.
    if (to <= from) {
      return reject("SCHEDULE_INVALID");
    }

    if (now < from || now > to) {
      return reject("TIME_NOT_ALLOWED");
    }
  }

  return { ok: true };
}

/**
 * Guard-facing search must never surface a revoked pass, and must show
 * suspended/expired passes as unusable rather than hiding them, so the Guard
 * understands the refusal instead of assuming the search failed.
 */
export function isRecurringPassSearchable(
  pass: RecurringVisitorPassValidity,
): boolean {
  return pass.status !== "revoked";
}

/**
 * Guard recurring-pass validation helpers.
 * Keep aligned with packages/shared/src/guard-recurring-pass.ts and
 * packages/shared/src/recurring-visitor-pass.ts. Deno cannot import the
 * workspace package.
 */

import { getIstDateString } from "./admin-recurring-pass-lifecycle.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const QR_TOKEN_PATTERN = /^NGSP1\.[0-9a-f]{42}$/;
const REASON_MAX_LENGTH = 200;
const ASIA_KOLKATA_TIMEZONE = "Asia/Kolkata";

const FORBIDDEN_CLIENT_FIELDS = [
  "society_id",
  "societyId",
  "token_hash",
  "tokenHash",
] as const;

export const GUARD_RECURRING_ACTIONS = [
  "validate_qr",
  "validate_fallback",
  "search",
  "checkin",
] as const;

export type GuardRecurringAction = (typeof GUARD_RECURRING_ACTIONS)[number];

export const GUARD_RECURRING_SOURCES = [
  "CAMERA_QR",
  "IMPORTED_QR",
  "FALLBACK_SEARCH",
] as const;

export type GuardRecurringSource = (typeof GUARD_RECURRING_SOURCES)[number];

export const GUARD_RECURRING_MESSAGES: Record<string, string> = {
  INVALID_QR: "This QR is not a valid recurring visitor pass.",
  REPLACED_QR: "This QR is not a valid recurring visitor pass.",
  PASS_SUSPENDED: "This visitor pass is currently suspended.",
  PASS_REVOKED: "This visitor pass has been revoked.",
  PASS_EXPIRED: "This visitor pass has expired.",
  PASS_NOT_YET_VALID: "This visitor pass is not active yet.",
  DAY_NOT_ALLOWED: "Entry is not allowed today.",
  TIME_NOT_ALLOWED: "Entry is not allowed at this time.",
  SCHEDULE_INVALID: "This pass has an invalid schedule. Contact the Admin.",
  TENANT_MISMATCH: "This QR is not a valid recurring visitor pass.",
  ALREADY_CHECKED_IN: "Visitor is already checked in.",
  FALLBACK_REASON_REQUIRED: "Enter a reason for Forgot QR check-in.",
};

export interface GuardRecurringRequest {
  action: GuardRecurringAction;
  source: GuardRecurringSource | null;
  token: string | null;
  passId: string | null;
  query: string | null;
  fallbackReason: string | null;
}

export interface RecurringPassEligibilityRow {
  status: string;
  validFrom: string;
  validUntil: string;
  allowedDaysOfWeek: readonly number[];
  allowedEntryFromTime: string | null;
  allowedEntryToTime: string | null;
}

type Failure = { ok: false; code: string; message: string; status: number };

function fail(code: string, message: string, status: number): Failure {
  return { ok: false, code, message, status };
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function getIstWeekday(instant: Date = new Date()): number {
  const [year, month, day] = getIstDateString(instant).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function getIstTimeOfDay(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ASIA_KOLKATA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  const second = Number(
    parts.find((part) => part.type === "second")?.value ?? "0",
  );
  return `${pad2(hour % 24)}:${pad2(minute)}:${pad2(second)}`;
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

function normalizeDays(
  values: readonly unknown[],
): { ok: true; days: number[] } | { ok: false } {
  const days = new Set<number>();
  for (const value of values) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return { ok: false };
    }
    if (value < 0 || value > 6) {
      return { ok: false };
    }
    days.add(value);
  }
  if (days.size === 0) {
    return { ok: false };
  }
  return { ok: true, days: [...days].sort((left, right) => left - right) };
}

export function evaluateRecurringPassUsability(
  pass: RecurringPassEligibilityRow,
  at: Date = new Date(),
): { ok: true } | { ok: false; code: string; message: string } {
  if (pass.status === "revoked") {
    return failUsability("PASS_REVOKED");
  }
  if (pass.status === "suspended") {
    return failUsability("PASS_SUSPENDED");
  }

  const istDate = getIstDateString(at);
  if (istDate < pass.validFrom) {
    return failUsability("PASS_NOT_YET_VALID");
  }
  if (istDate > pass.validUntil) {
    return failUsability("PASS_EXPIRED");
  }

  const allowedDays = normalizeDays(pass.allowedDaysOfWeek);
  if (!allowedDays.ok) {
    return failUsability("SCHEDULE_INVALID");
  }
  if (!allowedDays.days.includes(getIstWeekday(at))) {
    return failUsability("DAY_NOT_ALLOWED");
  }

  const hasFrom = pass.allowedEntryFromTime !== null;
  const hasTo = pass.allowedEntryToTime !== null;
  if (hasFrom !== hasTo) {
    return failUsability("SCHEDULE_INVALID");
  }
  if (hasFrom && hasTo) {
    const from = timeToSeconds(pass.allowedEntryFromTime as string);
    const to = timeToSeconds(pass.allowedEntryToTime as string);
    const now = timeToSeconds(getIstTimeOfDay(at));
    if (from === null || to === null || now === null || to <= from) {
      return failUsability("SCHEDULE_INVALID");
    }
    if (now < from || now > to) {
      return failUsability("TIME_NOT_ALLOWED");
    }
  }

  return { ok: true };
}

function failUsability(code: string): { ok: false; code: string; message: string } {
  return {
    ok: false,
    code,
    message: GUARD_RECURRING_MESSAGES[code] ?? code,
  };
}

export function isRecurringPassQrToken(value: string): boolean {
  return value.length === 48 && QR_TOKEN_PATTERN.test(value);
}

export function validateGuardRecurringInput(
  body: unknown,
): { ok: true; value: GuardRecurringRequest } | Failure {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return fail("VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }

  const record = body as Record<string, unknown>;
  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (field in record) {
      if (field === "society_id" || field === "societyId") {
        return fail(
          "VALIDATION_ERROR",
          "Society is taken from the authenticated session.",
          400,
        );
      }
      return fail(
        "VALIDATION_ERROR",
        "Credential fields must not be supplied by the client.",
        400,
      );
    }
  }

  const action = String(record.action ?? "").trim();
  if (!GUARD_RECURRING_ACTIONS.includes(action as GuardRecurringAction)) {
    return fail("VALIDATION_ERROR", "Unsupported recurring visitor action.", 400);
  }

  let source: GuardRecurringSource | null = null;
  if (action === "validate_qr" || action === "checkin") {
    const rawSource = String(record.source ?? "").trim();
    if (!GUARD_RECURRING_SOURCES.includes(rawSource as GuardRecurringSource)) {
      return fail("VALIDATION_ERROR", "Unsupported entry source.", 400);
    }
    source = rawSource as GuardRecurringSource;
  }

  let token: string | null = null;
  if (
    action === "validate_qr" ||
    (action === "checkin" &&
      (source === "CAMERA_QR" || source === "IMPORTED_QR"))
  ) {
    const rawToken = String(record.token ?? "").trim();
    if (!isRecurringPassQrToken(rawToken)) {
      return fail(
        "INVALID_QR",
        GUARD_RECURRING_MESSAGES.INVALID_QR,
        400,
      );
    }
    token = rawToken;
  }

  let passId: string | null = null;
  if (
    action === "validate_fallback" ||
    (action === "checkin" && source === "FALLBACK_SEARCH")
  ) {
    const rawPassId = String(record.pass_id ?? "").trim();
    if (!rawPassId || !isUuid(rawPassId)) {
      return fail("VALIDATION_ERROR", "pass_id must be a valid UUID.", 400);
    }
    passId = rawPassId;
  }

  let query: string | null = null;
  if (action === "search") {
    const rawQuery = String(record.query ?? "").trim();
    if (rawQuery.length < 2) {
      return fail(
        "VALIDATION_ERROR",
        "Enter a name or mobile number to search.",
        400,
      );
    }
    query = rawQuery;
  }

  let fallbackReason: string | null = null;
  if (action === "checkin" && source === "FALLBACK_SEARCH") {
    const reason = String(record.fallback_reason ?? "").trim();
    if (!reason) {
      return fail(
        "VALIDATION_ERROR",
        GUARD_RECURRING_MESSAGES.FALLBACK_REASON_REQUIRED,
        400,
      );
    }
    if (reason.length > REASON_MAX_LENGTH) {
      return fail(
        "VALIDATION_ERROR",
        `Reason must be ${REASON_MAX_LENGTH} characters or fewer.`,
        400,
      );
    }
    fallbackReason = reason;
  }

  return {
    ok: true,
    value: {
      action: action as GuardRecurringAction,
      source,
      token,
      passId,
      query,
      fallbackReason,
    },
  };
}

export function resolveCredentialDecision(input: {
  credentialSocietyId: string | null;
  credentialRevoked: boolean;
  jwtSocietyId: string;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (!input.credentialSocietyId) {
    return failUsability("INVALID_QR");
  }
  if (input.credentialSocietyId !== input.jwtSocietyId) {
    return failUsability("TENANT_MISMATCH");
  }
  if (input.credentialRevoked) {
    return failUsability("REPLACED_QR");
  }
  return { ok: true };
}

export function sanitizeGuardRecurringMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const secretKey = /token|hash|secret|credential_raw|qr_payload/i;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (secretKey.test(key)) {
      continue;
    }
    if (typeof value === "string" && QR_TOKEN_PATTERN.test(value)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export function isUniqueOpenVisitError(error: {
  code?: string;
  message?: string;
}): boolean {
  const message = error.message ?? "";
  return (
    error.code === "23505" &&
    (message.includes("one_open_recurring_visit") ||
      message.includes("visitor_entries"))
  );
}

export function formatDestinationLabel(input: {
  destinationText: string | null;
  flatNumber: string | null;
  wingBuilding: string | null;
  residentName: string | null;
}): string {
  if (input.destinationText) {
    return input.destinationText;
  }
  const wing = input.wingBuilding?.trim();
  const flat = input.flatNumber?.trim();
  const resident = input.residentName?.trim();
  const flatLabel = [wing, flat].filter(Boolean).join(" · ");
  if (flatLabel && resident) {
    return `${flatLabel} / ${resident}`;
  }
  return flatLabel || resident || "—";
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatAllowedDays(days: readonly number[]): string {
  const normalized = normalizeDays(days);
  if (!normalized.ok) {
    return "—";
  }
  if (normalized.days.length === 7) {
    return "Every day";
  }
  return normalized.days
    .map((day) => WEEKDAY_SHORT[day] ?? "")
    .filter(Boolean)
    .join(", ");
}

export function formatClockTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const seconds = timeToSeconds(value);
  if (seconds === null) {
    return value;
  }
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function formatIsoDateDisplay(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    return isoDate;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

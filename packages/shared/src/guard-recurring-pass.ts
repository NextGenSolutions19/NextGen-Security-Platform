/**
 * Guard recurring-pass QR / import / fallback helpers.
 *
 * Eligibility is decided only by evaluateRecurringPassUsability.
 * Society isolation is the caller's responsibility (JWT society).
 */

import {
  RECURRING_PASS_REASON_MAX_LENGTH,
  evaluateRecurringPassUsability,
  isRecurringPassQrToken,
  isRecurringPassSearchable,
  type RecurringPassRejectionCode,
  type RecurringVisitorPassSchedule,
} from "./recurring-visitor-pass.ts";

export const GUARD_RECURRING_ENTRY_SOURCES = [
  "CAMERA_QR",
  "IMPORTED_QR",
  "FALLBACK_SEARCH",
] as const;

export type GuardRecurringEntrySource =
  (typeof GUARD_RECURRING_ENTRY_SOURCES)[number];

export function isGuardRecurringEntrySource(
  value: string,
): value is GuardRecurringEntrySource {
  return (GUARD_RECURRING_ENTRY_SOURCES as readonly string[]).includes(value);
}

export function isQrRecurringEntrySource(
  source: GuardRecurringEntrySource,
): boolean {
  return source === "CAMERA_QR" || source === "IMPORTED_QR";
}

export const GUARD_RECURRING_VALIDATION_CODES = [
  "INVALID_QR",
  "REPLACED_QR",
  "PASS_SUSPENDED",
  "PASS_REVOKED",
  "PASS_EXPIRED",
  "PASS_NOT_YET_VALID",
  "DAY_NOT_ALLOWED",
  "TIME_NOT_ALLOWED",
  "SCHEDULE_INVALID",
  "TENANT_MISMATCH",
  "ALREADY_CHECKED_IN",
  "NO_QR_FOUND",
] as const;

export type GuardRecurringValidationCode =
  (typeof GUARD_RECURRING_VALIDATION_CODES)[number];

export const GUARD_RECURRING_VALIDATION_MESSAGES: Record<
  GuardRecurringValidationCode,
  string
> = {
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
  NO_QR_FOUND: "No QR code found in this image.",
};

export const GUARD_RECURRING_DEFAULT_FALLBACK_REASON = "Visitor forgot QR";

export function mapGuardRecurringValidationMessage(
  code: string,
): string {
  if (code in GUARD_RECURRING_VALIDATION_MESSAGES) {
    return GUARD_RECURRING_VALIDATION_MESSAGES[
      code as GuardRecurringValidationCode
    ];
  }
  return "Unable to validate this recurring visitor pass.";
}

export function mapUsabilityCodeToGuardCode(
  code: RecurringPassRejectionCode,
): GuardRecurringValidationCode {
  return code;
}

/**
 * Shared eligibility used by camera QR, imported QR, and forgotten-QR fallback.
 * Credential possession is checked by the caller, not here.
 */
export function evaluateGuardRecurringPassEligibility(
  pass: RecurringVisitorPassSchedule,
  at: Date = new Date(),
):
  | { ok: true }
  | { ok: false; code: GuardRecurringValidationCode; message: string } {
  const usability = evaluateRecurringPassUsability(pass, at);
  if (usability.ok) {
    return { ok: true };
  }
  const code = mapUsabilityCodeToGuardCode(usability.code);
  return {
    ok: false,
    code,
    message: GUARD_RECURRING_VALIDATION_MESSAGES[code],
  };
}

export function parseGuardRecurringQrPayload(
  value: unknown,
): { ok: true; token: string } | { ok: false; code: "INVALID_QR"; message: string } {
  const token = String(value ?? "").trim();
  if (!isRecurringPassQrToken(token)) {
    return {
      ok: false,
      code: "INVALID_QR",
      message: GUARD_RECURRING_VALIDATION_MESSAGES.INVALID_QR,
    };
  }
  return { ok: true, token };
}

export function parseGuardRecurringSearchQuery(
  value: unknown,
): { ok: true; query: string } | { ok: false; message: string } {
  const query = String(value ?? "").trim();
  if (query.length < 2) {
    return { ok: false, message: "Enter a name or mobile number to search." };
  }
  if (query.length > 80) {
    return { ok: false, message: "Search is too long." };
  }
  return { ok: true, query };
}

export function parseGuardFallbackReason(
  value: unknown,
): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = String(value ?? "").trim();
  if (!reason) {
    return { ok: false, message: "Enter a reason for Forgot QR check-in." };
  }
  if (reason.length > RECURRING_PASS_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `Reason must be ${RECURRING_PASS_REASON_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, reason };
}

export function canOfferGuardFallbackSearch(
  pass: RecurringVisitorPassSchedule,
): boolean {
  return isRecurringPassSearchable(pass);
}

export function sanitizeGuardRecurringMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const secretKey = /token|hash|secret|credential_raw|qr_payload/i;
  const tokenPattern = /^NGSP1\.[0-9a-f]{42}$/;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (secretKey.test(key)) {
      continue;
    }
    if (typeof value === "string" && tokenPattern.test(value)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

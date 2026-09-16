/**
 * Admin recurring-pass lifecycle helpers (suspend / reactivate / revoke / renew).
 *
 * Keep field rules aligned with packages/shared. Deno cannot import the
 * workspace package.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const REASON_MAX_LENGTH = 200;

const FORBIDDEN_CLIENT_FIELDS = [
  "society_id",
  "societyId",
  "status",
  "token",
  "token_hash",
  "tokenHash",
  "suspended_at",
  "suspended_by_app_user_id",
  "revoked_at",
  "revoked_by_app_user_id",
] as const;

export const RECURRING_PASS_LIFECYCLE_ACTIONS = [
  "suspend",
  "reactivate",
  "revoke",
  "renew",
] as const;

export type RecurringPassLifecycleAction =
  (typeof RECURRING_PASS_LIFECYCLE_ACTIONS)[number];

export interface AdminRecurringPassLifecycleRequest {
  action: RecurringPassLifecycleAction;
  passId: string;
  reason: string | null;
  validUntil: string | null;
}

export interface RecurringPassLifecycleDecisionPass {
  societyId: string;
  status: string;
  validFrom: string;
  validUntil: string;
}

type Failure = { ok: false; code: string; message: string; status: number };

function fail(code: string, message: string, status: number): Failure {
  return { ok: false, code, message, status };
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function getIstDateString(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export function parseRequiredReason(
  value: unknown,
): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = String(value ?? "").trim();
  if (!reason) {
    return { ok: false, message: "Enter a reason." };
  }
  if (reason.length > REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `Reason must be ${REASON_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, reason };
}

function parseIsoDate(
  value: unknown,
): { ok: true; isoDate: string } | { ok: false; message: string } {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { ok: false, message: "Enter a valid until date." };
  }
  const match = ISO_CALENDAR_DATE_PATTERN.exec(raw);
  if (!match) {
    return { ok: false, message: "Enter a valid until date." };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealCalendarDate(year, month, day)) {
    return { ok: false, message: "Enter a valid until date." };
  }
  return { ok: true, isoDate: `${match[1]}-${match[2]}-${match[3]}` };
}

export function validateAdminRecurringPassLifecycleInput(
  body: unknown,
):
  | { ok: true; value: AdminRecurringPassLifecycleRequest }
  | Failure {
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
        "Server-derived fields must not be supplied by the client.",
        400,
      );
    }
  }

  const action = String(record.action ?? "").trim();
  if (
    !RECURRING_PASS_LIFECYCLE_ACTIONS.includes(
      action as RecurringPassLifecycleAction,
    )
  ) {
    return fail("VALIDATION_ERROR", "Unsupported lifecycle action.", 400);
  }

  const passId = String(record.pass_id ?? "").trim();
  if (!passId || !isUuid(passId)) {
    return fail("VALIDATION_ERROR", "pass_id must be a valid UUID.", 400);
  }

  let reason: string | null = null;
  if (action === "suspend" || action === "revoke") {
    const parsed = parseRequiredReason(record.reason);
    if (!parsed.ok) {
      return fail("VALIDATION_ERROR", parsed.message, 400);
    }
    reason = parsed.reason;
  }

  let validUntil: string | null = null;
  if (action === "renew") {
    const parsed = parseIsoDate(record.valid_until);
    if (!parsed.ok) {
      return fail("VALIDATION_ERROR", parsed.message, 400);
    }
    validUntil = parsed.isoDate;
  }

  return {
    ok: true,
    value: {
      action: action as RecurringPassLifecycleAction,
      passId,
      reason,
      validUntil,
    },
  };
}

export function evaluateRecurringPassLifecycleAction(input: {
  pass: RecurringPassLifecycleDecisionPass;
  jwtSocietyId: string;
  action: RecurringPassLifecycleAction;
  nextValidUntil?: string | null;
  istToday: string;
}): { ok: true } | Failure {
  if (input.pass.societyId !== input.jwtSocietyId) {
    return fail(
      "FORBIDDEN",
      "Recurring visitor pass does not belong to your society.",
      403,
    );
  }

  if (input.pass.status === "revoked") {
    return fail(
      "PASS_REVOKED",
      "A revoked pass cannot be changed.",
      409,
    );
  }

  const expired = input.pass.validUntil < input.istToday;

  if (input.action === "suspend") {
    if (expired) {
      return fail(
        "PASS_EXPIRED",
        "This pass has expired. Renew its validity first.",
        409,
      );
    }
    if (input.pass.status !== "active") {
      return fail(
        "CONFLICT",
        "Only an active pass can be suspended.",
        409,
      );
    }
    return { ok: true };
  }

  if (input.action === "reactivate") {
    if (input.pass.status !== "suspended") {
      return fail(
        "CONFLICT",
        "Only a suspended pass can be reactivated.",
        409,
      );
    }
    if (expired) {
      return fail(
        "PASS_EXPIRED",
        "This pass has expired. Renew its validity before reactivating.",
        409,
      );
    }
    return { ok: true };
  }

  if (input.action === "revoke") {
    return { ok: true };
  }

  const nextValidUntil = input.nextValidUntil ?? "";
  if (!nextValidUntil) {
    return fail("VALIDATION_ERROR", "Enter a valid until date.", 400);
  }
  if (nextValidUntil < input.pass.validFrom) {
    return fail(
      "VALIDATION_ERROR",
      "Valid Until cannot be before Valid From.",
      400,
    );
  }
  if (nextValidUntil <= input.pass.validUntil) {
    return fail(
      "VALIDATION_ERROR",
      "New Valid Until must be later than the current Valid Until.",
      400,
    );
  }
  return { ok: true };
}

export function credentialRevokeReasonForPass(passReason: string): string {
  const prefix = "Pass revoked: ";
  if (prefix.length + passReason.length <= REASON_MAX_LENGTH) {
    return `${prefix}${passReason}`;
  }
  return "Pass revoked.";
}

export function mapRecurringPassMutationError(error: {
  message?: string;
}): Failure | null {
  const message = error.message ?? "";
  if (message.includes("revoked pass is terminal")) {
    return fail(
      "PASS_REVOKED",
      "This pass has been revoked and cannot be changed.",
      409,
    );
  }
  if (message.includes("cannot reactivate an expired")) {
    return fail(
      "PASS_EXPIRED",
      "This pass has expired. Renew its validity before reactivating.",
      409,
    );
  }
  if (message.includes("cannot issue a QR credential for a revoked")) {
    return fail(
      "PASS_REVOKED",
      "A revoked pass cannot receive a QR credential.",
      409,
    );
  }
  if (message.includes("revoked QR credential is terminal")) {
    return fail(
      "CONFLICT",
      "That QR credential was already replaced or revoked.",
      409,
    );
  }
  return null;
}

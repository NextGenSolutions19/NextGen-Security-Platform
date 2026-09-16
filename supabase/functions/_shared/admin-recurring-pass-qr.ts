/**
 * Admin QR credential issuance helpers.
 *
 * Token format matches packages/shared/src/recurring-visitor-pass.ts.
 * Deno Edge Functions cannot import the workspace package.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_CLIENT_FIELDS = [
  "society_id",
  "societyId",
  "token",
  "qr_token",
  "qrToken",
  "token_hash",
  "tokenHash",
  "credential",
  "raw_token",
  "rawToken",
] as const;

export const RECURRING_PASS_QR_TOKEN_PREFIX = "NGSP1.";
export const RECURRING_PASS_QR_TOKEN_RANDOM_BYTES = 21;
export const RECURRING_PASS_QR_TOKEN_LENGTH = 48;
export const RECURRING_PASS_QR_TOKEN_PATTERN = /^NGSP1\.[0-9a-f]{42}$/;

export const RECURRING_PASS_QR_ACTIONS = ["status", "issue", "replace"] as const;
export type RecurringPassQrAction = (typeof RECURRING_PASS_QR_ACTIONS)[number];

export const CREDENTIAL_REPLACEMENT_REASON =
  "Replaced by a new QR credential.";

export interface AdminRecurringPassQrRequest {
  action: RecurringPassQrAction;
  passId: string;
}

export interface RecurringPassQrDecisionPass {
  societyId: string;
  status: string;
  validUntil: string;
}

type Failure = { ok: false; code: string; message: string; status: number };

function fail(
  code: string,
  message: string,
  status: number,
): Failure {
  return { ok: false, code, message, status };
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function generateRecurringPassQrToken(): string {
  const bytes = new Uint8Array(RECURRING_PASS_QR_TOKEN_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
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

export function validateAdminRecurringPassQrInput(
  body: unknown,
):
  | { ok: true; value: AdminRecurringPassQrRequest }
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
        "Credential fields must not be supplied by the client.",
        400,
      );
    }
  }

  const action = String(record.action ?? "").trim();
  if (!RECURRING_PASS_QR_ACTIONS.includes(action as RecurringPassQrAction)) {
    return fail("VALIDATION_ERROR", "Unsupported QR action.", 400);
  }

  const passId = String(record.pass_id ?? "").trim();
  if (!passId || !isUuid(passId)) {
    return fail("VALIDATION_ERROR", "pass_id must be a valid UUID.", 400);
  }

  return {
    ok: true,
    value: {
      action: action as RecurringPassQrAction,
      passId,
    },
  };
}

export function evaluateRecurringPassQrAction(input: {
  pass: RecurringPassQrDecisionPass;
  jwtSocietyId: string;
  action: RecurringPassQrAction;
  hasActiveCredential: boolean;
  istToday: string;
}): { ok: true } | Failure {
  if (input.pass.societyId !== input.jwtSocietyId) {
    return fail(
      "FORBIDDEN",
      "Recurring visitor pass does not belong to your society.",
      403,
    );
  }

  if (input.action === "status") {
    return { ok: true };
  }

  if (input.pass.status === "revoked") {
    return fail(
      "PASS_REVOKED",
      "A revoked pass cannot receive a QR credential.",
      409,
    );
  }

  if (input.pass.validUntil < input.istToday) {
    return fail(
      "PASS_EXPIRED",
      "This pass has expired. Renew its validity before issuing a QR.",
      409,
    );
  }

  if (input.action === "issue" && input.hasActiveCredential) {
    return fail(
      "CREDENTIAL_EXISTS",
      "This pass already has an active QR credential.",
      409,
    );
  }

  if (input.action === "replace" && !input.hasActiveCredential) {
    return fail(
      "NO_ACTIVE_CREDENTIAL",
      "This pass does not have an active QR credential to replace.",
      409,
    );
  }

  return { ok: true };
}

const SECRET_METADATA_KEY = /token|hash|secret|credential_raw|qr_payload/i;

export function sanitizeRecurringPassEventMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_METADATA_KEY.test(key)) {
      continue;
    }
    if (typeof value === "string" && RECURRING_PASS_QR_TOKEN_PATTERN.test(value)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export function isUniqueConstraintError(error: {
  code?: string;
  message?: string;
}): boolean {
  const message = error.message ?? "";
  return (
    error.code === "23505" ||
    message.includes("one_active_per_pass") ||
    message.includes("token_hash_unique")
  );
}

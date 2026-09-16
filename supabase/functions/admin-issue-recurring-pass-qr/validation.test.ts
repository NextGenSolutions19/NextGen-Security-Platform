import { createHash } from "node:crypto";
import {
  evaluateRecurringPassQrAction,
  generateRecurringPassQrToken,
  isRecurringPassQrToken,
  isUniqueConstraintError,
  sanitizeRecurringPassEventMetadata,
  validateAdminRecurringPassQrInput,
} from "../_shared/admin-recurring-pass-qr.ts";
import { hashToken } from "../_shared/password.ts";

const passId = "55555555-5555-4555-8555-555555555501";
const societyId = "11111111-1111-4111-8111-111111111101";
const otherSocietyId = "22222222-2222-4222-8222-222222222201";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: "issue",
    pass_id: passId,
    ...overrides,
  };
}

Deno.test("rejects client society identifiers and credential fields", () => {
  const society = validateAdminRecurringPassQrInput(
    validPayload({ society_id: societyId }),
  );
  assert(!society.ok, "client society must be rejected");

  const token = validateAdminRecurringPassQrInput(
    validPayload({ token: "NGSP1.abc" }),
  );
  assert(!token.ok, "client token must be rejected");

  const hash = validateAdminRecurringPassQrInput(
    validPayload({ token_hash: "a".repeat(64) }),
  );
  assert(!hash.ok, "client hash must be rejected");
});

Deno.test("accepts status, issue, and replace actions", () => {
  for (const action of ["status", "issue", "replace"]) {
    const result = validateAdminRecurringPassQrInput(validPayload({ action }));
    assert(result.ok, `${action} must be accepted`);
  }
});

Deno.test("generated QR tokens hash to 64 lowercase hex and never appear in events", async () => {
  const token = generateRecurringPassQrToken();
  assert(isRecurringPassQrToken(token), "token format");
  assert(token.length === 48, "48-char plaintext cannot be stored as hash");

  const hashed = await hashToken(token);
  assert(hashed.length === 64, "hash length");
  assert(/^[0-9a-f]{64}$/.test(hashed), "hash charset");
  assert(hashed !== token, "hash is not plaintext");
  assert(
    hashed === createHash("sha256").update(token).digest("hex"),
    "matches SHA-256",
  );

  const metadata = sanitizeRecurringPassEventMetadata({
    action: "issue",
    token,
    token_hash: hashed,
    credential_id: "cred-1",
  });
  assert(metadata.token === undefined, "raw token must be stripped");
  assert(metadata.token_hash === undefined, "hash must be stripped");
  assert(metadata.credential_id === "cred-1", "non-secret id may remain");
  assert(metadata.action === "issue", "action may remain");
});

Deno.test("same-society, revoked, expired, and duplicate issue rules", () => {
  const base = {
    jwtSocietyId: societyId,
    action: "issue" as const,
    hasActiveCredential: false,
    istToday: "2026-09-14",
  };

  const foreign = evaluateRecurringPassQrAction({
    ...base,
    pass: { societyId: otherSocietyId, status: "active", validUntil: "2026-12-31" },
  });
  assert(!foreign.ok && foreign.status === 403, "foreign society");

  const revoked = evaluateRecurringPassQrAction({
    ...base,
    pass: { societyId, status: "revoked", validUntil: "2026-12-31" },
  });
  assert(!revoked.ok && revoked.code === "PASS_REVOKED", "revoked issue");

  const expired = evaluateRecurringPassQrAction({
    ...base,
    pass: { societyId, status: "active", validUntil: "2026-09-13" },
  });
  assert(!expired.ok && expired.code === "PASS_EXPIRED", "expired issue");

  const duplicate = evaluateRecurringPassQrAction({
    ...base,
    hasActiveCredential: true,
    pass: { societyId, status: "active", validUntil: "2026-12-31" },
  });
  assert(!duplicate.ok && duplicate.code === "CREDENTIAL_EXISTS", "duplicate");

  const statusAllowed = evaluateRecurringPassQrAction({
    ...base,
    action: "status",
    pass: { societyId, status: "revoked", validUntil: "2026-09-13" },
  });
  assert(statusAllowed.ok, "status is allowed for revoked");

  const replaceMissing = evaluateRecurringPassQrAction({
    ...base,
    action: "replace",
    pass: { societyId, status: "active", validUntil: "2026-12-31" },
  });
  assert(!replaceMissing.ok, "replace without credential");

  const ok = evaluateRecurringPassQrAction({
    ...base,
    pass: { societyId, status: "active", validUntil: "2026-12-31" },
  });
  assert(ok.ok, "eligible issue");
});

Deno.test("unique constraint errors map to conflict protection", () => {
  assert(
    isUniqueConstraintError({ code: "23505" }),
    "postgres unique code",
  );
  assert(
    isUniqueConstraintError({
      message: "recurring_visitor_pass_credentials_one_active_per_pass",
    }),
    "partial unique index",
  );
});

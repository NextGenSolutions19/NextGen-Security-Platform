import { createHash } from "node:crypto";
import {
  evaluateRecurringPassUsability,
  resolveCredentialDecision,
  sanitizeGuardRecurringMetadata,
  validateGuardRecurringInput,
} from "../_shared/guard-recurring-pass.ts";
import { hashToken } from "../_shared/password.ts";

const passId = "55555555-5555-4555-8555-555555555501";
const societyId = "11111111-1111-4111-8111-111111111101";
const otherSociety = "22222222-2222-4222-8222-222222222201";
const token = "NGSP1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("camera and import QR use the same validate_qr action", () => {
  const camera = validateGuardRecurringInput({
    action: "validate_qr",
    source: "CAMERA_QR",
    token,
  });
  const imported = validateGuardRecurringInput({
    action: "validate_qr",
    source: "IMPORTED_QR",
    token,
  });
  assert(camera.ok && imported.ok, "both sources accepted");
  if (camera.ok && imported.ok) {
    assert(camera.value.action === imported.value.action, "same action");
    assert(camera.value.token === imported.value.token, "same token field");
  }
});

Deno.test("rejects client society and hash fields", () => {
  const society = validateGuardRecurringInput({
    action: "validate_qr",
    source: "CAMERA_QR",
    token,
    society_id: societyId,
  });
  assert(!society.ok, "society rejected");

  const hash = validateGuardRecurringInput({
    action: "validate_qr",
    source: "CAMERA_QR",
    token,
    token_hash: "a".repeat(64),
  });
  assert(!hash.ok, "hash rejected");
});

Deno.test("invalid or non-pass QR payloads are rejected before lookup", () => {
  const invalid = validateGuardRecurringInput({
    action: "validate_qr",
    source: "CAMERA_QR",
    token: "hello-world",
  });
  assert(!invalid.ok && invalid.code === "INVALID_QR", "plain text rejected");
});

Deno.test("replaced and cross-society credentials are rejected", () => {
  const replaced = resolveCredentialDecision({
    credentialSocietyId: societyId,
    credentialRevoked: true,
    jwtSocietyId: societyId,
  });
  assert(!replaced.ok && replaced.code === "REPLACED_QR", "replaced");

  const foreign = resolveCredentialDecision({
    credentialSocietyId: otherSociety,
    credentialRevoked: false,
    jwtSocietyId: societyId,
  });
  assert(!foreign.ok && foreign.code === "TENANT_MISMATCH", "tenant");

  const missing = resolveCredentialDecision({
    credentialSocietyId: null,
    credentialRevoked: false,
    jwtSocietyId: societyId,
  });
  assert(!missing.ok && missing.code === "INVALID_QR", "missing");

  const current = resolveCredentialDecision({
    credentialSocietyId: societyId,
    credentialRevoked: false,
    jwtSocietyId: societyId,
  });
  assert(current.ok, "current accepted");
});

Deno.test("QR hash matches issuance SHA-256 and never appears in events", async () => {
  const hashed = await hashToken(token);
  assert(hashed === createHash("sha256").update(token).digest("hex"), "sha256");
  assert(hashed !== token, "not plaintext");

  const metadata = sanitizeGuardRecurringMetadata({
    source: "CAMERA_QR",
    token,
    token_hash: hashed,
  });
  assert(metadata.token === undefined, "token stripped");
  assert(metadata.token_hash === undefined, "hash stripped");
  assert(metadata.source === "CAMERA_QR", "source kept");
});

Deno.test("fallback requires reason; QR check-in does not", () => {
  const missing = validateGuardRecurringInput({
    action: "checkin",
    source: "FALLBACK_SEARCH",
    pass_id: passId,
  });
  assert(!missing.ok, "reason required");

  const ok = validateGuardRecurringInput({
    action: "checkin",
    source: "FALLBACK_SEARCH",
    pass_id: passId,
    fallback_reason: "Visitor forgot QR",
  });
  assert(ok.ok, "fallback with reason");

  const qr = validateGuardRecurringInput({
    action: "checkin",
    source: "CAMERA_QR",
    token,
  });
  assert(qr.ok, "qr checkin");
});

Deno.test("eligibility rejects suspended, revoked, expired, weekday, and time", () => {
  const at = new Date("2026-09-14T06:30:00.000Z");
  const base = {
    status: "active",
    validFrom: "2026-09-01",
    validUntil: "2026-09-30",
    allowedDaysOfWeek: [1, 2, 3, 4, 5, 6],
    allowedEntryFromTime: "08:00:00",
    allowedEntryToTime: "20:00:00",
  };

  assert(evaluateRecurringPassUsability(base, at).ok, "eligible");
  assert(
    !evaluateRecurringPassUsability({ ...base, status: "suspended" }, at).ok,
    "suspended",
  );
  assert(
    !evaluateRecurringPassUsability({ ...base, status: "revoked" }, at).ok,
    "revoked",
  );
  assert(
    !evaluateRecurringPassUsability({ ...base, validUntil: "2026-09-13" }, at).ok,
    "expired",
  );
  assert(
    !evaluateRecurringPassUsability({ ...base, validFrom: "2026-09-15" }, at).ok,
    "not yet",
  );
  assert(
    !evaluateRecurringPassUsability({ ...base, allowedDaysOfWeek: [0] }, at).ok,
    "weekday",
  );
  assert(
    !evaluateRecurringPassUsability(
      { ...base, allowedEntryFromTime: "06:00:00", allowedEntryToTime: "07:00:00" },
      at,
    ).ok,
    "time",
  );
});

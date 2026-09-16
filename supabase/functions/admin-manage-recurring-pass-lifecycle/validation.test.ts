import {
  credentialRevokeReasonForPass,
  evaluateRecurringPassLifecycleAction,
  mapRecurringPassMutationError,
  validateAdminRecurringPassLifecycleInput,
} from "../_shared/admin-recurring-pass-lifecycle.ts";
import { sanitizeRecurringPassEventMetadata } from "../_shared/admin-recurring-pass-qr.ts";

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
    action: "suspend",
    pass_id: passId,
    reason: "Visitor is on leave.",
    ...overrides,
  };
}

Deno.test("rejects client society, status, and credential fields", () => {
  const society = validateAdminRecurringPassLifecycleInput(
    validPayload({ society_id: societyId }),
  );
  assert(!society.ok, "client society must be rejected");

  const status = validateAdminRecurringPassLifecycleInput(
    validPayload({ status: "revoked" }),
  );
  assert(!status.ok, "client status must be rejected");

  const token = validateAdminRecurringPassLifecycleInput(
    validPayload({ token_hash: "a".repeat(64) }),
  );
  assert(!token.ok, "token_hash must be rejected");
});

Deno.test("suspend and revoke require a trimmed reason", () => {
  const blank = validateAdminRecurringPassLifecycleInput(
    validPayload({ reason: "   " }),
  );
  assert(!blank.ok, "blank reason");

  const suspend = validateAdminRecurringPassLifecycleInput(validPayload());
  assert(suspend.ok, "suspend with reason");
  if (suspend.ok) {
    assert(suspend.value.reason === "Visitor is on leave.", "trimmed reason");
  }

  const revoke = validateAdminRecurringPassLifecycleInput(
    validPayload({ action: "revoke", reason: " Left the society " }),
  );
  assert(revoke.ok, "revoke with reason");
});

Deno.test("reactivate does not require a reason; renew requires a later date", () => {
  const reactivate = validateAdminRecurringPassLifecycleInput({
    action: "reactivate",
    pass_id: passId,
  });
  assert(reactivate.ok, "reactivate without reason");

  const renew = validateAdminRecurringPassLifecycleInput({
    action: "renew",
    pass_id: passId,
    valid_until: "2026-12-31",
  });
  assert(renew.ok, "renew");
  if (renew.ok) {
    assert(renew.value.validUntil === "2026-12-31", "iso date");
  }
});

Deno.test("lifecycle tenancy and state machine", () => {
  const today = "2026-09-14";
  const active = {
    societyId,
    status: "active",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  };

  const foreign = evaluateRecurringPassLifecycleAction({
    pass: { ...active, societyId: otherSocietyId },
    jwtSocietyId: societyId,
    action: "suspend",
    istToday: today,
  });
  assert(!foreign.ok && foreign.status === 403, "foreign society");

  const revoked = evaluateRecurringPassLifecycleAction({
    pass: { ...active, status: "revoked" },
    jwtSocietyId: societyId,
    action: "renew",
    nextValidUntil: "2027-01-01",
    istToday: today,
  });
  assert(!revoked.ok && revoked.code === "PASS_REVOKED", "revoked renew");

  const expireSuspend = evaluateRecurringPassLifecycleAction({
    pass: { ...active, validUntil: "2026-09-13" },
    jwtSocietyId: societyId,
    action: "suspend",
    istToday: today,
  });
  assert(!expireSuspend.ok && expireSuspend.code === "PASS_EXPIRED", "expired suspend");

  const expireReactivate = evaluateRecurringPassLifecycleAction({
    pass: { ...active, status: "suspended", validUntil: "2026-09-13" },
    jwtSocietyId: societyId,
    action: "reactivate",
    istToday: today,
  });
  assert(
    !expireReactivate.ok && expireReactivate.code === "PASS_EXPIRED",
    "expired reactivate",
  );

  const okReactivate = evaluateRecurringPassLifecycleAction({
    pass: { ...active, status: "suspended" },
    jwtSocietyId: societyId,
    action: "reactivate",
    istToday: today,
  });
  assert(okReactivate.ok, "valid reactivate");

  const shortRenew = evaluateRecurringPassLifecycleAction({
    pass: active,
    jwtSocietyId: societyId,
    action: "renew",
    nextValidUntil: "2026-12-31",
    istToday: today,
  });
  assert(!shortRenew.ok, "must extend past current valid until");

  const okRenew = evaluateRecurringPassLifecycleAction({
    pass: active,
    jwtSocietyId: societyId,
    action: "renew",
    nextValidUntil: "2027-01-15",
    istToday: today,
  });
  assert(okRenew.ok, "extend validity");
});

Deno.test("audit metadata and credential revoke reasons stay non-secret", () => {
  const metadata = sanitizeRecurringPassEventMetadata({
    reason: "Left the society",
    token: "NGSP1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  assert(metadata.token === undefined, "raw token stripped");
  assert(metadata.reason === "Left the society", "reason kept");

  const reason = credentialRevokeReasonForPass("Left the society");
  assert(reason.startsWith("Pass revoked:"), "credential reason prefix");
  assert(reason.length <= 200, "fits credential reason limit");
  assert(!reason.includes("NGSP1."), "no token in reason");
});

Deno.test("database trigger messages map to safe conflicts", () => {
  const revoked = mapRecurringPassMutationError({
    message: "recurring_visitor_passes: a revoked pass is terminal and cannot be modified",
  });
  assert(Boolean(revoked && revoked.code === "PASS_REVOKED"), "revoked trigger");

  const expired = mapRecurringPassMutationError({
    message:
      "recurring_visitor_passes: cannot reactivate an expired pass. Renew validity first",
  });
  assert(Boolean(expired && expired.code === "PASS_EXPIRED"), "expired trigger");
});

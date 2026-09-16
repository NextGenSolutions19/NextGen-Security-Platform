import {
  evaluateVisitorSecurityPolicy,
  parseSocietySecurityPolicy,
  parseSocietySecurityPolicySaveInput,
} from "../_shared/society-security-policies.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("get/save parser ignores client society identifiers", () => {
  const rejected = parseSocietySecurityPolicySaveInput({
    otpRequired: false,
    residentSelectionRequired: true,
    societyId: "11111111-1111-1111-1111-111111111101",
  });
  assert(!rejected.ok, "client society must be rejected");

  const accepted = parseSocietySecurityPolicySaveInput({
    otpRequired: true,
    residentSelectionRequired: false,
  });
  assert(accepted.ok, "admin save payload should parse");
});

Deno.test("Guard cannot satisfy the save parser with a society spoof", () => {
  const result = parseSocietySecurityPolicySaveInput({
    action: "save",
    otpRequired: false,
    residentSelectionRequired: false,
    society_id: "11111111-1111-1111-1111-111111111102",
  });
  assert(!result.ok, "society_id must not be accepted");
});

Deno.test("OTP policy blocks Register without OTP even with a reason", () => {
  const policy = parseSocietySecurityPolicy({ otpRequired: true });
  const result = evaluateVisitorSecurityPolicy({
    policy,
    registrationMode: "register_without_otp",
    otpFallbackReason: "No signal",
    purposeCode: "guest",
  });
  assert(!result.ok, "OTP required should block fallback mode");
  if (!result.ok) {
    assert(result.code === "OTP_REQUIRED", result.code);
  }
});

Deno.test("Cab/Taxi and other purposes no longer fail policy evaluation without a resident", () => {
  const policy = parseSocietySecurityPolicy({ residentSelectionRequired: true });
  const cab = evaluateVisitorSecurityPolicy({
    policy,
    registrationMode: "verify_with_otp",
    purposeCode: "cab_taxi",
  });
  assert(cab.ok, "cab/taxi must not require resident policy");

  const delivery = evaluateVisitorSecurityPolicy({
    policy,
    registrationMode: "verify_with_otp",
    purposeCode: "courier_delivery",
  });
  assert(delivery.ok, "resident selection policy is retired");
});

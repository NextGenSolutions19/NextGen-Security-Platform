import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CAB_TAXI_PURPOSE_CODE, getEnabledVisitorPurposes } from "./visitor-purposes.ts";
import {
  DEFAULT_SOCIETY_SECURITY_POLICY,
  SECURITY_POLICY_LOAD_FAILED_MESSAGE,
  allowedVisitorRegistrationModes,
  evaluateVisitorSecurityPolicy,
  isRegisterWithoutOtpAllowed,
  parseSocietySecurityPolicy,
  parseSocietySecurityPolicySaveInput,
  purposeRequiresResidentSelection,
  societySecurityPoliciesEqual,
} from "./society-security-policies.ts";

const MIGRATION_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations/20260901120000_m03_society_security_policies.sql",
);

test("policy load failure is fail-closed and does not weaken OTP or resident rules", () => {
  assert.match(SECURITY_POLICY_LOAD_FAILED_MESSAGE, /paused/i);
  assert.equal(/optional/i.test(SECURITY_POLICY_LOAD_FAILED_MESSAGE), false);
  assert.equal(/continue/i.test(SECURITY_POLICY_LOAD_FAILED_MESSAGE), false);
});

test("defaults keep OTP optional and resident selection optional", () => {
  assert.equal(DEFAULT_SOCIETY_SECURITY_POLICY.otpRequired, false);
  assert.equal(DEFAULT_SOCIETY_SECURITY_POLICY.residentSelectionRequired, false);
  assert.equal(isRegisterWithoutOtpAllowed(DEFAULT_SOCIETY_SECURITY_POLICY), true);
  assert.deepEqual(allowedVisitorRegistrationModes(DEFAULT_SOCIETY_SECURITY_POLICY), [
    "verify_with_otp",
    "register_without_otp",
  ]);
});

test("unknown or missing policy rows parse as product defaults", () => {
  assert.deepEqual(parseSocietySecurityPolicy(null), DEFAULT_SOCIETY_SECURITY_POLICY);
  assert.deepEqual(parseSocietySecurityPolicy({}), DEFAULT_SOCIETY_SECURITY_POLICY);
});

test("OTP required disables Register without OTP", () => {
  const policy = parseSocietySecurityPolicy({ otpRequired: true });
  assert.equal(isRegisterWithoutOtpAllowed(policy), false);
  assert.deepEqual(allowedVisitorRegistrationModes(policy), ["verify_with_otp"]);

  const blocked = evaluateVisitorSecurityPolicy({
    policy,
    registrationMode: "register_without_otp",
    otpFallbackReason: "Visitor phone has no signal",
    purposeCode: "guest",
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.code, "OTP_REQUIRED");
    assert.equal(blocked.field, "registrationMode");
  }

  const allowed = evaluateVisitorSecurityPolicy({
    policy,
    registrationMode: "verify_with_otp",
    purposeCode: "guest",
  });
  assert.equal(allowed.ok, true);
});

test("Register without OTP requires a fallback reason", () => {
  const missing = evaluateVisitorSecurityPolicy({
    policy: DEFAULT_SOCIETY_SECURITY_POLICY,
    registrationMode: "register_without_otp",
    purposeCode: "guest",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.code, "FALLBACK_REASON_REQUIRED");
    assert.equal(missing.field, "otpFallbackReason");
  }

  const blank = evaluateVisitorSecurityPolicy({
    policy: DEFAULT_SOCIETY_SECURITY_POLICY,
    registrationMode: "register_without_otp",
    otpFallbackReason: "   ",
    purposeCode: "guest",
  });
  assert.equal(blank.ok, false);

  const present = evaluateVisitorSecurityPolicy({
    policy: DEFAULT_SOCIETY_SECURITY_POLICY,
    registrationMode: "register_without_otp",
    otpFallbackReason: "Phone has no network",
    purposeCode: "guest",
  });
  assert.equal(present.ok, true);
});

test("OTP-verified registrations do not need a fallback reason", () => {
  const result = evaluateVisitorSecurityPolicy({
    policy: DEFAULT_SOCIETY_SECURITY_POLICY,
    registrationMode: "verify_with_otp",
    purposeCode: "guest",
  });
  assert.equal(result.ok, true);
});

test("resident selection policy is no longer enforced", () => {
  const policy = parseSocietySecurityPolicy({ residentSelectionRequired: true });
  for (const purpose of getEnabledVisitorPurposes()) {
    assert.equal(purposeRequiresResidentSelection(policy, purpose.id), false);
  }
});

test("Cab/Taxi and other purposes no longer fail policy evaluation without a resident", () => {
  const policy = parseSocietySecurityPolicy({ residentSelectionRequired: true });
  const cab = evaluateVisitorSecurityPolicy({
    policy,
    registrationMode: "verify_with_otp",
    purposeCode: CAB_TAXI_PURPOSE_CODE,
  });
  assert.equal(cab.ok, true);

  const guest = evaluateVisitorSecurityPolicy({
    policy,
    registrationMode: "verify_with_otp",
    purposeCode: "guest",
  });
  assert.equal(guest.ok, true);
});

test("group visitor uses the same OTP and resident policy rules", () => {
  const policy = parseSocietySecurityPolicy({
    otpRequired: true,
    residentSelectionRequired: true,
  });
  const blocked = evaluateVisitorSecurityPolicy({
    policy,
    registrationMode: "register_without_otp",
    otpFallbackReason: "Group has one shared phone",
    purposeCode: "guest",
    residentId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(blocked.ok, false);
});

test("save input ignores and rejects client society identifiers", () => {
  const rejected = parseSocietySecurityPolicySaveInput({
    otpRequired: true,
    residentSelectionRequired: false,
    society_id: "11111111-1111-1111-1111-111111111102",
  });
  assert.equal(rejected.ok, false);

  const accepted = parseSocietySecurityPolicySaveInput({
    otpRequired: true,
    residentSelectionRequired: false,
  });
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.value.otpRequired, true);
    assert.equal(accepted.value.residentSelectionRequired, false);
  }

  const otpOnly = parseSocietySecurityPolicySaveInput({
    otpRequired: false,
  });
  assert.equal(otpOnly.ok, true);
  if (otpOnly.ok) {
    assert.equal(otpOnly.value.residentSelectionRequired, false);
  }
});

test("policy equality is field-exact", () => {
  assert.equal(
    societySecurityPoliciesEqual(
      DEFAULT_SOCIETY_SECURITY_POLICY,
      parseSocietySecurityPolicy({ otpRequired: false }),
    ),
    true,
  );
  assert.equal(
    societySecurityPoliciesEqual(DEFAULT_SOCIETY_SECURITY_POLICY, {
      otpRequired: true,
      residentSelectionRequired: false,
    }),
    false,
  );
});

test("migration is additive, tenant-scoped, and does not grant Guard table writes", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  assert.match(sql, /create table public\.society_security_policies/);
  assert.match(sql, /otp_required boolean not null default false/);
  assert.match(sql, /resident_selection_required boolean not null default false/);
  assert.match(sql, /add column otp_fallback_reason text/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth_app_role\(\) = 'society_admin'/);
  assert.equal(/auth_app_role\(\) = 'guard'/i.test(sql), false);
  assert.equal(/drop table/i.test(sql), false);
  assert.equal(/update\s+public\.visitor_entries/i.test(sql), false);
  assert.equal(/delete\s+from/i.test(sql), false);
});

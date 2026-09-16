import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECURRING_PASS_RENEW_BEFORE_FROM_MESSAGE,
  RECURRING_PASS_RENEW_NOT_AFTER_CURRENT_MESSAGE,
  parseAdminRecurringPassRenewDate,
  validateRecurringPassRenewalRange,
} from "./admin-recurring-pass-lifecycle.ts";

test("renew form accepts a later Indian Valid Until date", () => {
  const parsed = parseAdminRecurringPassRenewDate("31-12-2026");
  assert.deepEqual(parsed, { ok: true, validUntil: "2026-12-31" });
});

test("renew range must extend past the current Valid Until and stay after Valid From", () => {
  assert.deepEqual(
    validateRecurringPassRenewalRange({
      validFrom: "2026-01-01",
      currentValidUntil: "2026-09-30",
      nextValidUntil: "2026-12-31",
    }),
    { ok: true },
  );

  const same = validateRecurringPassRenewalRange({
    validFrom: "2026-01-01",
    currentValidUntil: "2026-09-30",
    nextValidUntil: "2026-09-30",
  });
  assert.equal(same.ok, false);
  if (!same.ok) {
    assert.equal(same.message, RECURRING_PASS_RENEW_NOT_AFTER_CURRENT_MESSAGE);
  }

  const beforeFrom = validateRecurringPassRenewalRange({
    validFrom: "2026-10-01",
    currentValidUntil: "2026-09-30",
    nextValidUntil: "2026-09-15",
  });
  assert.equal(beforeFrom.ok, false);
  if (!beforeFrom.ok) {
    assert.equal(beforeFrom.message, RECURRING_PASS_RENEW_BEFORE_FROM_MESSAGE);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAdminRecurringPassScheduleForm,
  recurringPassScheduleFormDefaults,
  type AdminRecurringPassScheduleFormInput,
} from "./admin-recurring-pass-schedule.ts";
import {
  ALLOWED_DAYS_REQUIRED_MESSAGE,
  RECURRING_PASS_TIME_WINDOW_INCOMPLETE_MESSAGE,
  RECURRING_PASS_TIME_WINDOW_ORDER_MESSAGE,
  RECURRING_PASS_VALIDITY_ORDER_MESSAGE,
} from "./recurring-visitor-pass.ts";

function validForm(
  overrides: Partial<AdminRecurringPassScheduleFormInput> = {},
): AdminRecurringPassScheduleFormInput {
  return {
    validFromDisplay: "14-09-2026",
    validUntilDisplay: "14-12-2026",
    allowedDaysOfWeek: [1, 2, 3, 4, 5],
    allowedEntryFromTime: "",
    allowedEntryToTime: "",
    vehicleNumber: "",
    notes: "",
    ...overrides,
  };
}

test("schedule form accepts slash dates, trims optional fields, and stores ISO dates", () => {
  const parsed = parseAdminRecurringPassScheduleForm(
    validForm({
      validFromDisplay: "14/09/2026",
      validUntilDisplay: "14/12/2026",
      vehicleNumber: "  MH12AB1234  ",
      notes: "  Gate notes  ",
      allowedEntryFromTime: "06:00",
      allowedEntryToTime: "11:00",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.validFrom, "2026-09-14");
  assert.equal(parsed.value.validUntil, "2026-12-14");
  assert.equal(parsed.value.vehicleNumber, "MH12AB1234");
  assert.equal(parsed.value.notes, "Gate notes");
  assert.equal(parsed.value.allowedEntryFromTime, "06:00:00");
  assert.equal(parsed.value.allowedEntryToTime, "11:00:00");
});

test("schedule form defaults pre-fill stored pass values for the edit screen", () => {
  const defaults = recurringPassScheduleFormDefaults({
    validFrom: "2026-09-14",
    validUntil: "2026-12-14",
    allowedDaysOfWeek: [0, 6],
    allowedEntryFromTime: "17:00:00",
    allowedEntryToTime: "21:00:00",
    vehicleNumber: "MH12AB1234",
    notes: "Weekends only",
  });
  assert.deepEqual(defaults, {
    validFromDisplay: "14-09-2026",
    validUntilDisplay: "14-12-2026",
    allowedDaysOfWeek: [0, 6],
    allowedEntryFromTime: "17:00",
    allowedEntryToTime: "21:00",
    vehicleNumber: "MH12AB1234",
    notes: "Weekends only",
  });
});

test("schedule form rejects inverted dates, no days, and invalid time windows", () => {
  const parsed = parseAdminRecurringPassScheduleForm(
    validForm({
      validFromDisplay: "20-09-2026",
      validUntilDisplay: "14-09-2026",
      allowedDaysOfWeek: [],
      allowedEntryFromTime: "21:00",
      allowedEntryToTime: "06:00",
    }),
  );
  assert.equal(parsed.ok, false);
  if (parsed.ok) {
    return;
  }
  assert.equal(parsed.errors.validUntil, RECURRING_PASS_VALIDITY_ORDER_MESSAGE);
  assert.equal(parsed.errors.allowedDaysOfWeek, ALLOWED_DAYS_REQUIRED_MESSAGE);
  assert.equal(parsed.errors.allowedEntryToTime, RECURRING_PASS_TIME_WINDOW_ORDER_MESSAGE);

  const oneSided = parseAdminRecurringPassScheduleForm(
    validForm({ allowedEntryFromTime: "06:00", allowedEntryToTime: "" }),
  );
  assert.equal(oneSided.ok, false);
  if (!oneSided.ok) {
    assert.equal(
      oneSided.errors.allowedEntryToTime,
      RECURRING_PASS_TIME_WINDOW_INCOMPLETE_MESSAGE,
    );
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAdminCreateRecurringPassForm,
  type AdminCreateRecurringPassFormInput,
} from "./admin-recurring-pass-create.ts";
import {
  ALLOWED_DAYS_REQUIRED_MESSAGE,
  RECURRING_PASS_OTHER_TYPE_REQUIRED_MESSAGE,
  RECURRING_PASS_PHOTO_REQUIRED_MESSAGE,
  RECURRING_PASS_TIME_WINDOW_INCOMPLETE_MESSAGE,
  RECURRING_PASS_VALIDITY_ORDER_MESSAGE,
} from "./recurring-visitor-pass.ts";
import { DESTINATION_REQUIRED_MESSAGE } from "./visitor-destination.ts";
import { VISITOR_NAME_REQUIRED_MESSAGE } from "./visitor-name.ts";
import { INDIAN_MOBILE_VALIDATION_MESSAGE } from "./admin-resident-directory.ts";

function validForm(
  overrides: Partial<AdminCreateRecurringPassFormInput> = {},
): AdminCreateRecurringPassFormInput {
  return {
    visitorName: "Ravi Mehta",
    visitorMobile: "9876543210",
    visitorTypeCode: "DRIVER",
    customVisitorType: "",
    flatId: "33333333-3333-4333-a333-333333333301",
    residentId: "44444444-4444-4444-8444-444444444401",
    destinationText: null,
    vehicleNumber: "",
    validFromDisplay: "14-09-2026",
    validUntilDisplay: "14-12-2026",
    allowedDaysOfWeek: [1, 2, 3, 4, 5],
    allowedEntryFromTime: "",
    allowedEntryToTime: "",
    notes: "",
    hasPhoto: true,
    ...overrides,
  };
}

test("create form accepts a predefined type with a selected flat", () => {
  const parsed = parseAdminCreateRecurringPassForm(validForm());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.visitorTypeCode, "DRIVER");
  assert.equal(parsed.value.visitorTypeLabel, "Driver");
  assert.equal(parsed.value.validFrom, "2026-09-14");
  assert.equal(parsed.value.validUntil, "2026-12-14");
  assert.equal(parsed.value.destinationText, null);
  assert.equal(parsed.value.flatId, "33333333-3333-4333-a333-333333333301");
  assert.deepEqual(parsed.value.allowedDaysOfWeek, [1, 2, 3, 4, 5]);
  assert.equal(parsed.value.allowedEntryFromTime, null);
});

test("create form Other persists the custom label, never catalog Other", () => {
  const parsed = parseAdminCreateRecurringPassForm(
    validForm({
      visitorTypeCode: "OTHER",
      customVisitorType: "  Gardener  ",
      flatId: null,
      residentId: null,
      destinationText: "Gym",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.visitorTypeCode, "OTHER");
  assert.equal(parsed.value.visitorTypeLabel, "Gardener");
  assert.equal(parsed.value.flatId, null);
  assert.equal(parsed.value.residentId, null);
  assert.equal(parsed.value.destinationText, "Gym");
});

test("create form ignores leftover Other text when switching to a predefined type", () => {
  const parsed = parseAdminCreateRecurringPassForm(
    validForm({
      visitorTypeCode: "DRIVER",
      customVisitorType: "Gardener",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.visitorTypeCode, "DRIVER");
  assert.equal(parsed.value.visitorTypeLabel, "Driver");
});

test("create form requires name, Indian mobile, photo, days, and destination XOR", () => {
  const parsed = parseAdminCreateRecurringPassForm(
    validForm({
      visitorName: "   ",
      visitorMobile: "5123456789",
      visitorTypeCode: "OTHER",
      customVisitorType: "",
      flatId: null,
      residentId: null,
      destinationText: null,
      allowedDaysOfWeek: [],
      allowedEntryFromTime: "06:00",
      allowedEntryToTime: "",
      validFromDisplay: "20-09-2026",
      validUntilDisplay: "14-09-2026",
      hasPhoto: false,
    }),
  );
  assert.equal(parsed.ok, false);
  if (parsed.ok) {
    return;
  }
  assert.equal(parsed.errors.visitorName, VISITOR_NAME_REQUIRED_MESSAGE);
  assert.equal(parsed.errors.visitorMobile, INDIAN_MOBILE_VALIDATION_MESSAGE);
  assert.equal(parsed.errors.customVisitorType, RECURRING_PASS_OTHER_TYPE_REQUIRED_MESSAGE);
  assert.equal(parsed.errors.destinationText, DESTINATION_REQUIRED_MESSAGE);
  assert.equal(parsed.errors.allowedDaysOfWeek, ALLOWED_DAYS_REQUIRED_MESSAGE);
  assert.equal(
    parsed.errors.allowedEntryToTime,
    RECURRING_PASS_TIME_WINDOW_INCOMPLETE_MESSAGE,
  );
  assert.equal(parsed.errors.validUntil, RECURRING_PASS_VALIDITY_ORDER_MESSAGE);
  assert.equal(parsed.errors.photo, RECURRING_PASS_PHOTO_REQUIRED_MESSAGE);
});

import {
  validateAdminCreateRecurringPassInput,
  validateRecurringPassPhotoRequest,
} from "../_shared/admin-recurring-pass.ts";

const flatId = "33333333-3333-4333-a333-333333333301";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    visitor_name: "Ravi Mehta",
    visitor_mobile: "9876543210",
    visitor_type_code: "DRIVER",
    flat_id: flatId,
    valid_from: "2026-09-14",
    valid_until: "2026-12-14",
    allowed_days_of_week: [1, 2, 3, 4, 5],
    image_base64: "dGVzdA==",
    content_type: "image/jpeg",
    ...overrides,
  };
}

Deno.test("rejects client society identifiers", () => {
  const result = validateAdminCreateRecurringPassInput(
    validPayload({ society_id: "11111111-1111-1111-1111-111111111101" }),
  );
  assert(!result.ok, "client society must be rejected");
});

Deno.test("rejects client-supplied status and pass id", () => {
  const status = validateAdminCreateRecurringPassInput(
    validPayload({ status: "suspended" }),
  );
  assert(!status.ok, "client status must be rejected");

  const passId = validateAdminCreateRecurringPassInput(
    validPayload({ pass_id: "55555555-5555-4555-8555-555555555501" }),
  );
  assert(!passId.ok, "client pass id must be rejected");
});

Deno.test("predefined type stores catalog label and ignores leftover Other text", () => {
  const result = validateAdminCreateRecurringPassInput(
    validPayload({ custom_visitor_type: "Gardener" }),
  );
  assert(result.ok, "expected success");
  if (result.ok) {
    assert(result.value.visitorTypeCode === "DRIVER", "code mismatch");
    assert(result.value.visitorTypeLabel === "Driver", "label mismatch");
  }
});

Deno.test("OTHER persists the custom label, never catalog Other", () => {
  const result = validateAdminCreateRecurringPassInput(
    validPayload({
      visitor_type_code: "OTHER",
      custom_visitor_type: "  Gardener  ",
      flat_id: undefined,
      destination_text: "Gym",
    }),
  );
  assert(result.ok, "expected success");
  if (result.ok) {
    assert(result.value.visitorTypeCode === "OTHER", "code mismatch");
    assert(result.value.visitorTypeLabel === "Gardener", "label mismatch");
    assert(result.value.destinationText === "Gym", "destination mismatch");
    assert(result.value.flatId === null, "flat must be null for Other");
  }
});

Deno.test("OTHER requires a custom type", () => {
  const result = validateAdminCreateRecurringPassInput(
    validPayload({
      visitor_type_code: "OTHER",
      custom_visitor_type: "   ",
      flat_id: undefined,
      destination_text: "Gym",
    }),
  );
  assert(!result.ok, "blank custom type must fail");
});

Deno.test("rejects destination both and neither", () => {
  const neither = validateAdminCreateRecurringPassInput(
    validPayload({ flat_id: undefined, destination_text: undefined }),
  );
  assert(!neither.ok, "neither destination must fail");

  const both = validateAdminCreateRecurringPassInput(
    validPayload({ destination_text: "Gym" }),
  );
  assert(!both.ok, "both destinations must fail");
});

Deno.test("rejects Other destination linked to a resident", () => {
  const result = validateAdminCreateRecurringPassInput(
    validPayload({
      flat_id: undefined,
      destination_text: "Clubhouse",
      resident_id: "44444444-4444-4444-8444-444444444401",
    }),
  );
  assert(!result.ok, "other + resident must fail");
});

Deno.test("requires photo, Indian mobile, and at least one weekday", () => {
  const noPhoto = validateAdminCreateRecurringPassInput(
    validPayload({ image_base64: "" }),
  );
  assert(!noPhoto.ok, "photo required");

  const mobile = validateAdminCreateRecurringPassInput(
    validPayload({ visitor_mobile: "5123456789" }),
  );
  assert(!mobile.ok, "invalid mobile");

  const days = validateAdminCreateRecurringPassInput(
    validPayload({ allowed_days_of_week: [] }),
  );
  assert(!days.ok, "days required");
});

Deno.test("time window is both-or-neither and rejects overnight", () => {
  const ok = validateAdminCreateRecurringPassInput(
    validPayload({
      allowed_entry_from_time: "06:00",
      allowed_entry_to_time: "11:00",
    }),
  );
  assert(ok.ok, "daytime window should pass");
  if (ok.ok) {
    assert(ok.value.allowedEntryFromTime === "06:00:00", "from mismatch");
    assert(ok.value.allowedEntryToTime === "11:00:00", "to mismatch");
  }

  const oneSided = validateAdminCreateRecurringPassInput(
    validPayload({ allowed_entry_from_time: "06:00" }),
  );
  assert(!oneSided.ok, "one-sided window must fail");

  const overnight = validateAdminCreateRecurringPassInput(
    validPayload({
      allowed_entry_from_time: "21:00",
      allowed_entry_to_time: "06:00",
    }),
  );
  assert(!overnight.ok, "overnight must fail");
});

Deno.test("rejects valid_until before valid_from", () => {
  const result = validateAdminCreateRecurringPassInput(
    validPayload({ valid_from: "2026-09-20", valid_until: "2026-09-14" }),
  );
  assert(!result.ok, "inverted validity must fail");
});

Deno.test("photo retrieval rejects client society and requires UUID pass_id", () => {
  const spoof = validateRecurringPassPhotoRequest({
    pass_id: "55555555-5555-4555-8555-555555555501",
    society_id: "11111111-1111-1111-1111-111111111101",
  });
  assert(!spoof.ok, "client society must be rejected");

  const missing = validateRecurringPassPhotoRequest({});
  assert(!missing.ok, "pass_id required");

  const ok = validateRecurringPassPhotoRequest({
    pass_id: "55555555-5555-4555-8555-555555555501",
  });
  assert(ok.ok, "valid pass_id should parse");
});

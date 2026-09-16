import { validateAdminUpdateRecurringPassScheduleInput } from "../_shared/admin-recurring-pass.ts";

const passId = "55555555-5555-4555-8555-555555555501";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    pass_id: passId,
    valid_from: "2026-09-14",
    valid_until: "2026-12-14",
    allowed_days_of_week: [1, 2, 3, 4, 5],
    ...overrides,
  };
}

Deno.test("rejects client society identifiers", () => {
  const result = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ society_id: "11111111-1111-1111-1111-111111111101" }),
  );
  assert(!result.ok, "client society must be rejected");
});

Deno.test("rejects identity, status, and credential fields", () => {
  const status = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ status: "active" }),
  );
  assert(!status.ok, "status must be rejected");

  const name = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ visitor_name: "Someone Else" }),
  );
  assert(!name.ok, "visitor_name must be rejected");

  const photo = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ image_base64: "dGVzdA==" }),
  );
  assert(!photo.ok, "photo must be rejected");

  const token = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ token_hash: "abc" }),
  );
  assert(!token.ok, "token_hash must be rejected");
});

Deno.test("accepts a valid schedule update payload", () => {
  const result = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({
      allowed_entry_from_time: "17:00",
      allowed_entry_to_time: "21:00",
      vehicle_number: " MH12AB1234 ",
      notes: " Weekends ",
    }),
  );
  assert(result.ok, "expected success");
  if (result.ok) {
    assert(result.value.passId === passId, "pass id mismatch");
    assert(result.value.validFrom === "2026-09-14", "from mismatch");
    assert(result.value.allowedEntryFromTime === "17:00:00", "from time mismatch");
    assert(result.value.vehicleNumber === "MH12AB1234", "vehicle mismatch");
    assert(result.value.notes === "Weekends", "notes mismatch");
  }
});

Deno.test("rejects inverted dates, empty days, and overnight windows", () => {
  const inverted = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ valid_from: "2026-12-14", valid_until: "2026-09-14" }),
  );
  assert(!inverted.ok, "inverted dates must fail");

  const days = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ allowed_days_of_week: [] }),
  );
  assert(!days.ok, "empty days must fail");

  const overnight = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({
      allowed_entry_from_time: "21:00",
      allowed_entry_to_time: "06:00",
    }),
  );
  assert(!overnight.ok, "overnight must fail");

  const oneSided = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ allowed_entry_from_time: "06:00" }),
  );
  assert(!oneSided.ok, "one-sided window must fail");
});

Deno.test("requires a UUID pass_id", () => {
  const missing = validateAdminUpdateRecurringPassScheduleInput(
    validPayload({ pass_id: "" }),
  );
  assert(!missing.ok, "pass_id required");
});

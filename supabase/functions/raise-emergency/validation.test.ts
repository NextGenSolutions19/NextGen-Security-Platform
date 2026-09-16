import {
  MAX_EMERGENCY_NOTES_LENGTH,
  validateRaiseEmergencyInput,
} from "../_shared/emergency.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("requires emergency_type", () => {
  const result = validateRaiseEmergencyInput({});
  assert(!result.ok, "expected failure");
  if (!result.ok) {
    assert(result.code === "VALIDATION_ERROR", "expected VALIDATION_ERROR");
  }
});

Deno.test("rejects invalid emergency_type", () => {
  const result = validateRaiseEmergencyInput({ emergency_type: "EXPLOSION" });
  assert(!result.ok, "expected failure");
  if (!result.ok) {
    assert(result.code === "INVALID_EMERGENCY_TYPE", "expected INVALID_EMERGENCY_TYPE");
  }
});

Deno.test("accepts valid type and trims notes", () => {
  const result = validateRaiseEmergencyInput({
    emergency_type: " medical ",
    notes: "  fire in lobby  ",
    society_id: "should-be-ignored",
    raised_by_app_user_id: "should-be-ignored",
  });
  assert(result.ok, "expected success");
  if (result.ok) {
    assert(result.value.emergencyType === "MEDICAL", "type should normalize");
    assert(result.value.notes === "fire in lobby", "notes should trim");
  }
});

Deno.test("rejects notes over max length", () => {
  const result = validateRaiseEmergencyInput({
    emergency_type: "SECURITY",
    notes: "x".repeat(MAX_EMERGENCY_NOTES_LENGTH + 1),
  });
  assert(!result.ok, "expected failure");
});

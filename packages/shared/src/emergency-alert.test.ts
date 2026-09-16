import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_EMERGENCY_NOTES_LENGTH,
  RAISE_EMERGENCY_DUPLICATE_MESSAGE,
  RAISE_EMERGENCY_FORBIDDEN_MESSAGE,
  RAISE_EMERGENCY_NETWORK_MESSAGE,
  RAISE_EMERGENCY_SESSION_EXPIRED_MESSAGE,
  buildRaiseEmergencyRequest,
  formatEmergencyStatus,
  formatEmergencyTypeLabel,
  mapRaiseEmergencyUserMessage,
} from "./emergency-alert.ts";

test("raise-emergency payload includes only type and optional notes", () => {
  const withoutNotes = buildRaiseEmergencyRequest("SECURITY");
  assert.deepEqual(Object.keys(withoutNotes), ["emergency_type"]);
  assert.equal(withoutNotes.emergency_type, "SECURITY");
  assert.equal("society_id" in withoutNotes, false);
  assert.equal("raised_by_app_user_id" in withoutNotes, false);
  assert.equal("role" in withoutNotes, false);
  assert.equal("mobile" in withoutNotes, false);

  const withNotes = buildRaiseEmergencyRequest("FIRE", "  lobby smoke  ");
  assert.deepEqual(withNotes, {
    emergency_type: "FIRE",
    notes: "lobby smoke",
  });
});

test("notes are truncated to the backend maximum", () => {
  const payload = buildRaiseEmergencyRequest(
    "OTHER",
    "x".repeat(MAX_EMERGENCY_NOTES_LENGTH + 20),
  );
  assert.equal(payload.notes?.length, MAX_EMERGENCY_NOTES_LENGTH);
});

test("maps raise-emergency errors to Guard-safe copy", () => {
  assert.equal(
    mapRaiseEmergencyUserMessage({ status: 401, code: "UNAUTHORIZED" }),
    RAISE_EMERGENCY_SESSION_EXPIRED_MESSAGE,
  );
  assert.equal(
    mapRaiseEmergencyUserMessage({ status: 403, code: "FORBIDDEN" }),
    RAISE_EMERGENCY_FORBIDDEN_MESSAGE,
  );
  assert.equal(
    mapRaiseEmergencyUserMessage({ status: 409, code: "DUPLICATE_EMERGENCY" }),
    RAISE_EMERGENCY_DUPLICATE_MESSAGE,
  );
  assert.equal(
    mapRaiseEmergencyUserMessage({
      status: 400,
      code: "INVALID_EMERGENCY_TYPE",
      message: "emergency_type must be one of: SECURITY, MEDICAL, FIRE, POLICE, OTHER.",
    }),
    "emergency_type must be one of: SECURITY, MEDICAL, FIRE, POLICE, OTHER.",
  );
  assert.equal(
    mapRaiseEmergencyUserMessage({ status: 500, code: "INTERNAL_ERROR" }),
    RAISE_EMERGENCY_NETWORK_MESSAGE,
  );
});

test("formats emergency type and status for Guard UI", () => {
  assert.equal(formatEmergencyTypeLabel("MEDICAL"), "Medical");
  assert.equal(formatEmergencyStatus("RAISED"), "Raised");
});

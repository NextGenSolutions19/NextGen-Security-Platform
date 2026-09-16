import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NATIONAL_EMERGENCY_CONTACTS,
  SOCIETY_EMERGENCY_CONTACTS_EMPTY_MESSAGE,
  buildEmergencyTelUrl,
} from "./emergency-contacts.ts";

test("national emergency contacts use the approved public numbers", () => {
  assert.deepEqual(
    NATIONAL_EMERGENCY_CONTACTS.map((contact) => [contact.label, contact.number]),
    [
      ["Emergency Response Support System", "112"],
      ["Police", "100"],
      ["Ambulance", "102"],
      ["Fire Brigade", "101"],
    ],
  );
});

test("Call actions build tel URLs without society-specific numbers", () => {
  assert.equal(buildEmergencyTelUrl("112"), "tel:112");
  assert.equal(buildEmergencyTelUrl(" 100 "), "tel:100");
  assert.ok(
    NATIONAL_EMERGENCY_CONTACTS.every(
      (contact) => !contact.number.includes("DEMO"),
    ),
  );
  assert.equal(
    SOCIETY_EMERGENCY_CONTACTS_EMPTY_MESSAGE,
    "Society emergency contacts are not configured yet.",
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VISITOR_NAME_MAX_LENGTH,
  VISITOR_NAME_REQUIRED_MESSAGE,
  VISITOR_NAME_TOO_LONG_MESSAGE,
  parseRequiredVisitorName,
  readStoredVisitorName,
  resolveVisitorPrimaryIdentifier,
} from "./visitor-name.ts";

test("required visitor name trims, rejects blank, and allows Unicode names", () => {
  assert.deepEqual(parseRequiredVisitorName("  Asha Mehta  "), {
    ok: true,
    visitorName: "Asha Mehta",
  });
  assert.deepEqual(parseRequiredVisitorName(""), {
    ok: false,
    message: VISITOR_NAME_REQUIRED_MESSAGE,
  });
  assert.deepEqual(parseRequiredVisitorName("   "), {
    ok: false,
    message: VISITOR_NAME_REQUIRED_MESSAGE,
  });
  assert.deepEqual(parseRequiredVisitorName("A".repeat(VISITOR_NAME_MAX_LENGTH + 1)), {
    ok: false,
    message: VISITOR_NAME_TOO_LONG_MESSAGE,
  });
  assert.deepEqual(parseRequiredVisitorName("José O'Neill-Patel"), {
    ok: true,
    visitorName: "José O'Neill-Patel",
  });
  assert.equal(readStoredVisitorName(null), null);
  assert.equal(readStoredVisitorName("   "), null);
  assert.equal(readStoredVisitorName(" Ravi Shah "), "Ravi Shah");
});

test("primary visitor identifier prefers full name and falls back to mobile", () => {
  assert.equal(
    resolveVisitorPrimaryIdentifier({
      visitorName: "NEHA SHAH",
      visitorMobile: "8585858585",
    }),
    "NEHA SHAH",
  );
  assert.equal(
    resolveVisitorPrimaryIdentifier({
      visitorName: "  Asha Mehta  ",
      visitorMobile: "9876543210",
    }),
    "Asha Mehta",
  );
  assert.equal(
    resolveVisitorPrimaryIdentifier({
      visitorName: null,
      visitorMobile: "8585858585",
    }),
    "8585858585",
  );
  assert.equal(
    resolveVisitorPrimaryIdentifier({
      visitorName: "   ",
      visitorMobile: "9123456789",
    }),
    "9123456789",
  );
});

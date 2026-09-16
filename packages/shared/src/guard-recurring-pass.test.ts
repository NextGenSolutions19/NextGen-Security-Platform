import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateGuardRecurringPassEligibility,
  isQrRecurringEntrySource,
  mapGuardRecurringValidationMessage,
  parseGuardFallbackReason,
  parseGuardRecurringQrPayload,
  parseGuardRecurringSearchQuery,
  sanitizeGuardRecurringMetadata,
} from "./guard-recurring-pass.ts";
import {
  generateRecurringPassQrToken,
  isRecurringPassQrToken,
  type RecurringVisitorPassSchedule,
} from "./recurring-visitor-pass.ts";

const MONDAY_MIDDAY_IST = new Date("2026-09-14T06:30:00.000Z");

function schedule(
  overrides: Partial<RecurringVisitorPassSchedule> = {},
): RecurringVisitorPassSchedule {
  return {
    status: "active",
    validFrom: "2026-09-01",
    validUntil: "2026-09-30",
    allowedDaysOfWeek: [1, 2, 3, 4, 5, 6],
    allowedEntryFromTime: "08:00:00",
    allowedEntryToTime: "20:00:00",
    ...overrides,
  };
}

test("camera QR and imported QR share the same eligibility predicate as fallback", () => {
  assert.equal(isQrRecurringEntrySource("CAMERA_QR"), true);
  assert.equal(isQrRecurringEntrySource("IMPORTED_QR"), true);
  assert.equal(isQrRecurringEntrySource("FALLBACK_SEARCH"), false);

  const eligible = evaluateGuardRecurringPassEligibility(
    schedule(),
    MONDAY_MIDDAY_IST,
  );
  assert.deepEqual(eligible, { ok: true });

  const cases: Array<[Partial<RecurringVisitorPassSchedule>, string]> = [
    [{ status: "suspended" }, "PASS_SUSPENDED"],
    [{ status: "revoked" }, "PASS_REVOKED"],
    [{ validUntil: "2026-09-13" }, "PASS_EXPIRED"],
    [{ validFrom: "2026-09-15" }, "PASS_NOT_YET_VALID"],
    [{ allowedDaysOfWeek: [0] }, "DAY_NOT_ALLOWED"],
    [
      { allowedEntryFromTime: "06:00:00", allowedEntryToTime: "07:00:00" },
      "TIME_NOT_ALLOWED",
    ],
  ];

  for (const [overrides, code] of cases) {
    const result = evaluateGuardRecurringPassEligibility(
      schedule(overrides),
      MONDAY_MIDDAY_IST,
    );
    assert.equal(result.ok, false, code);
    if (!result.ok) {
      assert.equal(result.code, code);
      assert.equal(result.message, mapGuardRecurringValidationMessage(code));
    }
  }
});

test("opaque QR payload is accepted only in NGSP1 format and hashed separately", () => {
  const token = generateRecurringPassQrToken();
  assert.equal(parseGuardRecurringQrPayload(token).ok, true);
  assert.equal(isRecurringPassQrToken(token), true);

  const hash = createHash("sha256").update(token).digest("hex");
  assert.notEqual(hash, token);
  assert.equal(parseGuardRecurringQrPayload(hash).ok, false);
  assert.equal(parseGuardRecurringQrPayload("not-a-pass").ok, false);
  assert.equal(
    parseGuardRecurringQrPayload("").ok === false &&
      parseGuardRecurringQrPayload("").ok === false,
    true,
  );
});

test("replaced credentials are treated as unusable QR payloads at the message layer", () => {
  assert.equal(
    mapGuardRecurringValidationMessage("REPLACED_QR"),
    "This QR is not a valid recurring visitor pass.",
  );
  assert.equal(
    mapGuardRecurringValidationMessage("TENANT_MISMATCH"),
    "This QR is not a valid recurring visitor pass.",
  );
  assert.equal(
    mapGuardRecurringValidationMessage("ALREADY_CHECKED_IN"),
    "Visitor is already checked in.",
  );
});

test("fallback requires a non-blank reason and a usable search query", () => {
  assert.equal(parseGuardFallbackReason("   ").ok, false);
  assert.deepEqual(parseGuardFallbackReason("Visitor forgot QR"), {
    ok: true,
    reason: "Visitor forgot QR",
  });
  assert.equal(parseGuardRecurringSearchQuery("R").ok, false);
  assert.equal(parseGuardRecurringSearchQuery("Ramesh").ok, true);
});

test("T03 migration only adds one-open-visit uniqueness and does not rewrite visitor_entries", () => {
  const sql = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../supabase/migrations/20260913163000_m04_t03_one_open_recurring_visit.sql",
    ),
    "utf8",
  );
  assert.match(sql, /visitor_entries_one_open_recurring_visit/);
  assert.match(sql, /recurring_pass_id is not null/);
  assert.match(sql, /status = 'checked_in'/);
  assert.equal(/drop policy/i.test(sql), false);
  assert.equal(/alter table public\.visitor_entries/i.test(sql), false);
  assert.equal(/20260901140000/i.test(sql), false);
});

test("audit metadata never keeps raw QR tokens or hashes", () => {
  const token = generateRecurringPassQrToken();
  const safe = sanitizeGuardRecurringMetadata({
    source: "CAMERA_QR",
    token,
    token_hash: "a".repeat(64),
    reason: "Visitor forgot QR",
  });
  assert.equal(safe.token, undefined);
  assert.equal(safe.token_hash, undefined);
  assert.equal(safe.source, "CAMERA_QR");
  assert.equal(safe.reason, "Visitor forgot QR");
});

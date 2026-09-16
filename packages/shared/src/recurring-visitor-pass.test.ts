import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RECURRING_PASS_ENTRY_METHODS,
  RECURRING_PASS_EVENT_TYPES,
  RECURRING_PASS_NO_QR_REASONS,
  RECURRING_PASS_NOTES_MAX_LENGTH,
  RECURRING_PASS_OTHER_TYPE_REQUIRED_MESSAGE,
  RECURRING_PASS_OTHER_TYPE_TOO_LONG_MESSAGE,
  RECURRING_PASS_TIME_WINDOW_INCOMPLETE_MESSAGE,
  RECURRING_PASS_TIME_WINDOW_ORDER_MESSAGE,
  RECURRING_PASS_TYPE_REQUIRED_MESSAGE,
  RECURRING_PASS_VALIDITY_ORDER_MESSAGE,
  RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH,
  RECURRING_PASS_VISITOR_TYPE_LABEL_MAX_LENGTH,
  RECURRING_VISITOR_PASS_STATUSES,
  RECURRING_VISITOR_TYPES,
  canReactivateRecurringPass,
  evaluateRecurringPassUsability,
  formatAllowedDaysOfWeek,
  formatStoredRecurringVisitorType,
  formatVisitPurposeSummary,
  getIstDateString,
  getIstTimeOfDay,
  getIstWeekday,
  isRecurringPassEntryMethod,
  isRecurringPassExpired,
  isRecurringPassNoQrReason,
  isRecurringPassSearchable,
  isRecurringPassTokenHash,
  generateRecurringPassQrToken,
  isRecurringPassQrToken,
  parseRequiredRecurringPassReason,
  RECURRING_PASS_QR_TOKEN_LENGTH,
  RECURRING_PASS_QR_TOKEN_PREFIX,
  isRecurringVisitorTypeCode,
  normalizeAllowedDaysOfWeek,
  parseOptionalRecurringPassNotes,
  parseOptionalRecurringPassVehicle,
  parseRecurringPassTimeWindow,
  parseRecurringPassValidityRange,
  requiresCustomRecurringVisitorType,
  resolveAdminReportPurposeSummaryLabel,
  resolvePersistedRecurringVisitorType,
  resolveRecurringPassDisplayState,
  resolveRecurringVisitorTypeLabel,
  resolveVisitRecurringVisitorTypeLabel,
  resolveVisitorEntryTypeLabel,
  isRecurringServiceVisit,
  RECURRING_SERVICE_PURPOSE_CODE,
  RECURRING_SERVICE_PURPOSE_LABEL,
  timeToSeconds,
  type RecurringPassRejectionCode,
  type RecurringVisitorPassSchedule,
} from "./recurring-visitor-pass.ts";

/** 2026-09-14 is a Monday in IST. */
const MONDAY_MIDDAY_IST = new Date("2026-09-14T06:30:00.000Z");

test("recurring visit history exposes entry type and stored visitor type separately", () => {
  const recurring = {
    purpose: RECURRING_SERVICE_PURPOSE_LABEL,
    purposeCode: RECURRING_SERVICE_PURPOSE_CODE,
    purposeLabel: RECURRING_SERVICE_PURPOSE_LABEL,
    customPurposeText: "Driver",
  };
  assert.equal(isRecurringServiceVisit(recurring), true);
  assert.equal(resolveVisitorEntryTypeLabel(recurring), "Recurring Service");
  assert.equal(resolveVisitRecurringVisitorTypeLabel(recurring), "Driver");
  assert.equal(
    resolveAdminReportPurposeSummaryLabel(recurring),
    "Driver (Recurring Service)",
  );

  const custom = {
    ...recurring,
    customPurposeText: "Gardener",
  };
  assert.equal(resolveVisitRecurringVisitorTypeLabel(custom), "Gardener");
  assert.notEqual(resolveVisitRecurringVisitorTypeLabel(custom), "Other");

  const guest = {
    purpose: "Guest",
    purposeCode: "guest",
    purposeLabel: "Guest",
    customPurposeText: null,
  };
  assert.equal(isRecurringServiceVisit(guest), false);
  assert.equal(resolveVisitorEntryTypeLabel(guest), "Guest");
  assert.equal(resolveVisitRecurringVisitorTypeLabel(guest), null);
});

test("frequent visitor purpose summary includes recurring visitor type", () => {
  const recurring = {
    purpose: RECURRING_SERVICE_PURPOSE_LABEL,
    purposeCode: RECURRING_SERVICE_PURPOSE_CODE,
    purposeLabel: RECURRING_SERVICE_PURPOSE_LABEL,
    customPurposeText: "Driver",
  };
  assert.equal(
    formatVisitPurposeSummary(recurring),
    "Recurring Service - Driver",
  );
  assert.equal(
    formatVisitPurposeSummary({
      ...recurring,
      customPurposeText: "Night Watchman",
    }),
    "Recurring Service - Night Watchman",
  );
  assert.equal(
    formatVisitPurposeSummary({
      purpose: "Guest",
      purposeCode: "guest",
      purposeLabel: "Guest",
    }),
    "Guest",
  );
});

function schedule(
  overrides: Partial<RecurringVisitorPassSchedule> = {},
): RecurringVisitorPassSchedule {
  return {
    status: "active",
    validFrom: "2026-09-01",
    validUntil: "2026-12-31",
    allowedDaysOfWeek: [1, 2, 3, 4, 5],
    allowedEntryFromTime: null,
    allowedEntryToTime: null,
    ...overrides,
  };
}

test("persisted statuses exclude expired, display states derive it", () => {
  assert.deepEqual(
    [...RECURRING_VISITOR_PASS_STATUSES],
    ["active", "suspended", "revoked"],
  );
  assert.ok(
    !(RECURRING_VISITOR_PASS_STATUSES as readonly string[]).includes("expired"),
  );

  assert.equal(
    resolveRecurringPassDisplayState(
      { status: "active", validFrom: "2026-09-01", validUntil: "2026-12-31" },
      MONDAY_MIDDAY_IST,
    ),
    "active",
  );
  assert.equal(
    resolveRecurringPassDisplayState(
      { status: "active", validFrom: "2026-01-01", validUntil: "2026-09-13" },
      MONDAY_MIDDAY_IST,
    ),
    "expired",
  );
  assert.equal(
    resolveRecurringPassDisplayState(
      { status: "suspended", validFrom: "2026-01-01", validUntil: "2026-09-13" },
      MONDAY_MIDDAY_IST,
    ),
    "expired",
  );
  // Revocation is the terminal fact and outranks derived expiry.
  assert.equal(
    resolveRecurringPassDisplayState(
      { status: "revoked", validFrom: "2026-01-01", validUntil: "2026-09-13" },
      MONDAY_MIDDAY_IST,
    ),
    "revoked",
  );
  // valid_until is inclusive: the last valid day is not yet expired.
  assert.equal(
    isRecurringPassExpired(
      { status: "active", validFrom: "2026-01-01", validUntil: "2026-09-14" },
      MONDAY_MIDDAY_IST,
    ),
    false,
  );
});

test("reactivation requires suspended, non-revoked, non-expired", () => {
  assert.deepEqual(
    canReactivateRecurringPass(
      { status: "suspended", validFrom: "2026-09-01", validUntil: "2026-12-31" },
      MONDAY_MIDDAY_IST,
    ),
    { ok: true },
  );

  const revoked = canReactivateRecurringPass(
    { status: "revoked", validFrom: "2026-09-01", validUntil: "2026-12-31" },
    MONDAY_MIDDAY_IST,
  );
  assert.equal(revoked.ok, false);

  const expired = canReactivateRecurringPass(
    { status: "suspended", validFrom: "2026-01-01", validUntil: "2026-09-13" },
    MONDAY_MIDDAY_IST,
  );
  assert.equal(expired.ok, false);
  assert.match(
    expired.ok ? "" : expired.message,
    /Renew its validity before reactivating/,
  );

  const alreadyActive = canReactivateRecurringPass(
    { status: "active", validFrom: "2026-09-01", validUntil: "2026-12-31" },
    MONDAY_MIDDAY_IST,
  );
  assert.equal(alreadyActive.ok, false);
});

test("usability blocks revoked, suspended, expired and not-yet-valid passes", () => {
  assert.deepEqual(
    evaluateRecurringPassUsability(schedule(), MONDAY_MIDDAY_IST),
    { ok: true },
  );

  const cases: ReadonlyArray<{
    overrides: Partial<RecurringVisitorPassSchedule>;
    code: RecurringPassRejectionCode;
  }> = [
    { overrides: { status: "revoked" }, code: "PASS_REVOKED" },
    { overrides: { status: "suspended" }, code: "PASS_SUSPENDED" },
    { overrides: { validFrom: "2026-10-01" }, code: "PASS_NOT_YET_VALID" },
    { overrides: { validUntil: "2026-09-13" }, code: "PASS_EXPIRED" },
  ];

  for (const { overrides, code } of cases) {
    const result = evaluateRecurringPassUsability(
      schedule(overrides),
      MONDAY_MIDDAY_IST,
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok ? "" : result.code, code);
  }
});

test("usability enforces allowed weekday in IST", () => {
  assert.equal(getIstWeekday(MONDAY_MIDDAY_IST), 1);

  const weekendOnly = evaluateRecurringPassUsability(
    schedule({ allowedDaysOfWeek: [0, 6] }),
    MONDAY_MIDDAY_IST,
  );
  assert.equal(weekendOnly.ok, false);
  assert.equal(weekendOnly.ok ? "" : weekendOnly.code, "DAY_NOT_ALLOWED");

  // 2026-09-14T18:45Z is 00:15 IST on Tuesday 2026-09-15. Evaluating the raw
  // UTC instant would wrongly report Monday.
  const tuesdayEarlyIst = new Date("2026-09-14T18:45:00.000Z");
  assert.equal(getIstDateString(tuesdayEarlyIst), "2026-09-15");
  assert.equal(getIstWeekday(tuesdayEarlyIst), 2);

  const mondayOnly = evaluateRecurringPassUsability(
    schedule({ allowedDaysOfWeek: [1] }),
    tuesdayEarlyIst,
  );
  assert.equal(mondayOnly.ok, false);
  assert.equal(mondayOnly.ok ? "" : mondayOnly.code, "DAY_NOT_ALLOWED");
});

test("usability enforces the optional entry time window in IST", () => {
  assert.equal(getIstTimeOfDay(MONDAY_MIDDAY_IST), "12:00:00");

  assert.deepEqual(
    evaluateRecurringPassUsability(
      schedule({
        allowedEntryFromTime: "07:00",
        allowedEntryToTime: "18:00:00",
      }),
      MONDAY_MIDDAY_IST,
    ),
    { ok: true },
  );

  const outside = evaluateRecurringPassUsability(
    schedule({ allowedEntryFromTime: "06:00", allowedEntryToTime: "09:30" }),
    MONDAY_MIDDAY_IST,
  );
  assert.equal(outside.ok, false);
  assert.equal(outside.ok ? "" : outside.code, "TIME_NOT_ALLOWED");

  // Half-configured and overnight windows are refused, never reinterpreted.
  const halfConfigured = evaluateRecurringPassUsability(
    schedule({ allowedEntryFromTime: "07:00", allowedEntryToTime: null }),
    MONDAY_MIDDAY_IST,
  );
  assert.equal(halfConfigured.ok, false);
  assert.equal(halfConfigured.ok ? "" : halfConfigured.code, "SCHEDULE_INVALID");

  const overnight = evaluateRecurringPassUsability(
    schedule({ allowedEntryFromTime: "22:00", allowedEntryToTime: "05:00" }),
    MONDAY_MIDDAY_IST,
  );
  assert.equal(overnight.ok, false);
  assert.equal(overnight.ok ? "" : overnight.code, "SCHEDULE_INVALID");
});

test("allowed days normalize, dedupe, sort and reject invalid input", () => {
  assert.deepEqual(normalizeAllowedDaysOfWeek([5, 1, 5, 0]), {
    ok: true,
    days: [0, 1, 5],
  });
  assert.equal(normalizeAllowedDaysOfWeek([]).ok, false);
  assert.equal(normalizeAllowedDaysOfWeek([7]).ok, false);
  assert.equal(normalizeAllowedDaysOfWeek([-1]).ok, false);
  assert.equal(normalizeAllowedDaysOfWeek([1.5]).ok, false);
  assert.equal(normalizeAllowedDaysOfWeek([null]).ok, false);
  assert.equal(normalizeAllowedDaysOfWeek(["1"]).ok, false);

  assert.equal(formatAllowedDaysOfWeek([0, 1, 2, 3, 4, 5, 6]), "Every day");
  assert.equal(formatAllowedDaysOfWeek([1, 3]), "Mon, Wed");
  assert.equal(formatAllowedDaysOfWeek([]), "");

  const invalidSchedule = evaluateRecurringPassUsability(
    schedule({ allowedDaysOfWeek: [] }),
    MONDAY_MIDDAY_IST,
  );
  assert.equal(invalidSchedule.ok, false);
  assert.equal(invalidSchedule.ok ? "" : invalidSchedule.code, "SCHEDULE_INVALID");
});

test("time parsing accepts HH:MM and HH:MM:SS and rejects junk", () => {
  assert.equal(timeToSeconds("07:00"), 25200);
  assert.equal(timeToSeconds("07:00:30"), 25230);
  assert.equal(timeToSeconds(" 23:59:59 "), 86399);
  assert.equal(timeToSeconds("24:00"), null);
  assert.equal(timeToSeconds("07:60"), null);
  assert.equal(timeToSeconds("morning"), null);
});

test("validity range stores ISO dates and rejects until before from", () => {
  assert.deepEqual(
    parseRecurringPassValidityRange({
      validFrom: "2026-09-14",
      validUntil: "2026-09-20",
    }),
    { ok: true, validFrom: "2026-09-14", validUntil: "2026-09-20" },
  );
  assert.deepEqual(
    parseRecurringPassValidityRange({
      validFrom: "2026-09-14",
      validUntil: "2026-09-14",
    }),
    { ok: true, validFrom: "2026-09-14", validUntil: "2026-09-14" },
  );

  const inverted = parseRecurringPassValidityRange({
    validFrom: "2026-09-20",
    validUntil: "2026-09-14",
  });
  assert.equal(inverted.ok, false);
  if (!inverted.ok) {
    assert.equal(inverted.field, "validUntil");
    assert.equal(inverted.message, RECURRING_PASS_VALIDITY_ORDER_MESSAGE);
  }

  const blank = parseRecurringPassValidityRange({
    validFrom: "  ",
    validUntil: "2026-09-14",
  });
  assert.equal(blank.ok, false);
  if (!blank.ok) {
    assert.equal(blank.field, "validFrom");
  }

  const impossible = parseRecurringPassValidityRange({
    validFrom: "2026-02-31",
    validUntil: "2026-03-01",
  });
  assert.equal(impossible.ok, false);
});

test("optional time window is both-or-neither, same-day, and end after start", () => {
  assert.deepEqual(parseRecurringPassTimeWindow({ from: "", to: "" }), {
    ok: true,
    from: null,
    to: null,
  });
  assert.deepEqual(
    parseRecurringPassTimeWindow({ from: "06:00", to: "11:00" }),
    { ok: true, from: "06:00:00", to: "11:00:00" },
  );
  assert.deepEqual(
    parseRecurringPassTimeWindow({ from: "17:00", to: "21:00" }),
    { ok: true, from: "17:00:00", to: "21:00:00" },
  );

  const oneSided = parseRecurringPassTimeWindow({ from: "06:00", to: "" });
  assert.equal(oneSided.ok, false);
  if (!oneSided.ok) {
    assert.equal(oneSided.message, RECURRING_PASS_TIME_WINDOW_INCOMPLETE_MESSAGE);
  }

  const overnight = parseRecurringPassTimeWindow({ from: "21:00", to: "06:00" });
  assert.equal(overnight.ok, false);
  if (!overnight.ok) {
    assert.equal(overnight.message, RECURRING_PASS_TIME_WINDOW_ORDER_MESSAGE);
  }

  const equal = parseRecurringPassTimeWindow({ from: "08:00", to: "08:00" });
  assert.equal(equal.ok, false);
});

test("optional vehicle and notes trim, reject whitespace-only, and cap length", () => {
  assert.deepEqual(parseOptionalRecurringPassVehicle("  MH12AB1234  "), {
    ok: true,
    vehicleNumber: "MH12AB1234",
  });
  assert.deepEqual(parseOptionalRecurringPassVehicle("   "), {
    ok: true,
    vehicleNumber: null,
  });
  assert.equal(
    parseOptionalRecurringPassVehicle("X".repeat(RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH + 1))
      .ok,
    false,
  );

  assert.deepEqual(parseOptionalRecurringPassNotes("  Gate notes  "), {
    ok: true,
    notes: "Gate notes",
  });
  assert.deepEqual(parseOptionalRecurringPassNotes("   "), {
    ok: true,
    notes: null,
  });
  assert.equal(
    parseOptionalRecurringPassNotes("N".repeat(RECURRING_PASS_NOTES_MAX_LENGTH + 1)).ok,
    false,
  );
});

test("recurring visitor types keep stable codes and labels", () => {
  assert.equal(RECURRING_VISITOR_TYPES.length, 9);
  assert.ok(isRecurringVisitorTypeCode("DOMESTIC_HELP"));
  assert.ok(isRecurringVisitorTypeCode("OTHER"));
  assert.ok(!isRecurringVisitorTypeCode("domestic_help"));
  assert.ok(!isRecurringVisitorTypeCode("MAID"));
  assert.equal(
    resolveRecurringVisitorTypeLabel("DOMESTIC_HELP"),
    "Domestic Help / Maid",
  );
  assert.equal(resolveRecurringVisitorTypeLabel("UNKNOWN"), null);

  const codes = RECURRING_VISITOR_TYPES.map((type) => type.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("OTHER visitor type persists the custom label, never the catalog word Other", () => {
  assert.deepEqual(
    resolvePersistedRecurringVisitorType({
      code: "DRIVER",
      customLabel: "Gardener",
    }),
    { ok: true, code: "DRIVER", label: "Driver" },
  );

  assert.deepEqual(
    resolvePersistedRecurringVisitorType({
      code: "OTHER",
      customLabel: "  Gardener  ",
    }),
    { ok: true, code: "OTHER", label: "Gardener" },
  );

  const blank = resolvePersistedRecurringVisitorType({
    code: "OTHER",
    customLabel: "   ",
  });
  assert.equal(blank.ok, false);
  if (!blank.ok) {
    assert.equal(blank.field, "customVisitorType");
    assert.equal(blank.message, RECURRING_PASS_OTHER_TYPE_REQUIRED_MESSAGE);
  }

  const missing = resolvePersistedRecurringVisitorType({
    code: "OTHER",
    customLabel: "",
  });
  assert.equal(missing.ok, false);

  const tooLong = resolvePersistedRecurringVisitorType({
    code: "OTHER",
    customLabel: "G".repeat(RECURRING_PASS_VISITOR_TYPE_LABEL_MAX_LENGTH + 1),
  });
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) {
    assert.equal(tooLong.message, RECURRING_PASS_OTHER_TYPE_TOO_LONG_MESSAGE);
  }

  const none = resolvePersistedRecurringVisitorType({ code: null });
  assert.equal(none.ok, false);
  if (!none.ok) {
    assert.equal(none.field, "visitorTypeCode");
    assert.equal(none.message, RECURRING_PASS_TYPE_REQUIRED_MESSAGE);
  }

  assert.equal(requiresCustomRecurringVisitorType("OTHER"), true);
  assert.equal(requiresCustomRecurringVisitorType("DRIVER"), false);

  assert.equal(
    formatStoredRecurringVisitorType({
      visitorTypeCode: "OTHER",
      visitorTypeLabel: "Gardener",
    }),
    "Gardener",
  );
  assert.equal(
    formatStoredRecurringVisitorType({
      visitorTypeCode: "DRIVER",
      visitorTypeLabel: "Driver",
    }),
    "Driver",
  );
});

test("entry methods, fallback reasons and event types match the migration", () => {
  assert.deepEqual(
    [...RECURRING_PASS_ENTRY_METHODS],
    ["RECURRING_QR", "RECURRING_FALLBACK"],
  );
  assert.ok(isRecurringPassEntryMethod("RECURRING_QR"));
  assert.ok(isRecurringPassEntryMethod("RECURRING_FALLBACK"));
  assert.ok(!isRecurringPassEntryMethod("OTP_VERIFIED"));

  assert.deepEqual(
    [...RECURRING_PASS_NO_QR_REASONS],
    ["QR_FORGOTTEN", "QR_DAMAGED", "PHONE_UNAVAILABLE", "OTHER"],
  );
  assert.ok(isRecurringPassNoQrReason("QR_DAMAGED"));
  assert.ok(!isRecurringPassNoQrReason("FORGOT"));

  assert.equal(RECURRING_PASS_EVENT_TYPES.length, 12);
  assert.ok(RECURRING_PASS_EVENT_TYPES.includes("CHECKIN_VIA_FALLBACK"));
  assert.ok(RECURRING_PASS_EVENT_TYPES.includes("QR_VALIDATION_REJECTED"));
});

test("token hash shape accepts SHA-256 hex and rejects plaintext tokens", () => {
  assert.ok(isRecurringPassTokenHash("a".repeat(64)));
  assert.ok(isRecurringPassTokenHash("0123456789abcdef".repeat(4)));
  // generateVerificationToken() emits 24 random bytes = 48 hex chars.
  assert.ok(!isRecurringPassTokenHash("b".repeat(48)));
  assert.ok(!isRecurringPassTokenHash("A".repeat(64)));
  assert.ok(!isRecurringPassTokenHash("z".repeat(64)));
});

test("guard search excludes revoked passes only", () => {
  assert.ok(
    isRecurringPassSearchable({
      status: "active",
      validFrom: "2026-09-01",
      validUntil: "2026-12-31",
    }),
  );
  assert.ok(
    isRecurringPassSearchable({
      status: "suspended",
      validFrom: "2026-09-01",
      validUntil: "2026-12-31",
    }),
  );
  assert.ok(
    !isRecurringPassSearchable({
      status: "revoked",
      validFrom: "2026-09-01",
      validUntil: "2026-12-31",
    }),
  );
});

// ---------------------------------------------------------------------------
// Static review of the M04 foundation migration
// ---------------------------------------------------------------------------

const MIGRATION_SQL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../supabase/migrations/20260909140000_m04_recurring_visitor_pass_foundation.sql",
  ),
  "utf8",
);

/**
 * Comment-free view. Absence assertions run against this so they test executable
 * SQL rather than the explanatory prose above it. No string literal in this
 * migration contains a `--` sequence, so naive stripping is safe here.
 */
const MIGRATION_STATEMENTS = MIGRATION_SQL.replace(/--[^\n]*/g, "");

interface SqlPolicy {
  name: string;
  table: string;
  command: string;
  roles: string;
}

function policies(sql: string): SqlPolicy[] {
  return [
    ...sql.matchAll(
      /create policy\s+(\S+)\s+on\s+(\S+)\s+for\s+(\w+)\s+to\s+(\w+)/gi,
    ),
  ].map((match) => ({
    name: match[1],
    table: match[2],
    command: match[3].toLowerCase(),
    roles: match[4].toLowerCase(),
  }));
}

interface SqlGrant {
  privileges: string[];
  table: string;
  role: string;
}

function grants(sql: string): SqlGrant[] {
  return [
    ...sql.matchAll(/grant\s+([a-z, ]+?)\s+on\s+(\S+)\s+to\s+(\w+);/gi),
  ].map((match) => ({
    privileges: match[1].split(",").map((privilege) => privilege.trim()),
    table: match[2],
    role: match[3],
  }));
}

test("M04 migration is additive and touches no existing data or policies", () => {
  const sql = MIGRATION_STATEMENTS;
  assert.equal(/update\s+public\.visitor_entries/i.test(sql), false);
  assert.equal(/\bdelete\s+from\b/i.test(sql), false);
  assert.equal(/\bdrop\s+table\b/i.test(sql), false);
  assert.equal(/\bdrop\s+policy\b/i.test(sql), false);
  assert.equal(/\balter\s+policy\b/i.test(sql), false);
  assert.equal(/\bdrop\s+constraint\b/i.test(sql), false);
  assert.equal(/\bdrop\s+column\b/i.test(sql), false);
  assert.equal(/\bdrop\s+trigger\b/i.test(sql), false);
  assert.equal(/\bdrop\s+not\s+null\b/i.test(sql), false);
  assert.equal(/\bset\s+not\s+null\b/i.test(sql), false);
  assert.equal(/\btruncate\s+table\b/i.test(sql), false);
  assert.equal(/backfill/i.test(sql), false);

  // No auth/tenancy helper or enum is redefined.
  assert.equal(/function\s+public\.auth_/i.test(sql), false);
  assert.equal(/\balter\s+type\b/i.test(sql), false);
  assert.equal(/\badd\s+value\b/i.test(sql), false);
  assert.equal(/storage\.buckets/i.test(sql), false);
  assert.equal(/storage\.objects/i.test(sql), false);

  // Only visitor_entries is altered, and only additively.
  const alteredTables = new Set(
    [...sql.matchAll(/alter table\s+(\S+)/gi)].map((match) => match[1]),
  );
  assert.deepEqual(
    [...alteredTables].filter(
      (table) => !table.startsWith("public.recurring_visitor_pass"),
    ),
    ["public.visitor_entries"],
  );
});

test("M04 migration persists only three pass statuses and never stores expired", () => {
  assert.match(
    MIGRATION_SQL,
    /status in \('active', 'suspended', 'revoked'\)/,
  );
  assert.equal(/status in \([^)]*'expired'/i.test(MIGRATION_STATEMENTS), false);
  assert.equal(/'expired'/.test(MIGRATION_STATEMENTS), false);
  // Expiry is compared against the IST calendar date at evaluation time.
  assert.match(MIGRATION_SQL, /timezone\('Asia\/Kolkata', now\(\)\)\)::date/);
  assert.match(MIGRATION_SQL, /valid_until date not null/);
  assert.match(MIGRATION_SQL, /valid_until >= valid_from/);
});

test("M04 migration makes revocation terminal via constraint and trigger", () => {
  assert.match(
    MIGRATION_SQL,
    /constraint recurring_visitor_passes_revocation_consistency check/,
  );
  assert.match(
    MIGRATION_SQL,
    /a revoked pass is terminal and cannot be modified/,
  );
  assert.match(
    MIGRATION_SQL,
    /a revoked QR credential is terminal and cannot be modified/,
  );
  assert.match(
    MIGRATION_SQL,
    /cannot reactivate an expired pass\. Renew validity first/,
  );
  assert.match(
    MIGRATION_SQL,
    /create trigger recurring_visitor_passes_enforce_transition/,
  );
});

test("M04 migration mirrors the M03 destination XOR model on the pass table", () => {
  assert.match(
    MIGRATION_SQL,
    /constraint recurring_visitor_passes_destination_text_format check/,
  );
  assert.match(
    MIGRATION_SQL,
    /constraint recurring_visitor_passes_destination_present check/,
  );
  assert.match(
    MIGRATION_SQL,
    /constraint recurring_visitor_passes_other_has_no_resident check/,
  );
  assert.match(
    MIGRATION_SQL,
    /char_length\(trim\(destination_text\)\) <= 80/,
  );
  // Same-society integrity for both destination references.
  assert.match(
    MIGRATION_SQL,
    /recurring_visitor_passes\.society_id must match flat society/,
  );
  assert.match(
    MIGRATION_SQL,
    /recurring_visitor_passes\.resident_id must belong to the same society/,
  );
  assert.match(
    MIGRATION_SQL,
    /create trigger recurring_visitor_passes_enforce_same_society/,
  );
});

test("M04 migration stores only hashed QR tokens and keeps them off the client", () => {
  assert.match(
    MIGRATION_SQL,
    /recurring_visitor_pass_credentials_token_hash_unique unique \(token_hash\)/,
  );
  assert.match(MIGRATION_SQL, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(
    MIGRATION_SQL,
    /create unique index recurring_visitor_pass_credentials_one_active_per_pass/,
  );
  // No plaintext token column of any kind.
  assert.equal(/^\s*token text/im.test(MIGRATION_STATEMENTS), false);
  assert.equal(
    /token_plaintext|qr_token\b|token_value/i.test(MIGRATION_STATEMENTS),
    false,
  );

  const credentialPolicies = policies(MIGRATION_SQL).filter(
    (policy) => policy.table === "public.recurring_visitor_pass_credentials",
  );
  assert.deepEqual(credentialPolicies, []);

  const credentialGrants = grants(MIGRATION_SQL).filter(
    (grant) => grant.table === "public.recurring_visitor_pass_credentials",
  );
  assert.deepEqual(
    credentialGrants.map((grant) => grant.role),
    ["service_role"],
  );
});

test("M04 migration exposes only society-admin reads and no client writes", () => {
  const created = policies(MIGRATION_SQL);
  assert.deepEqual(
    created.map((policy) => policy.table).sort(),
    [
      "public.recurring_visitor_pass_events",
      "public.recurring_visitor_pass_photos",
      "public.recurring_visitor_passes",
    ],
  );
  // Every new policy is SELECT-only, tenant-scoped and admin-gated.
  for (const policy of created) {
    assert.match(policy.name, /_select_society_admin$/);
    assert.equal(policy.command, "select");
    assert.equal(policy.roles, "authenticated");
  }
  assert.equal(
    (MIGRATION_SQL.match(/public\.auth_app_role\(\) = 'society_admin'/g) ?? [])
      .length,
    created.length,
  );
  assert.equal(
    (MIGRATION_SQL.match(/society_id = public\.auth_society_id\(\)/g) ?? [])
      .length,
    created.length,
  );

  for (const grant of grants(MIGRATION_SQL)) {
    assert.equal(grant.privileges.includes("delete"), false);
    if (grant.role === "authenticated") {
      assert.deepEqual(grant.privileges, ["select"]);
    }
  }

  assert.match(
    MIGRATION_SQL,
    /alter table public\.recurring_visitor_passes enable row level security/,
  );
  assert.match(
    MIGRATION_SQL,
    /alter table public\.recurring_visitor_pass_credentials enable row level security/,
  );
  assert.match(
    MIGRATION_SQL,
    /alter table public\.recurring_visitor_pass_photos enable row level security/,
  );
  assert.match(
    MIGRATION_SQL,
    /alter table public\.recurring_visitor_pass_events enable row level security/,
  );
});

test("M04 migration makes the pass event timeline structurally append-only", () => {
  assert.match(
    MIGRATION_SQL,
    /create trigger recurring_visitor_pass_events_reject_update/,
  );
  assert.match(
    MIGRATION_SQL,
    /create trigger recurring_visitor_pass_events_reject_delete/,
  );
  assert.match(
    MIGRATION_SQL,
    /create trigger recurring_visitor_pass_events_reject_truncate/,
  );
  assert.match(
    MIGRATION_SQL,
    /recurring_visitor_pass_events is append-only/,
  );

  const eventGrants = grants(MIGRATION_SQL).filter(
    (grant) => grant.table === "public.recurring_visitor_pass_events",
  );
  for (const grant of eventGrants) {
    assert.equal(grant.privileges.includes("update"), false);
    assert.equal(grant.privileges.includes("delete"), false);
  }

  // Every event type the shared module knows about is accepted by the CHECK.
  for (const eventType of RECURRING_PASS_EVENT_TYPES) {
    assert.ok(
      MIGRATION_SQL.includes(`'${eventType}'`),
      `${eventType} missing from migration`,
    );
  }
});

test("M04 migration requires a nonblank reason to suspend or revoke", () => {
  // Suspending: status, actor, timestamp and reason must all be present.
  assert.match(
    MIGRATION_SQL,
    /status = 'suspended'\s*\n\s*and suspended_at is not null\s*\n\s*and suspended_by_app_user_id is not null\s*\n\s*and suspension_reason is not null\s*\n\s*and char_length\(trim\(suspension_reason\)\) > 0/,
  );
  // Not suspended: the suspension fields must all be cleared, so reactivation
  // cannot leave a stale reason behind.
  assert.match(
    MIGRATION_SQL,
    /status <> 'suspended'\s*\n\s*and suspended_at is null\s*\n\s*and suspended_by_app_user_id is null\s*\n\s*and suspension_reason is null/,
  );

  // Revoking a pass.
  assert.match(
    MIGRATION_SQL,
    /status = 'revoked'\s*\n\s*and revoked_at is not null\s*\n\s*and revoked_by_app_user_id is not null\s*\n\s*and revocation_reason is not null\s*\n\s*and char_length\(trim\(revocation_reason\)\) > 0/,
  );
  assert.match(
    MIGRATION_SQL,
    /status <> 'revoked'\s*\n\s*and revoked_at is null\s*\n\s*and revoked_by_app_user_id is null\s*\n\s*and revocation_reason is null/,
  );

  // Revoking a QR credential.
  assert.match(
    MIGRATION_SQL,
    /revoked_at is not null\s*\n\s*and revoked_by_app_user_id is not null\s*\n\s*and revocation_reason is not null\s*\n\s*and char_length\(trim\(revocation_reason\)\) > 0/,
  );

  // Both reasons stay length-bounded on top of being mandatory.
  for (const column of [
    "suspension_reason",
    "revocation_reason",
  ] as const) {
    assert.ok(
      MIGRATION_SQL.includes(`char_length(trim(${column})) <= 200`),
      `${column} is missing its length bound`,
    );
  }
});

test("M04 migration keeps lifecycle-blocking FKs off the append-only event table", () => {
  // A SET NULL action is an internal UPDATE, which the append-only trigger
  // rejects. That would break register-visitor's compensating rollback, so
  // these two columns are plain uuid audit metadata with no FK at all.
  assert.match(MIGRATION_SQL, /\n {2}actor_app_user_id uuid,\n/);
  assert.match(MIGRATION_SQL, /\n {2}visitor_entry_id uuid,\n/);
  assert.equal(
    /visitor_entry_id uuid references/i.test(MIGRATION_STATEMENTS),
    false,
  );
  assert.equal(
    /actor_app_user_id uuid references/i.test(MIGRATION_STATEMENTS),
    false,
  );
  // No cascade was substituted for the removed actions.
  assert.equal(/on delete cascade/i.test(MIGRATION_STATEMENTS), false);
  // The only remaining SET NULL is the pass resident_id, which mirrors
  // visitor_entries.resident_id and sits on a mutable table.
  assert.deepEqual(
    [...MIGRATION_STATEMENTS.matchAll(/(\w+) uuid references [^,]*on delete set null/gi)]
      .map((match) => match[1]),
    ["resident_id"],
  );

  // Integrity is still checked at INSERT time, which is the only moment that
  // matters for a row that can never be updated.
  assert.match(
    MIGRATION_SQL,
    /recurring_visitor_pass_events\.visitor_entry_id must belong to the same society/,
  );
  assert.match(
    MIGRATION_SQL,
    /recurring_visitor_pass_events\.actor_app_user_id must belong to the same society/,
  );
  assert.match(
    MIGRATION_SQL,
    /create trigger recurring_visitor_pass_events_enforce_same_society\nbefore insert on public\.recurring_visitor_pass_events/,
  );
});

test("M04 migration refuses to issue a QR credential for a revoked pass", () => {
  assert.match(
    MIGRATION_SQL,
    /if tg_op = 'INSERT' and v_pass_status = 'revoked' then/,
  );
  assert.match(
    MIGRATION_SQL,
    /cannot issue a QR credential for a revoked pass/,
  );

  // Suspension must not touch credentials: nothing in the migration writes to
  // the credential table, and the credential trigger never inspects
  // suspension or expiry.
  assert.equal(
    /update\s+public\.recurring_visitor_pass_credentials/i.test(
      MIGRATION_STATEMENTS,
    ),
    false,
  );
  assert.equal(
    /v_pass_status = 'suspended'/i.test(MIGRATION_STATEMENTS),
    false,
  );
  assert.equal(/v_pass_valid_until/i.test(MIGRATION_STATEMENTS), false);

  // Terminal credential revocation is unchanged.
  assert.match(
    MIGRATION_SQL,
    /a revoked QR credential is terminal and cannot be modified/,
  );
});

test("M04 migration binds pass photo object keys to their own society and pass", () => {
  assert.match(
    MIGRATION_SQL,
    /storage_path like society_id::text \|\| '\/recurring-passes\/' \|\| pass_id::text \|\| '\/_%'/,
  );
  assert.match(
    MIGRATION_SQL,
    /constraint recurring_visitor_pass_photos_storage_path_format check/,
  );
  // Pass/society membership is still enforced by the trigger.
  assert.match(
    MIGRATION_SQL,
    /recurring_visitor_pass_photos\.society_id must match pass society/,
  );
  // The private bucket architecture is untouched: no storage policy, bucket or
  // public-URL change anywhere in this migration.
  assert.equal(/storage\.objects/i.test(MIGRATION_STATEMENTS), false);
  assert.equal(/storage\.buckets/i.test(MIGRATION_STATEMENTS), false);
  assert.equal(/public\s*=\s*true/i.test(MIGRATION_STATEMENTS), false);
  assert.equal(/get_public_url|public_url/i.test(MIGRATION_STATEMENTS), false);
});

test("M04 migration redefines no existing function except the visitor_entries trigger", () => {
  const replaced = [
    ...MIGRATION_STATEMENTS.matchAll(
      /create or replace function\s+(public\.\w+)/gi,
    ),
  ].map((match) => match[1]);

  const preExisting = replaced.filter(
    (name) => !name.startsWith("public.enforce_recurring")
      && !name.startsWith("public.reject_recurring"),
  );
  assert.deepEqual(preExisting, ["public.enforce_visitor_entries_same_society"]);

  // Existing auth/audit helpers are never touched.
  for (const helper of [
    "auth_society_id",
    "auth_app_user_id",
    "auth_app_role",
    "write_audit_log",
    "set_updated_at",
  ]) {
    assert.equal(
      new RegExp(`create or replace function\\s+public\\.${helper}`, "i").test(
        MIGRATION_STATEMENTS,
      ),
      false,
      `${helper} must not be redefined`,
    );
  }
});

test("M04 migration integrates visitor_entries additively and preserves M03 rules", () => {
  assert.match(
    MIGRATION_SQL,
    /add column recurring_pass_id uuid references public\.recurring_visitor_passes \(id\) on delete restrict/,
  );
  assert.match(MIGRATION_SQL, /add column entry_method text/);
  assert.match(
    MIGRATION_SQL,
    /entry_method in \('RECURRING_QR', 'RECURRING_FALLBACK'\)/,
  );
  assert.match(
    MIGRATION_SQL,
    /constraint visitor_entries_recurring_pass_entry_method check/,
  );
  // Historical rows: both NULL must remain valid.
  assert.match(
    MIGRATION_SQL,
    /entry_method is null\s*\n\s*and recurring_pass_id is null/,
  );

  // Exactly two columns are added, and nothing else on visitor_entries moves.
  assert.deepEqual(
    [...MIGRATION_STATEMENTS.matchAll(/add column\s+(\w+)/gi)].map(
      (match) => match[1],
    ),
    ["recurring_pass_id", "entry_method"],
  );

  // verification_method / registration_mode keep their OTP-only meaning: the
  // migration documents the separation but never alters or assigns them.
  assert.equal(
    /alter column\s+(verification_method|registration_mode|otp_fallback_reason)/i.test(
      MIGRATION_STATEMENTS,
    ),
    false,
  );
  assert.equal(
    /(new|old)\.(verification_method|registration_mode|otp_fallback_reason)/i.test(
      MIGRATION_STATEMENTS,
    ),
    false,
  );

  // The replaced same-society function keeps every M03 branch and adds the pass check.
  assert.match(
    MIGRATION_SQL,
    /create or replace function public\.enforce_visitor_entries_same_society\(\)/,
  );
  assert.match(MIGRATION_SQL, /if new\.flat_id is not null then/);
  assert.match(
    MIGRATION_SQL,
    /visitor_entries\.resident_id must belong to the same society/,
  );
  assert.match(
    MIGRATION_SQL,
    /visitor_entries\.recurring_pass_id must belong to the same society/,
  );
  assert.match(MIGRATION_SQL, /if v_creator_role <> 'guard' then/);
  assert.match(MIGRATION_SQL, /visitor_entries must be created by a guard/);
  // Still a plain invoker-rights trigger function: no privilege escalation.
  assert.equal(/security\s+definer/i.test(MIGRATION_STATEMENTS), false);
  assert.equal(/set\s+search_path/i.test(MIGRATION_STATEMENTS), false);
});

test("M04 migration allowed-day and time-window rules match the shared module", () => {
  assert.match(MIGRATION_SQL, /allowed_days_of_week smallint\[\] not null/);
  assert.match(
    MIGRATION_SQL,
    /array_length\(allowed_days_of_week, 1\) between 1 and 7/,
  );
  assert.match(MIGRATION_SQL, /0 <= all \(allowed_days_of_week\)/);
  assert.match(MIGRATION_SQL, /6 >= all \(allowed_days_of_week\)/);
  assert.match(MIGRATION_SQL, /must not contain null entries/);
  assert.match(MIGRATION_SQL, /must not contain duplicate entries/);
  assert.match(
    MIGRATION_SQL,
    /constraint recurring_visitor_passes_time_window_pairing check/,
  );
  assert.match(
    MIGRATION_SQL,
    /allowed_entry_to_time > allowed_entry_from_time/,
  );
  // No unique constraint on mobile: one worker may serve several flats.
  assert.equal(
    /unique[^;]*\(society_id, visitor_mobile/i.test(MIGRATION_STATEMENTS),
    false,
  );
});

test("M04 migration keeps recurring visitor type codes aligned with shared constants", () => {
  for (const type of RECURRING_VISITOR_TYPES) {
    assert.ok(
      MIGRATION_SQL.includes(`'${type.code}'`),
      `${type.code} missing from migration`,
    );
  }
});

test("QR tokens are opaque NGSP1 secrets with CSPRNG hex and SHA-256 hashes", () => {
  const token = generateRecurringPassQrToken();
  assert.equal(token.length, RECURRING_PASS_QR_TOKEN_LENGTH);
  assert.ok(token.startsWith(RECURRING_PASS_QR_TOKEN_PREFIX));
  assert.equal(isRecurringPassQrToken(token), true);
  assert.equal(isRecurringPassTokenHash(token), false);

  const second = generateRecurringPassQrToken();
  assert.notEqual(token, second);

  const hash = createHash("sha256").update(token).digest("hex");
  assert.equal(hash.length, 64);
  assert.equal(isRecurringPassTokenHash(hash), true);
  assert.notEqual(hash, token);
  assert.equal(isRecurringPassQrToken(hash), false);

  assert.equal(isRecurringPassQrToken("NGSP1.not-hex"), false);
  assert.equal(isRecurringPassQrToken("pass-uuid-as-credential"), false);
});

test("required lifecycle reasons reject blank and oversized values", () => {
  assert.equal(parseRequiredRecurringPassReason("  ").ok, false);
  assert.equal(parseRequiredRecurringPassReason("Left the society").ok, true);

  const tooLong = "x".repeat(201);
  const oversized = parseRequiredRecurringPassReason(tooLong);
  assert.equal(oversized.ok, false);
});

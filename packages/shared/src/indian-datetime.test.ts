import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FROM_AFTER_TO_DATE_MESSAGE,
  INVALID_INDIAN_DATE_MESSAGE,
  canonicalizeIndianDateInput,
  formatIndianDate,
  formatIstTimestamp,
  getAdminVisitorDateRangeError,
  getIndianDateInputError,
  getIstCalendarParts,
  indianDateToIstDayEndUtcMs,
  indianDateToIstDayStartUtcMs,
  parseIndianDateInput,
} from "./admin-visitor-history.ts";

test("formatIstTimestamp converts a UTC instant to Asia/Kolkata DD-MM-YYYY, hh:mm:ss AM/PM", () => {
  assert.equal(
    formatIstTimestamp("2026-08-23T18:36:18.000Z"),
    "24-08-2026, 12:06:18 AM",
  );
  assert.equal(
    formatIstTimestamp("2026-08-24T06:30:00.000Z"),
    "24-08-2026, 12:00:00 PM",
  );
  assert.equal(formatIstTimestamp("2026-08-23T18:36:18.000Z").includes("/"), false);
  assert.equal(formatIstTimestamp("not-a-date"), "not-a-date");
});

test("IST midnight is the Asia/Kolkata calendar boundary, not UTC midnight", () => {
  const startOf24AugIst = indianDateToIstDayStartUtcMs({
    year: 2026,
    month: 8,
    day: 24,
  });
  const endOf24AugIst = indianDateToIstDayEndUtcMs({
    year: 2026,
    month: 8,
    day: 24,
  });

  assert.equal(startOf24AugIst, Date.parse("2026-08-23T18:30:00.000Z"));
  assert.equal(endOf24AugIst, Date.parse("2026-08-24T18:29:59.999Z"));

  const justBefore = Date.parse("2026-08-23T18:29:59.999Z");
  const exactlyMidnight = Date.parse("2026-08-23T18:30:00.000Z");

  assert.equal(justBefore < startOf24AugIst, true);
  assert.equal(exactlyMidnight >= startOf24AugIst, true);
  assert.equal(exactlyMidnight <= endOf24AugIst, true);
});

test("parseIndianDateInput accepts real DD-MM-YYYY dates and rejects invalid ones", () => {
  assert.deepEqual(parseIndianDateInput(""), { status: "empty" });
  assert.deepEqual(parseIndianDateInput("26-08-2026"), {
    status: "valid",
    parts: { year: 2026, month: 8, day: 26 },
  });
  assert.deepEqual(parseIndianDateInput("01-01-2026"), {
    status: "valid",
    parts: { year: 2026, month: 1, day: 1 },
  });
  assert.deepEqual(parseIndianDateInput("31-12-2026"), {
    status: "valid",
    parts: { year: 2026, month: 12, day: 31 },
  });
  assert.equal(parseIndianDateInput("31-02-2026").status, "invalid");
  assert.equal(parseIndianDateInput("32-08-2026").status, "invalid");
  assert.equal(parseIndianDateInput("00-08-2026").status, "invalid");
  assert.equal(parseIndianDateInput("26-13-2026").status, "invalid");
  assert.equal(parseIndianDateInput("2026-08-26").status, "invalid");
});

test("slash and hyphen day-month-year input are accepted and canonicalized to DD-MM-YYYY", () => {
  assert.deepEqual(parseIndianDateInput("25-07-2026"), {
    status: "valid",
    parts: { year: 2026, month: 7, day: 25 },
  });
  assert.deepEqual(parseIndianDateInput("25/07/2026"), {
    status: "valid",
    parts: { year: 2026, month: 7, day: 25 },
  });
  assert.equal(canonicalizeIndianDateInput("25-07-2026"), "25-07-2026");
  assert.equal(canonicalizeIndianDateInput("25/07/2026"), "25-07-2026");
  assert.equal(canonicalizeIndianDateInput("19/8/2026"), "19-08-2026");
  assert.equal(canonicalizeIndianDateInput("1/8/2026"), "01-08-2026");
  assert.equal(canonicalizeIndianDateInput("1/08/2026"), "01-08-2026");
  assert.equal(canonicalizeIndianDateInput("01/8/2026"), "01-08-2026");
  assert.equal(canonicalizeIndianDateInput("19/08/2026"), "19-08-2026");
  assert.equal(canonicalizeIndianDateInput("19-8-2026"), "19-08-2026");
  assert.equal(canonicalizeIndianDateInput("19-08-2026"), "19-08-2026");
  assert.equal(parseIndianDateInput("19-08-2026").status, "valid");
  assert.equal(parseIndianDateInput("31-02-2026").status, "invalid");
  assert.equal(parseIndianDateInput("31/02/2026").status, "invalid");
  assert.equal(canonicalizeIndianDateInput("31/02/2026"), "31/02/2026");
  assert.equal(parseIndianDateInput("2026-08-24").status, "invalid");
  assert.equal(parseIndianDateInput("25/07-2026").status, "invalid");
  assert.equal(parseIndianDateInput("25-07/2026").status, "invalid");
  assert.equal(getIndianDateInputError("31/02/2026"), INVALID_INDIAN_DATE_MESSAGE);
  assert.equal(getIndianDateInputError("25/07-2026"), INVALID_INDIAN_DATE_MESSAGE);
});

test("getIndianDateInputError waits for a complete value then rejects invalid input", () => {
  assert.equal(getIndianDateInputError(""), null);
  assert.equal(getIndianDateInputError("23-08"), null);
  assert.equal(getIndianDateInputError("26-08-2026"), null);
  assert.equal(getIndianDateInputError("25/07"), null);
  assert.equal(getIndianDateInputError("25/07/2026"), null);
  assert.equal(getIndianDateInputError("31-02-2026"), INVALID_INDIAN_DATE_MESSAGE);
  assert.equal(getIndianDateInputError("2026-08-24"), INVALID_INDIAN_DATE_MESSAGE);
});

test("from date cannot be after to date", () => {
  assert.equal(getAdminVisitorDateRangeError("26-08-2026", "23-08-2026"), FROM_AFTER_TO_DATE_MESSAGE);
  assert.equal(getAdminVisitorDateRangeError("23-08-2026", "24-08-2026"), null);
  assert.equal(getAdminVisitorDateRangeError("24-08-2026", "24-08-2026"), null);
  assert.equal(getAdminVisitorDateRangeError("31-02-2026", "24-08-2026"), null);
  assert.equal(getAdminVisitorDateRangeError("26/08/2026", "23/08/2026"), FROM_AFTER_TO_DATE_MESSAGE);
  assert.equal(getAdminVisitorDateRangeError("25/07/2026", "25-07-2026"), null);
});

test("calendar selection formats as DD-MM-YYYY", () => {
  assert.equal(
    formatIndianDate({ year: 2026, month: 8, day: 26 }),
    "26-08-2026",
  );
  const parts = getIstCalendarParts(new Date("2026-08-23T18:36:18.000Z"));
  assert.deepEqual(parts, { year: 2026, month: 8, day: 24 });
});

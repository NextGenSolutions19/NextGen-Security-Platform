import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMIN_CALENDAR_YEAR_LOOKAHEAD,
  ADMIN_CALENDAR_YEAR_LOOKBACK,
  INDIAN_CALENDAR_MONTH_LABELS,
  applyAdminCalendarMonth,
  applyAdminCalendarYear,
  buildAdminCalendarYearOptions,
  formatAdminCalendarMonthLabel,
  shiftAdminCalendarMonth,
} from "./admin-calendar-nav.ts";
import {
  formatIndianDate,
  getIndianDateInputError,
  parseIndianDateInput,
} from "./admin-visitor-history.ts";

test("month dropdown updates the viewed month without changing the year", () => {
  const view = applyAdminCalendarMonth({ year: 2026, month: 8 }, 3);
  assert.deepEqual(view, { year: 2026, month: 3 });
  assert.equal(formatAdminCalendarMonthLabel(view.month), "March");
  assert.equal(INDIAN_CALENDAR_MONTH_LABELS.length, 12);
  assert.equal(INDIAN_CALENDAR_MONTH_LABELS[0], "January");
  assert.equal(INDIAN_CALENDAR_MONTH_LABELS[11], "December");
});

test("year dropdown updates the viewed year without changing the month", () => {
  const view = applyAdminCalendarYear({ year: 2026, month: 8 }, 2024);
  assert.deepEqual(view, { year: 2024, month: 8 });
});

test("changing month then year then selecting a day still outputs DD-MM-YYYY", () => {
  const afterMonth = applyAdminCalendarMonth({ year: 2026, month: 8 }, 1);
  const afterYear = applyAdminCalendarYear(afterMonth, 2024);
  assert.equal(
    formatIndianDate({ year: afterYear.year, month: afterYear.month, day: 9 }),
    "09-01-2024",
  );
  assert.equal(formatIndianDate({ year: 2026, month: 8, day: 26 }), "26-08-2026");
  assert.equal(formatIndianDate({ year: 2026, month: 8, day: 26 }).includes("/"), false);
});

test("previous/next arrows wrap across years", () => {
  assert.deepEqual(shiftAdminCalendarMonth({ year: 2026, month: 1 }, -1), {
    year: 2025,
    month: 12,
  });
  assert.deepEqual(shiftAdminCalendarMonth({ year: 2026, month: 12 }, 1), {
    year: 2027,
    month: 1,
  });
});

test("year dropdown range is anchored and can include a viewed year outside the window", () => {
  const years = buildAdminCalendarYearOptions(2026);
  assert.equal(years[0], 2026 - ADMIN_CALENDAR_YEAR_LOOKBACK);
  assert.equal(years[years.length - 1], 2026 + ADMIN_CALENDAR_YEAR_LOOKAHEAD);
  assert.equal(years.includes(2026), true);
  assert.equal(years.includes(2010), false);

  const withHistory = buildAdminCalendarYearOptions(2026, 2010);
  assert.equal(withHistory.includes(2010), true);
  assert.equal(withHistory[0], 2010);
});

test("manual DD-MM-YYYY typing and validation remain unchanged", () => {
  assert.deepEqual(parseIndianDateInput("26-08-2026"), {
    status: "valid",
    parts: { year: 2026, month: 8, day: 26 },
  });
  assert.equal(parseIndianDateInput("31-02-2026").status, "invalid");
  assert.equal(parseIndianDateInput("2026-08-26").status, "invalid");
  assert.equal(getIndianDateInputError("31-02-2026"), "Enter a valid date in DD-MM-YYYY format.");
  assert.equal(getIndianDateInputError("2026-08-24"), "Enter a valid date in DD-MM-YYYY format.");
});

/**
 * Admin calendar month/year navigation.
 * Does not convert timestamps or filter visitor records.
 */

export const INDIAN_CALENDAR_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Inclusive years before the IST anchor year shown in the year dropdown. */
export const ADMIN_CALENDAR_YEAR_LOOKBACK = 15;

/** Inclusive years after the IST anchor year shown in the year dropdown. */
export const ADMIN_CALENDAR_YEAR_LOOKAHEAD = 2;

export interface AdminCalendarView {
  year: number;
  month: number;
}

export function isAdminCalendarMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

export function formatAdminCalendarMonthLabel(month: number): string {
  if (!isAdminCalendarMonth(month)) {
    return "";
  }

  return INDIAN_CALENDAR_MONTH_LABELS[month - 1] ?? "";
}

export function applyAdminCalendarMonth(
  view: AdminCalendarView,
  month: number,
): AdminCalendarView {
  if (!isAdminCalendarMonth(month)) {
    return view;
  }

  return { year: view.year, month };
}

export function applyAdminCalendarYear(
  view: AdminCalendarView,
  year: number,
): AdminCalendarView {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    return view;
  }

  return { year, month: view.month };
}

export function shiftAdminCalendarMonth(
  view: AdminCalendarView,
  delta: number,
): AdminCalendarView {
  const next = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
  };
}

/**
 * Year list around an IST “today” anchor. `viewedYear` is appended when the
 * current calendar view sits outside that window (e.g. arrow-nav into history).
 * Expand lookback/lookahead constants to widen the default window.
 */
export function buildAdminCalendarYearOptions(
  anchorYear: number,
  viewedYear?: number,
): number[] {
  const start = anchorYear - ADMIN_CALENDAR_YEAR_LOOKBACK;
  const end = anchorYear + ADMIN_CALENDAR_YEAR_LOOKAHEAD;
  const years: number[] = [];

  for (let year = start; year <= end; year += 1) {
    years.push(year);
  }

  if (
    viewedYear !== undefined &&
    Number.isInteger(viewedYear) &&
    (viewedYear < start || viewedYear > end)
  ) {
    years.push(viewedYear);
    years.sort((left, right) => left - right);
  }

  return years;
}

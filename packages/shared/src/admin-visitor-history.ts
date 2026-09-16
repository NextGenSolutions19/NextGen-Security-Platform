/**
 * Indian Standard Time display and DD-MM-YYYY input helpers, plus Admin
 * Visitor History filtering.
 *
 * Stored timestamps are UTC instants (timestamptz). Display and date-boundary
 * filtering convert those instants to Asia/Kolkata — they do not add +05:30
 * onto already-local values.
 */

import type { VisitorListItem } from "./visitor";
import { formatResidentFlatLabel } from "./resident-import-foundation.ts";
import { matchesNormalizedSearch } from "./search-match.ts";

export const ASIA_KOLKATA_TIMEZONE = "Asia/Kolkata";
export const INDIAN_DATE_PLACEHOLDER = "DD-MM-YYYY";
export const INVALID_INDIAN_DATE_MESSAGE =
  "Enter a valid date in DD-MM-YYYY format.";
export const FROM_AFTER_TO_DATE_MESSAGE = "From date cannot be after To date.";

/** Same separator twice: D/M/YYYY or DD-MM-YYYY. Mixed separators are rejected. */
const INDIAN_DATE_PATTERN = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/;

export interface IndianDateParts {
  year: number;
  month: number;
  day: number;
}

export type ParseIndianDateResult =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "valid"; parts: IndianDateParts };

function pad2(value: number | string): string {
  return String(value).padStart(2, "0");
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1000 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function readIstFormatParts(date: Date): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ASIA_KOLKATA_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }
  return parts;
}

function normalizeDayPeriod(value: string | undefined): "AM" | "PM" {
  const normalized = (value ?? "").replace(/[.\s]/g, "").toUpperCase();
  if (normalized.startsWith("A")) {
    return "AM";
  }
  return "PM";
}

export function formatIndianDate(parts: IndianDateParts): string {
  return `${pad2(parts.day)}-${pad2(parts.month)}-${parts.year}`;
}

/** Persist calendar dates as YYYY-MM-DD (Postgres `date` / IST calendar). */
export function isoDateFromIndianParts(parts: IndianDateParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function parseIndianDateInput(value: string): ParseIndianDateResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { status: "empty" };
  }

  const match = INDIAN_DATE_PATTERN.exec(trimmed);
  if (!match) {
    return { status: "invalid" };
  }

  const day = Number(match[1]);
  const month = Number(match[3]);
  const year = Number(match[4]);

  if (!isRealCalendarDate(year, month, day)) {
    return { status: "invalid" };
  }

  return { status: "valid", parts: { year, month, day } };
}

/**
 * Valid slash or hyphen input is shown as DD-MM-YYYY. Incomplete or invalid
 * typing is left unchanged.
 */
export function canonicalizeIndianDateInput(value: string): string {
  const parsed = parseIndianDateInput(value);
  if (parsed.status !== "valid") {
    return value;
  }

  return formatIndianDate(parsed.parts);
}

/**
 * Incomplete typing is not treated as an error. A complete but invalid value
 * (wrong format, ISO YYYY-MM-DD, or impossible calendar day) is rejected.
 */
export function getIndianDateInputError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = parseIndianDateInput(trimmed);
  if (parsed.status === "valid") {
    return null;
  }

  if (trimmed.length < INDIAN_DATE_PLACEHOLDER.length) {
    return null;
  }

  return INVALID_INDIAN_DATE_MESSAGE;
}

export function compareIndianDates(
  left: IndianDateParts,
  right: IndianDateParts,
): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }
  if (left.month !== right.month) {
    return left.month - right.month;
  }
  return left.day - right.day;
}

export function getAdminVisitorDateRangeError(
  fromDate: string,
  toDate: string,
): string | null {
  const from = parseIndianDateInput(fromDate);
  const to = parseIndianDateInput(toDate);
  if (from.status !== "valid" || to.status !== "valid") {
    return null;
  }

  if (compareIndianDates(from.parts, to.parts) > 0) {
    return FROM_AFTER_TO_DATE_MESSAGE;
  }

  return null;
}

export function indianDateToIstDayStartUtcMs(parts: IndianDateParts): number {
  return new Date(
    `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T00:00:00+05:30`,
  ).getTime();
}

export function indianDateToIstDayEndUtcMs(parts: IndianDateParts): number {
  return new Date(
    `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T23:59:59.999+05:30`,
  ).getTime();
}

export function getIstCalendarParts(instant: Date = new Date()): IndianDateParts {
  const parts = readIstFormatParts(instant);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

/**
 * Convert a stored UTC instant to Admin display:
 * DD-MM-YYYY, hh:mm:ss AM/PM in Asia/Kolkata.
 */
export function formatIstTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  const parts = readIstFormatParts(date);
  const day = parts.day;
  const month = parts.month;
  const year = parts.year;
  const hour = pad2(parts.hour ?? "");
  const minute = pad2(parts.minute ?? "");
  const second = pad2(parts.second ?? "");

  if (!day || !month || !year || !parts.hour || !parts.minute || !parts.second) {
    return isoTimestamp;
  }

  return `${day}-${month}-${year}, ${hour}:${minute}:${second} ${normalizeDayPeriod(parts.dayPeriod)}`;
}

export function formatIstTimestampOrDash(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return "—";
  }

  return formatIstTimestamp(isoTimestamp);
}

export const ADMIN_VISITOR_STATUS_FILTERS = [
  "all",
  "checked_in",
  "checked_out",
] as const;

export type AdminVisitorStatusFilter =
  (typeof ADMIN_VISITOR_STATUS_FILTERS)[number];

export const ADMIN_VISITOR_PURPOSE_ALL = "all";

export const PHOTO_UNAVAILABLE_FOR_VISIT =
  "Photo unavailable for this visit.";

export const ADMIN_VISITOR_PHOTO_PLACEHOLDER = PHOTO_UNAVAILABLE_FOR_VISIT;

export interface AdminVisitorHistoryFilterInput {
  search: string;
  status: AdminVisitorStatusFilter;
  purpose: string;
  fromDate: string;
  toDate: string;
}

export function formatAdminVisitorCheckInAt(checkInAt: string): string {
  return formatIstTimestamp(checkInAt);
}

export function formatAdminVisitorCheckOutAt(checkOutAt: string | null): string {
  return formatIstTimestampOrDash(checkOutAt);
}

export function formatAdminVisitorStatusFilter(
  filter: AdminVisitorStatusFilter,
): string {
  if (filter === "checked_in") {
    return "Checked In";
  }
  if (filter === "checked_out") {
    return "Checked Out";
  }
  return "All";
}

export function visitorEntryHasPhoto(item: {
  visitorPhotoUploadId: string | null;
}): boolean {
  return Boolean(item.visitorPhotoUploadId);
}

export function parseAdminVisitorIstDate(
  value: string,
  endOfDay: boolean,
): number | null {
  const parsed = parseIndianDateInput(value);
  if (parsed.status !== "valid") {
    return null;
  }

  return endOfDay
    ? indianDateToIstDayEndUtcMs(parsed.parts)
    : indianDateToIstDayStartUtcMs(parsed.parts);
}

export function collectAdminVisitorPurposeOptions(
  items: readonly VisitorListItem[],
): string[] {
  const labels = new Set<string>();
  for (const item of items) {
    const label = (item.purposeLabel || item.purpose).trim();
    if (label) {
      labels.add(label);
    }
  }

  return [...labels].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function matchesSearch(item: VisitorListItem, query: string): boolean {
  return matchesNormalizedSearch(query, {
    identifiers: [
      item.visitorMobile,
      item.flatNumber,
      item.vehicleNumber,
      item.destinationText,
    ],
    locations: [
      formatResidentFlatLabel(item.wingBuilding, item.flatNumber),
      item.wingBuilding,
      item.flatNumber,
      item.destinationText,
    ],
    phrases: [
      item.visitorName,
      item.purpose,
      item.purposeLabel,
      item.customPurposeText,
      item.residentName,
      item.wingBuilding,
    ],
  });
}

function matchesDateRange(item: VisitorListItem, fromDate: string, toDate: string): boolean {
  const from = parseIndianDateInput(fromDate);
  const to = parseIndianDateInput(toDate);

  if (
    from.status === "valid" &&
    to.status === "valid" &&
    compareIndianDates(from.parts, to.parts) > 0
  ) {
    return true;
  }

  const fromTime = parseAdminVisitorIstDate(fromDate, false);
  const toTime = parseAdminVisitorIstDate(toDate, true);
  const checkInTime = new Date(item.checkInAt).getTime();

  if (Number.isNaN(checkInTime)) {
    return false;
  }

  if (fromTime !== null && checkInTime < fromTime) {
    return false;
  }

  if (toTime !== null && checkInTime > toTime) {
    return false;
  }

  return true;
}

export function filterAdminVisitorHistoryItems(
  items: readonly VisitorListItem[],
  input: AdminVisitorHistoryFilterInput,
): VisitorListItem[] {
  const purpose = input.purpose.trim();

  return items.filter((item) => {
    if (input.status !== "all" && item.status !== input.status) {
      return false;
    }

    if (
      purpose &&
      purpose !== ADMIN_VISITOR_PURPOSE_ALL &&
      (item.purposeLabel || item.purpose).trim() !== purpose
    ) {
      return false;
    }

    if (!matchesDateRange(item, input.fromDate, input.toDate)) {
      return false;
    }

    return matchesSearch(item, input.search);
  });
}

export function sortAdminVisitorHistoryNewestFirst(
  items: readonly VisitorListItem[],
): VisitorListItem[] {
  return [...items].sort((left, right) => {
    const rightTime = new Date(right.checkInAt).getTime();
    const leftTime = new Date(left.checkInAt).getTime();
    return rightTime - leftTime;
  });
}

/**
 * Admin recurring visitor pass list/read helpers.
 *
 * Effective status MUST be derived through resolveRecurringPassDisplayState.
 * Do not persist or filter on a stored "expired" value.
 */

import { resolveVisitorDestinationLabel } from "./visitor-destination.ts";
import {
  RECURRING_VISITOR_PASS_STATE_LABELS,
  RECURRING_VISITOR_TYPES,
  canReactivateRecurringPass,
  formatAllowedDaysOfWeek,
  isRecurringVisitorTypeCode,
  resolveRecurringPassDisplayState,
  timeToSeconds,
  type RecurringVisitorPassDisplayState,
  type RecurringVisitorPassStatus,
  type RecurringVisitorTypeCode,
} from "./recurring-visitor-pass.ts";

export interface AdminRecurringVisitorPassListItem {
  id: string;
  societyId: string;
  visitorName: string;
  visitorMobile: string;
  visitorTypeCode: RecurringVisitorTypeCode;
  visitorTypeLabel: string;
  flatId: string | null;
  flatNumber: string | null;
  wingBuilding: string | null;
  residentId: string | null;
  residentName: string | null;
  destinationText: string | null;
  destinationLabel: string;
  vehicleNumber: string | null;
  /** Inclusive IST calendar date, YYYY-MM-DD. */
  validFrom: string;
  /** Inclusive IST calendar date, YYYY-MM-DD. */
  validUntil: string;
  allowedDaysOfWeek: readonly number[];
  allowedEntryFromTime: string | null;
  allowedEntryToTime: string | null;
  status: RecurringVisitorPassStatus;
  notes: string | null;
  createdAt: string;
}

export const ADMIN_RECURRING_PASS_STATUS_FILTERS = [
  "all",
  "active",
  "suspended",
  "expired",
  "revoked",
] as const;

export type AdminRecurringPassStatusFilter =
  (typeof ADMIN_RECURRING_PASS_STATUS_FILTERS)[number];

export const ADMIN_RECURRING_PASS_TYPE_FILTER_ALL = "all" as const;

export type AdminRecurringPassTypeFilter =
  | typeof ADMIN_RECURRING_PASS_TYPE_FILTER_ALL
  | RecurringVisitorTypeCode;

export const ADMIN_RECURRING_PASS_TYPE_FILTERS: readonly AdminRecurringPassTypeFilter[] =
  [ADMIN_RECURRING_PASS_TYPE_FILTER_ALL, ...RECURRING_VISITOR_TYPES.map((type) => type.code)];

export interface AdminRecurringPassFilterInput {
  search?: string;
  status?: AdminRecurringPassStatusFilter;
  visitorType?: AdminRecurringPassTypeFilter;
  at?: Date;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function compactSearchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveAdminRecurringPassDestinationLabel(item: {
  flatId?: string | null;
  flatNumber?: string | null;
  wingBuilding?: string | null;
  destinationText?: string | null;
}): string {
  return resolveVisitorDestinationLabel(item);
}

export function resolveAdminRecurringPassEffectiveStatus(
  item: Pick<AdminRecurringVisitorPassListItem, "status" | "validFrom" | "validUntil">,
  at: Date = new Date(),
): RecurringVisitorPassDisplayState {
  return resolveRecurringPassDisplayState(
    {
      status: item.status,
      validFrom: item.validFrom,
      validUntil: item.validUntil,
    },
    at,
  );
}

/** Admin chip/badge text: ACTIVE, SUSPENDED, EXPIRED, REVOKED. */
export function formatRecurringPassEffectiveStatus(
  item: Pick<AdminRecurringVisitorPassListItem, "status" | "validFrom" | "validUntil">,
  at: Date = new Date(),
): string {
  return RECURRING_VISITOR_PASS_STATE_LABELS[
    resolveAdminRecurringPassEffectiveStatus(item, at)
  ].toUpperCase();
}

export function formatAdminRecurringPassStatusFilter(
  filter: AdminRecurringPassStatusFilter,
): string {
  if (filter === "all") {
    return "All";
  }
  return RECURRING_VISITOR_PASS_STATE_LABELS[filter].toUpperCase();
}

export function formatAdminRecurringPassTypeFilter(
  filter: AdminRecurringPassTypeFilter,
): string {
  if (filter === ADMIN_RECURRING_PASS_TYPE_FILTER_ALL) {
    return "All Types";
  }
  return (
    RECURRING_VISITOR_TYPES.find((type) => type.code === filter)?.label ?? filter
  );
}

/** DATE columns arrive as YYYY-MM-DD and are displayed as DD-MM-YYYY. */
export function formatRecurringPassCalendarDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    return isoDate;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatRecurringPassClockTime(value: string): string {
  const seconds = timeToSeconds(value);
  if (seconds === null) {
    return value;
  }
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Null when no window is configured, so list cards can omit the row. */
export function formatRecurringPassAllowedTime(
  from: string | null,
  to: string | null,
): string | null {
  if (!from || !to) {
    return null;
  }
  return `${formatRecurringPassClockTime(from)} – ${formatRecurringPassClockTime(to)}`;
}

export function formatRecurringPassAllowedDaysSummary(
  days: readonly number[],
): string {
  return formatAllowedDaysOfWeek(days) || "—";
}

function matchesSearch(
  item: AdminRecurringVisitorPassListItem,
  search: string,
): boolean {
  const normalizedQuery = search.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const compactQuery = compactSearchValue(normalizedQuery);
  const haystack = [
    item.visitorName,
    item.visitorMobile,
    item.visitorTypeLabel,
    item.visitorTypeCode,
    item.destinationLabel,
    item.destinationText ?? "",
    item.flatNumber ?? "",
    item.wingBuilding ?? "",
    item.residentName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  if (!compactQuery) {
    return false;
  }

  return [
    item.visitorMobile,
    item.flatNumber ?? "",
    item.destinationText ?? "",
    item.destinationLabel,
    item.visitorName,
  ].some((value) => compactSearchValue(value).includes(compactQuery));
}

export function filterAdminRecurringVisitorPasses(
  items: readonly AdminRecurringVisitorPassListItem[],
  input: AdminRecurringPassFilterInput = {},
): AdminRecurringVisitorPassListItem[] {
  const statusFilter = input.status ?? "all";
  const typeFilter = input.visitorType ?? ADMIN_RECURRING_PASS_TYPE_FILTER_ALL;
  const at = input.at ?? new Date();

  return items.filter((item) => {
    if (
      statusFilter !== "all" &&
      resolveAdminRecurringPassEffectiveStatus(item, at) !== statusFilter
    ) {
      return false;
    }

    if (
      typeFilter !== ADMIN_RECURRING_PASS_TYPE_FILTER_ALL &&
      item.visitorTypeCode !== typeFilter
    ) {
      return false;
    }

    return matchesSearch(item, input.search ?? "");
  });
}

export function sortAdminRecurringVisitorPasses(
  items: readonly AdminRecurringVisitorPassListItem[],
): AdminRecurringVisitorPassListItem[] {
  return [...items].sort((left, right) => {
    const nameCompare = left.visitorName.localeCompare(right.visitorName, undefined, {
      sensitivity: "base",
    });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return right.validUntil.localeCompare(left.validUntil);
  });
}

export function isAdminRecurringPassTypeFilter(
  value: string,
): value is AdminRecurringPassTypeFilter {
  return (
    value === ADMIN_RECURRING_PASS_TYPE_FILTER_ALL ||
    isRecurringVisitorTypeCode(value)
  );
}

export const RECURRING_PASS_QR_SCREEN_TITLE = "Recurring Visitor QR Pass";
export const RECURRING_PASS_QR_ASSIGNMENT_WARNING =
  "This QR is assigned to this recurring visitor. Do not share it with others.";
export const RECURRING_PASS_QR_CANNOT_RECOVER_MESSAGE =
  "The issued QR cannot be recovered after leaving this screen. Generate a new QR to replace the previous one.";
export const RECURRING_PASS_REVOKE_WARNING =
  "Revocation is permanent. This pass cannot be reactivated.";
export const RECURRING_PASS_SUSPENDED_QR_WARNING =
  "This pass is SUSPENDED. The QR is shown for administration only and does not currently grant entry.";

export interface RecurringPassAdminActions {
  issueQr: boolean;
  replaceQr: boolean;
  viewIssuedQr: boolean;
  editSchedule: boolean;
  suspend: boolean;
  reactivate: boolean;
  revoke: boolean;
  renew: boolean;
}

/**
 * Details-screen action visibility from effective status + credential presence.
 * Expired is derived. Revoked is read-only. QR may exist while suspended, but
 * the UI must never imply it currently grants entry.
 */
export function resolveRecurringPassAdminActions(
  pass: Pick<
    AdminRecurringVisitorPassListItem,
    "status" | "validFrom" | "validUntil"
  > & { hasActiveCredential: boolean; hasSessionQrToken?: boolean },
  at: Date = new Date(),
): RecurringPassAdminActions {
  if (pass.status === "revoked") {
    return {
      issueQr: false,
      replaceQr: false,
      viewIssuedQr: false,
      editSchedule: false,
      suspend: false,
      reactivate: false,
      revoke: false,
      renew: false,
    };
  }

  const display = resolveRecurringPassDisplayState(pass, at);
  const expired = display === "expired";
  const active = display === "active";
  const suspended = display === "suspended";
  const qrEligible = (active || suspended) && !expired;

  return {
    issueQr: qrEligible && !pass.hasActiveCredential,
    replaceQr: qrEligible && pass.hasActiveCredential,
    viewIssuedQr: Boolean(pass.hasSessionQrToken && pass.hasActiveCredential),
    editSchedule: true,
    suspend: active,
    reactivate: canReactivateRecurringPass(pass, at).ok,
    revoke: true,
    renew: true,
  };
}

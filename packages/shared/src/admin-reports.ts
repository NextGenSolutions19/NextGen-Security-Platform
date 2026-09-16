import {
  filterAdminVisitorHistoryItems,
  formatAdminVisitorCheckInAt,
  formatIndianDate,
  getIstCalendarParts,
  type AdminVisitorHistoryFilterInput,
} from "./admin-visitor-history.ts";
import {
  resolveAdminReportPurposeSummaryLabel,
  resolveVisitRecurringVisitorTypeLabel,
  resolveVisitorEntryTypeLabel,
} from "./recurring-visitor-pass.ts";
import type { VisitorListItem } from "./visitor.ts";
import { resolveVisitorDestinationLabelForCsvExport } from "./visitor-destination.ts";

export const ADMIN_REPORTS_LOAD_FAILED_MESSAGE = "Unable to load reports.";
export const ADMIN_REPORT_FILTER_ALL = "all";

export interface AdminReportFilterInput extends AdminVisitorHistoryFilterInput {
  wingBuilding: string;
  flatNumber: string;
  residentName: string;
  guardId: string;
}

export interface AdminReportGuardOption {
  id: string;
  loginId: string;
  name: string | null;
}

export interface AdminReportSummary {
  totalVisits: number;
  currentlyIn: number;
  checkedOut: number;
  purposeCounts: Array<{ purpose: string; count: number }>;
}

export function formatAdminReportStatus(status: VisitorListItem["status"]): string {
  return status === "checked_in" ? "IN" : "OUT";
}

export function collectAdminReportWingOptions(
  items: readonly VisitorListItem[],
): string[] {
  const values = new Set<string>();
  for (const item of items) {
    const wing = item.wingBuilding?.trim();
    if (wing) {
      values.add(wing);
    }
  }
  return [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function collectAdminReportFlatOptions(
  items: readonly VisitorListItem[],
): string[] {
  const values = new Set<string>();
  for (const item of items) {
    const flat = item.flatNumber.trim();
    if (flat) {
      values.add(flat);
    }
  }
  return [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

export function collectAdminReportResidentOptions(
  items: readonly VisitorListItem[],
): string[] {
  const values = new Set<string>();
  for (const item of items) {
    const name = item.residentName?.trim();
    if (name) {
      values.add(name);
    }
  }
  return [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function filterAdminReportItems(
  items: readonly VisitorListItem[],
  input: AdminReportFilterInput,
): VisitorListItem[] {
  const base = filterAdminVisitorHistoryItems(items, {
    search: input.search,
    status: input.status,
    purpose: input.purpose,
    fromDate: input.fromDate,
    toDate: input.toDate,
  });

  const wing = input.wingBuilding.trim();
  const flat = input.flatNumber.trim();
  const resident = input.residentName.trim();
  const guardId = input.guardId.trim();

  return base.filter((item) => {
    if (
      wing &&
      wing !== ADMIN_REPORT_FILTER_ALL &&
      (item.wingBuilding ?? "").trim() !== wing
    ) {
      return false;
    }
    if (flat && flat !== ADMIN_REPORT_FILTER_ALL && item.flatNumber.trim() !== flat) {
      return false;
    }
    if (
      resident &&
      resident !== ADMIN_REPORT_FILTER_ALL &&
      (item.residentName ?? "").trim() !== resident
    ) {
      return false;
    }
    if (
      guardId &&
      guardId !== ADMIN_REPORT_FILTER_ALL &&
      item.createdByAppUserId !== guardId
    ) {
      return false;
    }
    return true;
  });
}

export function summarizeAdminReportItems(
  items: readonly VisitorListItem[],
): AdminReportSummary {
  const purposeMap = new Map<string, number>();
  let currentlyIn = 0;
  let checkedOut = 0;

  for (const item of items) {
    if (item.status === "checked_in") {
      currentlyIn += 1;
    } else {
      checkedOut += 1;
    }
    const purpose =
      resolveAdminReportPurposeSummaryLabel(item).trim() || "Other";
    purposeMap.set(purpose, (purposeMap.get(purpose) ?? 0) + 1);
  }

  const purposeCounts = [...purposeMap.entries()]
    .map(([purpose, count]) => ({ purpose, count }))
    .sort((left, right) => right.count - left.count || left.purpose.localeCompare(right.purpose));

  return {
    totalVisits: items.length,
    currentlyIn,
    checkedOut,
    purposeCounts,
  };
}

function csvCell(value: string): string {
  const neutralized = neutralizeCsvFormula(value);
  if (/[",\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function neutralizeCsvFormula(value: string): string {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function buildAdminReportCsv(
  items: readonly VisitorListItem[],
  guards: readonly AdminReportGuardOption[],
): string {
  const header = [
    "Status",
    "Visitor Mobile",
    "Visitor Name",
    "Vehicle Number",
    "No. of Visitors",
    "Purpose",
    "Visitor Type",
    "Building/Wing",
    "Flat",
    "Resident",
    "Checked In (IST)",
    "Checked Out (IST)",
    "Guard",
  ];
  const rows = items.map((item) => {
    return [
      formatAdminReportStatus(item.status),
      item.visitorMobile,
      item.visitorName?.trim() ?? "",
      item.vehicleNumber?.trim() ?? "",
      item.visitorCount,
      resolveVisitorEntryTypeLabel(item),
      resolveVisitRecurringVisitorTypeLabel(item) ?? "",
      item.wingBuilding ?? "",
      resolveVisitorDestinationLabelForCsvExport(item),
      item.residentName ?? "",
      formatAdminVisitorCheckInAt(item.checkInAt),
      item.checkOutAt ? formatAdminVisitorCheckInAt(item.checkOutAt) : "",
      resolveAdminReportGuardLabel(item.createdByAppUserId, guards),
    ].map((value) => csvCell(String(value)));
  });
  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export function buildAdminReportCsvFilename(now: Date = new Date()): string {
  return `visitor-report-${formatIndianDate(getIstCalendarParts(now))}.csv`;
}

export function resolveAdminVisitorRecordedBy(
  createdByAppUserId: string,
  guards: readonly AdminReportGuardOption[],
): { guardId: string; guardName: string | null } {
  const guard = guards.find((item) => item.id === createdByAppUserId);
  const loginId = guard?.loginId?.trim();
  const name = guard?.name?.trim();
  return {
    guardId: loginId || "Guard",
    guardName: name || null,
  };
}

export function resolveAdminReportGuardLabel(
  createdByAppUserId: string,
  guards: readonly AdminReportGuardOption[],
): string {
  const guard = guards.find((item) => item.id === createdByAppUserId);
  const name = guard?.name?.trim();
  if (name) {
    return name;
  }
  const loginId = guard?.loginId?.trim();
  if (loginId) {
    return loginId;
  }
  return "Guard";
}

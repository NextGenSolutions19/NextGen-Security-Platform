import {
  formatVisitPurposeSummary,
} from "./recurring-visitor-pass.ts";
import type { VisitorEntryType } from "./visitor-entry-type";
import type {
  VisitorRegistrationMode,
  VisitorVerificationMethod,
} from "./visitor-verification";

export const FREQUENT_VISITOR_MIN_VISITS = 2;

export interface VisitorVisitRecord {
  id: string;
  visitorName?: string | null;
  visitorMobile: string;
  purpose: string;
  purposeLabel: string;
  purposeCode?: string | null;
  customPurposeText?: string | null;
  flatNumber: string;
  destinationText?: string | null;
  residentName: string | null;
  checkInAt: string;
  entryType: VisitorEntryType;
  visitorCount: number;
}

export interface FrequentVisitorHistoryVisit {
  id: string;
  visitorName: string | null;
  visitorMobile: string;
  purpose: string;
  purposeLabel: string;
  purposeCode?: string | null;
  customPurposeText: string | null;
  flatNumber: string;
  destinationText?: string | null;
  residentName: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  status: "checked_in" | "checked_out";
  entryType: VisitorEntryType;
  visitorCount: number;
  verificationMethod: VisitorVerificationMethod;
  registrationMode: VisitorRegistrationMode;
  vehicleNumber: string | null;
  notes: string | null;
  idType: string | null;
  idNumber: string | null;
}

export interface FrequentVisitorItem {
  visitorMobile: string;
  visitCount: number;
  lastVisitAt: string;
  lastPurpose: string;
  lastFlatNumber: string;
  lastVisitorName: string | null;
  lastResidentName: string | null;
  lastVisitorEntryId: string;
  lastEntryType: VisitorEntryType;
  lastPartyCount: number;
  searchPurposes: string[];
  searchFlats: string[];
}

export function normalizeFrequentVisitorMobile(mobile: string): string {
  return mobile.trim();
}

export function buildFrequentVisitorDetailsPath(mobile: string): string {
  return `/(guard)/frequent-visitors/${encodeURIComponent(
    normalizeFrequentVisitorMobile(mobile),
  )}`;
}

function visitTimestamp(checkInAt: string): number {
  const value = Date.parse(checkInAt);
  return Number.isNaN(value) ? 0 : value;
}

function isNewerVisit(
  candidate: VisitorVisitRecord,
  current: VisitorVisitRecord,
): boolean {
  return visitTimestamp(candidate.checkInAt) > visitTimestamp(current.checkInAt);
}

function addUniqueValue(values: Set<string>, value: string | null | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    values.add(trimmed);
  }
}

function compareNewestFirst(
  leftCheckInAt: string,
  rightCheckInAt: string,
): number {
  return visitTimestamp(rightCheckInAt) - visitTimestamp(leftCheckInAt);
}

export function deriveFrequentVisitors(
  records: VisitorVisitRecord[],
): FrequentVisitorItem[] {
  const latestByMobile = new Map<string, VisitorVisitRecord>();
  const countByMobile = new Map<string, number>();
  const purposesByMobile = new Map<string, Set<string>>();
  const flatsByMobile = new Map<string, Set<string>>();

  for (const record of records) {
    const visitorMobile = normalizeFrequentVisitorMobile(record.visitorMobile);
    if (!visitorMobile) {
      continue;
    }

    countByMobile.set(visitorMobile, (countByMobile.get(visitorMobile) ?? 0) + 1);

    const purposes = purposesByMobile.get(visitorMobile) ?? new Set<string>();
    addUniqueValue(purposes, record.purposeLabel);
    addUniqueValue(purposes, record.purpose);
    purposesByMobile.set(visitorMobile, purposes);

    const flats = flatsByMobile.get(visitorMobile) ?? new Set<string>();
    addUniqueValue(flats, record.flatNumber);
    flatsByMobile.set(visitorMobile, flats);

    const currentLatest = latestByMobile.get(visitorMobile);
    if (!currentLatest || isNewerVisit(record, currentLatest)) {
      latestByMobile.set(visitorMobile, {
        ...record,
        visitorMobile,
      });
    }
  }

  const frequentVisitors: FrequentVisitorItem[] = [];

  for (const [visitorMobile, visitCount] of countByMobile) {
    if (visitCount < FREQUENT_VISITOR_MIN_VISITS) {
      continue;
    }

    const latest = latestByMobile.get(visitorMobile);
    if (!latest) {
      continue;
    }

    frequentVisitors.push({
      visitorMobile,
      visitCount,
      lastVisitAt: latest.checkInAt,
      lastPurpose: formatVisitPurposeSummary(latest),
      lastFlatNumber: latest.flatNumber,
      lastVisitorName: latest.visitorName?.trim() ? latest.visitorName.trim() : null,
      lastResidentName: latest.residentName,
      lastVisitorEntryId: latest.id,
      lastEntryType: latest.entryType,
      lastPartyCount: latest.visitorCount,
      searchPurposes: [...(purposesByMobile.get(visitorMobile) ?? new Set<string>())],
      searchFlats: [...(flatsByMobile.get(visitorMobile) ?? new Set<string>())],
    });
  }

  return frequentVisitors.sort((left, right) => {
    const timeCompare = compareNewestFirst(left.lastVisitAt, right.lastVisitAt);
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return left.visitorMobile.localeCompare(right.visitorMobile);
  });
}

export function selectFrequentVisitorHistory<
  T extends { visitorMobile: string; checkInAt: string },
>(records: T[], routeMobile: string): T[] {
  const lookupMobile = normalizeFrequentVisitorMobile(routeMobile);
  if (!lookupMobile) {
    return [];
  }

  return records
    .filter(
      (record) =>
        normalizeFrequentVisitorMobile(record.visitorMobile) === lookupMobile,
    )
    .sort((left, right) => compareNewestFirst(left.checkInAt, right.checkInAt));
}

function compactSearchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function filterFrequentVisitors(
  items: FrequentVisitorItem[],
  query: string,
): FrequentVisitorItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  const compactQuery = compactSearchValue(normalizedQuery);

  return items.filter((item) => {
    const searchable = [
      item.visitorMobile,
      item.lastVisitorName ?? "",
      item.lastPurpose,
      item.lastFlatNumber,
      ...item.searchPurposes,
      ...item.searchFlats,
    ]
      .join(" ")
      .toLowerCase();

    if (searchable.includes(normalizedQuery)) {
      return true;
    }

    if (!compactQuery) {
      return false;
    }

    const compactSearchable = [
      item.visitorMobile,
      item.lastFlatNumber,
      ...item.searchFlats,
    ]
      .map(compactSearchValue)
      .join(" ");

    return compactSearchable.includes(compactQuery);
  });
}

export function formatFrequentVisitCount(visitCount: number): string {
  return visitCount === 1 ? "1 visit" : `${visitCount} visits`;
}

export function formatFrequentVisitorPartyHint(
  item: Pick<FrequentVisitorItem, "lastEntryType" | "lastPartyCount">,
): string | null {
  if (item.lastEntryType !== "group") {
    return null;
  }

  const partyCount =
    item.lastPartyCount === 1 ? "1 Visitor" : `${item.lastPartyCount} Visitors`;
  return `Group • ${partyCount}`;
}

export function formatFrequentVisitorEntryType(
  entryType: VisitorEntryType,
): string {
  return entryType === "group" ? "Group Visitor" : "Individual";
}

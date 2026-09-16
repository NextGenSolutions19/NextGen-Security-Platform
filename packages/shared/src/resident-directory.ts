import { formatResidentFlatLabel } from "./resident-import-foundation.ts";
import { matchesNormalizedSearch } from "./search-match.ts";

export interface ResidentDirectoryItem {
  id: string;
  residentId: string;
  flatId: string;
  flatNumber: string;
  residentName: string;
  mobile: string | null;
  wingBuilding?: string | null;
}

export function formatResidentMobile(mobile: string | null): string {
  const trimmed = mobile?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "—";
}

export function filterResidentDirectoryItems<T extends ResidentDirectoryItem>(
  items: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [...items];
  }

  return items.filter((item) =>
    matchesNormalizedSearch(normalizedQuery, {
      identifiers: [item.flatNumber, item.mobile],
      locations: [
        formatResidentFlatLabel(item.wingBuilding, item.flatNumber),
        item.wingBuilding,
        item.flatNumber,
      ],
      phrases: [item.residentName, item.wingBuilding],
    }),
  );
}

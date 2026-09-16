/**
 * Visitor entry classification for single vs group check-ins.
 *
 * V1 stores one visitor_entries row per group with a visitor_count.
 * Future member-level data (names, photos, partial checkout) can attach
 * to this row without replacing the registration/checkout lifecycle.
 */

export const VISITOR_ENTRY_TYPES = ["single", "group"] as const;

export type VisitorEntryType = (typeof VISITOR_ENTRY_TYPES)[number];

export const DEFAULT_VISITOR_ENTRY_TYPE: VisitorEntryType = "single";
export const DEFAULT_VISITOR_COUNT = 1;
export const GROUP_VISITOR_MIN_COUNT = 2;
/** Keep in sync with visitor_entries_visitor_count_max in migrations. */
export const GROUP_VISITOR_MAX_COUNT = 50;

export const VISITOR_ENTRY_TYPE_LABELS: Record<VisitorEntryType, string> = {
  single: "Single Visitor",
  group: "Group Visitor",
};

export function isVisitorEntryType(value: string): value is VisitorEntryType {
  return (VISITOR_ENTRY_TYPES as readonly string[]).includes(value);
}

export function isGroupVisitorEntry(entry: {
  entryType: VisitorEntryType;
}): boolean {
  return entry.entryType === "group";
}

export function formatVisitorCount(count: number): string {
  return count === 1 ? "1 Visitor" : `${count} Visitors`;
}

export function formatVisitorPartyLabel(entry: {
  entryType: VisitorEntryType;
  visitorCount: number;
}): string | null {
  if (!isGroupVisitorEntry(entry)) {
    return null;
  }

  return `Group • ${formatVisitorCount(entry.visitorCount)}`;
}

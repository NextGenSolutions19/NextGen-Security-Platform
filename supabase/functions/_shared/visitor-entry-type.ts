export const VISITOR_ENTRY_TYPES = ["single", "group"] as const;

export type VisitorEntryType = (typeof VISITOR_ENTRY_TYPES)[number];

export const DEFAULT_VISITOR_ENTRY_TYPE: VisitorEntryType = "single";
export const DEFAULT_VISITOR_COUNT = 1;
export const GROUP_VISITOR_MIN_COUNT = 2;
/** Keep in sync with visitor_entries_visitor_count_max in migrations. */
export const GROUP_VISITOR_MAX_COUNT = 50;

export function isVisitorEntryType(value: string): value is VisitorEntryType {
  return (VISITOR_ENTRY_TYPES as readonly string[]).includes(value);
}

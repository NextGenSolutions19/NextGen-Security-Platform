/**
 * M03-T03 resident import foundation — comparison keys and catalogs.
 * Display strings are never rewritten here; keys are matching-only.
 */

export const RESIDENT_CONTACT_KINDS = ["primary", "additional"] as const;
export type ResidentContactKind = (typeof RESIDENT_CONTACT_KINDS)[number];

export const SOCIETY_RESIDENT_FIELD_TYPES = [
  "text",
  "number",
  "phone",
  "date",
  "dropdown",
  "yes_no",
  "multi_select",
] as const;
export type SocietyResidentFieldType =
  (typeof SOCIETY_RESIDENT_FIELD_TYPES)[number];

export const RESIDENT_IMPORT_ROW_STATUSES = [
  "INVALID",
  "VALID_NEW",
  "EXACT_DUPLICATE",
  "INTRA_FILE_DUPLICATE",
  "POSSIBLE_CONFLICT",
  "SKIPPED",
  "IMPORTED",
  "FAILED",
] as const;
export type ResidentImportRowStatus =
  (typeof RESIDENT_IMPORT_ROW_STATUSES)[number];

/**
 * Matches public.normalize_resident_compare_key:
 * trim, collapse whitespace, lower-case. Null/blank → "".
 * Matching only — never rewrite display columns.
 */
export function normalizeResidentCompareKey(value: string | null | undefined): string {
  if (value == null) {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Hosted uniqueness is now (society_id, wing_building_key, flat_number_key).
 * Keep false so distinct buildings with the same flat number can be created.
 */
export const LIVE_FLAT_UNIQUENESS_USES_SOCIETY_AND_FLAT_NUMBER = false;

export const BUILDING_AWARE_FLAT_IMPORT_BLOCKED_MESSAGE =
  "Valid resident data, but this flat requires building-aware database support before it can be imported.";

export const BUILDING_AWARE_FLAT_SAVE_BLOCKED_MESSAGE =
  "Valid resident data, but this flat requires building-aware database support before it can be saved.";

export type ResidentFlatIdentityInput = {
  wingBuilding?: string | null;
  flatNumber: string;
};

export type ResidentFlatIdentityKeys = {
  wingBuildingKey: string;
  flatNumberKey: string;
};

export type SocietyFlatRecord = {
  id: string;
  flatNumber: string;
  wingBuilding: string | null;
};

export type ResolveBuildingAwareSocietyFlatResult =
  | { kind: "match"; flat: SocietyFlatRecord }
  | { kind: "create" }
  | {
      kind: "backend_blocked";
      occupant: SocietyFlatRecord;
      message: string;
    };

/**
 * Combine Excel Building + Wing into the single stored wing_building label.
 * Does not guess synonyms or parse "A-202".
 */
export function combineResidentWingBuilding(
  building: string | null | undefined,
  wing: string | null | undefined,
): string | null {
  const parts = [building?.trim() ?? "", wing?.trim() ?? ""].filter(
    (part) => part.length > 0,
  );
  if (parts.length === 0) {
    return null;
  }
  return parts.join(" ").replace(/\s+/g, " ");
}

export function residentFlatIdentityKeys(
  input: ResidentFlatIdentityInput,
): ResidentFlatIdentityKeys {
  return {
    wingBuildingKey: normalizeResidentCompareKey(input.wingBuilding),
    flatNumberKey: normalizeResidentCompareKey(input.flatNumber),
  };
}

export function samePhysicalFlat(
  left: ResidentFlatIdentityInput,
  right: ResidentFlatIdentityInput,
): boolean {
  const leftKeys = residentFlatIdentityKeys(left);
  const rightKeys = residentFlatIdentityKeys(right);
  return (
    leftKeys.flatNumberKey !== "" &&
    leftKeys.wingBuildingKey === rightKeys.wingBuildingKey &&
    leftKeys.flatNumberKey === rightKeys.flatNumberKey
  );
}

/**
 * True when two labels would collide on the live UNIQUE (society_id, flat_number)
 * even if their building-aware identities differ.
 */
export function occupiesLiveFlatNumberSlot(
  left: ResidentFlatIdentityInput,
  right: ResidentFlatIdentityInput,
): boolean {
  const leftKey = residentFlatIdentityKeys(left).flatNumberKey;
  const rightKey = residentFlatIdentityKeys(right).flatNumberKey;
  return leftKey !== "" && leftKey === rightKey;
}

export function buildFlatIdentityKey(
  societyId: string,
  wingBuilding: string | null | undefined,
  flatNumber: string,
): string {
  const keys = residentFlatIdentityKeys({ wingBuilding, flatNumber });
  return [societyId, keys.wingBuildingKey, keys.flatNumberKey].join("|");
}

export function isCanonicalNoBuilding(
  wingBuilding: string | null | undefined,
): boolean {
  return normalizeResidentCompareKey(wingBuilding) === "";
}

export function sameFlatIdentity(
  left: {
    societyId: string;
    wingBuilding: string | null | undefined;
    flatNumber: string;
  },
  right: {
    societyId: string;
    wingBuilding: string | null | undefined;
    flatNumber: string;
  },
): boolean {
  return (
    buildFlatIdentityKey(left.societyId, left.wingBuilding, left.flatNumber) ===
    buildFlatIdentityKey(right.societyId, right.wingBuilding, right.flatNumber)
  );
}

export function formatResidentFlatLabel(
  wingBuilding: string | null | undefined,
  flatNumber: string,
): string {
  const building = wingBuilding?.trim() ?? "";
  const flat = flatNumber.trim();
  if (!flat) {
    return building;
  }
  return building ? `${building} · ${flat}` : flat;
}

export function formatResidentFlatLabelForCsvExport(
  wingBuilding: string | null | undefined,
  flatNumber: string,
): string {
  const building = wingBuilding?.trim() ?? "";
  const flat = flatNumber.trim();
  if (!flat) {
    return building;
  }
  if (!building) {
    return flat;
  }
  if (
    flat.startsWith(`${building}-`) ||
    flat.startsWith(`${building} `) ||
    flat === building
  ) {
    return flat;
  }
  return `${building}-${flat}`;
}

/**
 * Resolve a society flat by building-aware identity.
 * Never matches B/201 to A/201. Never rewrites another physical flat.
 * If the legacy society+flat_number unique slot is occupied by a different
 * building and the temporary limitation flag is still on, returns
 * backend_blocked instead of create/mutate.
 */
export function resolveBuildingAwareSocietyFlat(
  existing: readonly SocietyFlatRecord[],
  requested: ResidentFlatIdentityInput,
): ResolveBuildingAwareSocietyFlatResult {
  const identityMatch = existing.find((flat) =>
    samePhysicalFlat(
      { wingBuilding: flat.wingBuilding, flatNumber: flat.flatNumber },
      requested,
    ),
  );
  if (identityMatch) {
    return { kind: "match", flat: identityMatch };
  }

  const slotOccupant = existing.find((flat) =>
    occupiesLiveFlatNumberSlot(
      { wingBuilding: flat.wingBuilding, flatNumber: flat.flatNumber },
      requested,
    ),
  );
  if (slotOccupant && LIVE_FLAT_UNIQUENESS_USES_SOCIETY_AND_FLAT_NUMBER) {
    return {
      kind: "backend_blocked",
      occupant: slotOccupant,
      message: BUILDING_AWARE_FLAT_SAVE_BLOCKED_MESSAGE,
    };
  }

  return { kind: "create" };
}

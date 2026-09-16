/**
 * Building-aware flat identity for Admin Resident lookups.
 * Must stay aligned with packages/shared/src/resident-import-foundation.ts.
 * Display values are never rewritten.
 */

export const BUILDING_AWARE_FLAT_SAVE_BLOCKED_MESSAGE =
  "Valid resident data, but this flat requires building-aware database support before it can be saved.";

export const LIVE_FLAT_UNIQUENESS_USES_SOCIETY_AND_FLAT_NUMBER = false;

export type ResidentFlatIdentityInput = {
  wingBuilding?: string | null;
  flatNumber: string;
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

export function normalizeResidentCompareKey(
  value: string | null | undefined,
): string {
  if (value == null) {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function residentFlatIdentityKeys(input: ResidentFlatIdentityInput): {
  wingBuildingKey: string;
  flatNumberKey: string;
} {
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

export function occupiesLiveFlatNumberSlot(
  left: ResidentFlatIdentityInput,
  right: ResidentFlatIdentityInput,
): boolean {
  const leftKey = residentFlatIdentityKeys(left).flatNumberKey;
  const rightKey = residentFlatIdentityKeys(right).flatNumberKey;
  return leftKey !== "" && leftKey === rightKey;
}

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

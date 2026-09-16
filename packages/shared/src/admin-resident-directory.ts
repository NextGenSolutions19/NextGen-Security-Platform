import type { ResidentDirectoryItem } from "./resident-directory";

export interface AdminResidentDirectoryItem extends ResidentDirectoryItem {
  societyId: string;
  residentType: string | null;
  wingBuilding: string | null;
  status: "active" | "disabled";
}

export type AdminResidentListFilter = "all" | "active" | "archived";

export const ADMIN_RESIDENT_LIST_FILTERS = [
  "all",
  "active",
  "archived",
] as const;

export const ADMIN_RESIDENT_TYPES = [
  "Owner",
  "Tenant",
  "Family Member",
  "Other",
] as const;

export type AdminResidentType = (typeof ADMIN_RESIDENT_TYPES)[number];

export const INDIAN_MOBILE_NUMBER_PATTERN = /^[6-9][0-9]{9}$/;
export const INDIAN_MOBILE_VALIDATION_MESSAGE =
  "Enter a valid 10-digit Indian mobile number.";

export const RESIDENT_ADDED_MESSAGE = "Resident added successfully.";
export const RESIDENT_UPDATED_MESSAGE = "Resident updated successfully.";
export const RESIDENT_ARCHIVED_MESSAGE = "Resident archived successfully.";
export const RESIDENT_REACTIVATED_MESSAGE = "Resident reactivated successfully.";

export const ARCHIVE_RESIDENT_TITLE = "Archive this resident?";
export const ARCHIVE_RESIDENT_EXPLANATION =
  "The resident will no longer be treated as an active resident, but historical records will be preserved.";

export const REACTIVATE_RESIDENT_TITLE = "Reactivate this resident?";
export const REACTIVATE_RESIDENT_EXPLANATION =
  "The resident will be treated as an active resident again.";

export function formatResidentType(residentType: string | null): string {
  const trimmed = residentType?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "—";
}

export function formatResidentStatus(status: "active" | "disabled"): string {
  return status === "disabled" ? "Archived" : "Active";
}

export function formatWingBuilding(wingBuilding: string | null): string {
  const trimmed = wingBuilding?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "—";
}

export function formatAdminResidentListFilter(
  filter: AdminResidentListFilter,
): string {
  if (filter === "active") {
    return "Active";
  }
  if (filter === "archived") {
    return "Archived";
  }
  return "All";
}

export function isAdminResidentType(
  value: string | null | undefined,
): value is AdminResidentType {
  return (
    typeof value === "string" &&
    (ADMIN_RESIDENT_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeIndianMobileNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits.slice(0, 10);
}

export function isValidIndianMobileNumber(value: string): boolean {
  if (/[a-zA-Z]/.test(value)) {
    return false;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return INDIAN_MOBILE_NUMBER_PATTERN.test(digits);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return INDIAN_MOBILE_NUMBER_PATTERN.test(digits.slice(2));
  }
  return false;
}

export function normalizeFlatNumber(value: string): string {
  return value.trim();
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export interface AdminResidentFormInput {
  flatNumber: string;
  residentName: string;
  mobile: string;
  wingBuilding?: string;
  residentType?: string | null;
}

export interface AdminResidentFormErrors {
  flatNumber?: string;
  residentName?: string;
  mobile?: string;
  residentType?: string;
}

export interface AdminResidentFormValues {
  flatNumber: string;
  residentName: string;
  mobile: string;
  wingBuilding: string | null;
  residentType: AdminResidentType | null;
}

export function validateAdminResidentForm(
  input: AdminResidentFormInput,
): { ok: true; value: AdminResidentFormValues } | { ok: false; errors: AdminResidentFormErrors } {
  const errors: AdminResidentFormErrors = {};
  const flatNumber = normalizeFlatNumber(input.flatNumber);
  const residentName = input.residentName.trim();
  const mobile = normalizeIndianMobileNumber(input.mobile);
  const wingBuilding = normalizeOptionalText(input.wingBuilding);
  const rawType = normalizeOptionalText(input.residentType);

  if (!flatNumber) {
    errors.flatNumber = "Enter a flat number.";
  }

  if (!residentName) {
    errors.residentName = "Enter a resident name.";
  }

  if (!input.mobile.trim()) {
    errors.mobile = "Enter a mobile number.";
  } else if (!isValidIndianMobileNumber(input.mobile)) {
    errors.mobile = INDIAN_MOBILE_VALIDATION_MESSAGE;
  }

  if (rawType && !isAdminResidentType(rawType)) {
    errors.residentType = "Select a valid resident type.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      flatNumber,
      residentName,
      mobile,
      wingBuilding,
      residentType: rawType && isAdminResidentType(rawType) ? rawType : null,
    },
  };
}

export interface CreateAdminResidentRequest {
  action: "create";
  flatNumber: string;
  residentName: string;
  mobile: string;
  wingBuilding: string | null;
  residentType: AdminResidentType | null;
}

export interface UpdateAdminResidentRequest {
  action: "update";
  residentId: string;
  residentFlatId: string;
  flatNumber: string;
  residentName: string;
  mobile: string;
  wingBuilding: string | null;
  residentType: AdminResidentType | null;
}

export interface ArchiveAdminResidentRequest {
  action: "archive";
  residentId: string;
}

export interface ReactivateAdminResidentRequest {
  action: "reactivate";
  residentId: string;
}

export type AdminResidentMutationRequest =
  | CreateAdminResidentRequest
  | UpdateAdminResidentRequest
  | ArchiveAdminResidentRequest
  | ReactivateAdminResidentRequest;

export function buildCreateResidentRequest(
  value: AdminResidentFormValues,
): CreateAdminResidentRequest {
  return {
    action: "create",
    flatNumber: value.flatNumber,
    residentName: value.residentName,
    mobile: value.mobile,
    wingBuilding: value.wingBuilding,
    residentType: value.residentType,
  };
}

export function buildUpdateResidentRequest(
  residentId: string,
  residentFlatId: string,
  value: AdminResidentFormValues,
): UpdateAdminResidentRequest {
  return {
    action: "update",
    residentId,
    residentFlatId,
    flatNumber: value.flatNumber,
    residentName: value.residentName,
    mobile: value.mobile,
    wingBuilding: value.wingBuilding,
    residentType: value.residentType,
  };
}

export function buildArchiveResidentRequest(
  residentId: string,
): ArchiveAdminResidentRequest {
  return {
    action: "archive",
    residentId,
  };
}

export function buildReactivateResidentRequest(
  residentId: string,
): ReactivateAdminResidentRequest {
  return {
    action: "reactivate",
    residentId,
  };
}

export function filterAdminResidentsByStatus(
  items: readonly AdminResidentDirectoryItem[],
  statusFilter: AdminResidentListFilter = "all",
): AdminResidentDirectoryItem[] {
  if (statusFilter === "active") {
    return items.filter((item) => item.status === "active");
  }
  if (statusFilter === "archived") {
    return items.filter((item) => item.status === "disabled");
  }
  return [...items];
}

export type VisitorPurposeFieldRequirement = "required" | "optional" | "hidden";

export interface VisitorPurposeDefinition {
  id: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  vehicleNumber: VisitorPurposeFieldRequirement;
  customPurposeText: VisitorPurposeFieldRequirement;
  requiresResidentApproval: boolean;
}

export const VISITOR_PURPOSE_DEFINITIONS: readonly VisitorPurposeDefinition[] = [
  {
    id: "guest",
    label: "Guest",
    enabled: true,
    sortOrder: 10,
    vehicleNumber: "optional",
    customPurposeText: "hidden",
    requiresResidentApproval: true,
  },
  {
    id: "food_delivery",
    label: "Food Delivery",
    enabled: true,
    sortOrder: 20,
    vehicleNumber: "optional",
    customPurposeText: "hidden",
    requiresResidentApproval: true,
  },
  {
    id: "courier_delivery",
    label: "Courier / Delivery",
    enabled: true,
    sortOrder: 30,
    vehicleNumber: "optional",
    customPurposeText: "hidden",
    requiresResidentApproval: true,
  },
  {
    id: "cab_taxi",
    label: "Cab / Taxi",
    enabled: true,
    sortOrder: 40,
    vehicleNumber: "required",
    customPurposeText: "hidden",
    requiresResidentApproval: false,
  },
  {
    id: "electrician",
    label: "Electrician",
    enabled: true,
    sortOrder: 50,
    vehicleNumber: "optional",
    customPurposeText: "hidden",
    requiresResidentApproval: true,
  },
  {
    id: "plumber",
    label: "Plumber",
    enabled: true,
    sortOrder: 60,
    vehicleNumber: "optional",
    customPurposeText: "hidden",
    requiresResidentApproval: true,
  },
  {
    id: "service_repair",
    label: "Service / Repair",
    enabled: true,
    sortOrder: 70,
    vehicleNumber: "optional",
    customPurposeText: "hidden",
    requiresResidentApproval: true,
  },
  {
    id: "domestic_help",
    label: "Domestic Help",
    enabled: true,
    sortOrder: 80,
    vehicleNumber: "optional",
    customPurposeText: "hidden",
    requiresResidentApproval: true,
  },
  {
    id: "others",
    label: "Others",
    enabled: true,
    sortOrder: 90,
    vehicleNumber: "optional",
    customPurposeText: "required",
    requiresResidentApproval: true,
  },
];

export const CAB_TAXI_PURPOSE_CODE = "cab_taxi";
export const OTHERS_PURPOSE_CODE = "others";

export function getEnabledVisitorPurposes(): VisitorPurposeDefinition[] {
  return [...VISITOR_PURPOSE_DEFINITIONS]
    .filter((purpose) => purpose.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getVisitorPurposeById(
  purposeCode: string,
): VisitorPurposeDefinition | undefined {
  return VISITOR_PURPOSE_DEFINITIONS.find((purpose) => purpose.id === purposeCode);
}

export function resolveVisitorPurposeLabel(
  purpose: VisitorPurposeDefinition,
  customPurposeText?: string | null,
): string {
  if (purpose.customPurposeText === "required") {
    return customPurposeText?.trim() ?? "";
  }

  return purpose.label;
}

export function purposeRequiresVehicleNumber(
  purpose: VisitorPurposeDefinition,
): boolean {
  return purpose.vehicleNumber === "required";
}

export function purposeRequiresCustomText(
  purpose: VisitorPurposeDefinition,
): boolean {
  return purpose.customPurposeText === "required";
}

export const INDIAN_MOBILE_NUMBER_PATTERN = /^[6-9][0-9]{9}$/;

export function normalizeIndianMobileNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits.slice(0, 10);
}

export function isValidIndianMobileNumber(value: string): boolean {
  return INDIAN_MOBILE_NUMBER_PATTERN.test(normalizeIndianMobileNumber(value));
}

export const INDIAN_VEHICLE_NUMBER_PATTERN = /^[A-Z0-9]{4,15}$/;

export function normalizeVehicleNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isValidVehicleNumber(value: string): boolean {
  const normalized = normalizeVehicleNumber(value);
  if (!normalized) {
    return false;
  }
  return INDIAN_VEHICLE_NUMBER_PATTERN.test(normalized);
}

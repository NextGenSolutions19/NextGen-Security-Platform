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
] as const;

export type VisitorPurposeCode =
  (typeof VISITOR_PURPOSE_DEFINITIONS)[number]["id"];

export const CAB_TAXI_PURPOSE_CODE = "cab_taxi" as const;
export const OTHERS_PURPOSE_CODE = "others" as const;

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

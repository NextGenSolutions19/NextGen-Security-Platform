import {
  formatResidentFlatLabel,
  formatResidentFlatLabelForCsvExport,
} from "./resident-import-foundation.ts";

export const DESTINATION_TEXT_MAX_LENGTH = 80;
export const DESTINATION_TEXT_REQUIRED_MESSAGE =
  "Enter the flat or destination.";
export const DESTINATION_TEXT_TOO_LONG_MESSAGE =
  `Destination must be ${DESTINATION_TEXT_MAX_LENGTH} characters or fewer.`;
export const DESTINATION_REQUIRED_MESSAGE =
  "Select an existing flat or enter an Other destination.";
export const DESTINATION_BOTH_REJECTED_MESSAGE =
  "Choose either an existing flat or Other destination, not both.";
export const DESTINATION_OTHER_RESIDENT_REJECTED_MESSAGE =
  "Other destination cannot be linked to a resident.";
export const OTHER_DESTINATION_OPTION_REQUIRED_MESSAGE =
  "Select an Other destination option.";
export const BROKER_FLAT_REQUIRED_MESSAGE =
  "Enter the unregistered flat number or destination.";
export const BROKER_DESTINATION_PREFIX = "Broker / Property Visit - ";
export const BROKER_FLAT_MAX_LENGTH =
  DESTINATION_TEXT_MAX_LENGTH - BROKER_DESTINATION_PREFIX.length;

export const OTHER_DESTINATION_OPTIONS = [
  { id: "clubhouse", label: "Clubhouse" },
  { id: "society_office", label: "Society Office" },
  { id: "broker_property_visit", label: "Broker / Property Visit" },
  { id: "other_destination", label: "Other Destination" },
] as const;

export type OtherDestinationOptionId =
  (typeof OTHER_DESTINATION_OPTIONS)[number]["id"];

const FIXED_OTHER_DESTINATION_TEXT: Record<
  "clubhouse" | "society_office",
  string
> = {
  clubhouse: "Clubhouse",
  society_office: "Society Office",
};

export function composeOtherDestinationText(input: {
  optionId?: OtherDestinationOptionId | null;
  extraText?: string | null;
}):
  | { ok: true; destinationText: string }
  | { ok: false; message: string } {
  const optionId = input.optionId ?? null;
  if (!optionId) {
    return { ok: false, message: OTHER_DESTINATION_OPTION_REQUIRED_MESSAGE };
  }

  if (optionId === "clubhouse" || optionId === "society_office") {
    return {
      ok: true,
      destinationText: FIXED_OTHER_DESTINATION_TEXT[optionId],
    };
  }

  const extra = normalizeDestinationText(input.extraText ?? "");

  if (optionId === "broker_property_visit") {
    if (!extra) {
      return { ok: false, message: BROKER_FLAT_REQUIRED_MESSAGE };
    }
    return parseRequiredDestinationText(`${BROKER_DESTINATION_PREFIX}${extra}`);
  }

  if (!extra) {
    return { ok: false, message: DESTINATION_TEXT_REQUIRED_MESSAGE };
  }
  return parseRequiredDestinationText(extra);
}

export function normalizeDestinationText(value: string): string {
  return value.trim();
}

export function readStoredDestinationText(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeDestinationText(value ?? "");
  return normalized ? normalized : null;
}

export function parseRequiredDestinationText(
  value: unknown,
):
  | { ok: true; destinationText: string }
  | { ok: false; message: string } {
  const destinationText = normalizeDestinationText(String(value ?? ""));
  if (!destinationText) {
    return { ok: false, message: DESTINATION_TEXT_REQUIRED_MESSAGE };
  }
  if (destinationText.length > DESTINATION_TEXT_MAX_LENGTH) {
    return { ok: false, message: DESTINATION_TEXT_TOO_LONG_MESSAGE };
  }
  return { ok: true, destinationText };
}

export function parseVisitorDestinationInput(input: {
  flatId?: string | null;
  destinationText?: string | null;
  residentId?: string | null;
}):
  | {
      ok: true;
      flatId: string | null;
      destinationText: string | null;
      residentId: string | null;
    }
  | { ok: false; message: string; field: "flatId" | "destinationText" | "residentId" } {
  const flatId = input.flatId?.trim() ? input.flatId.trim() : null;
  const parsedDestination = parseRequiredDestinationText(input.destinationText ?? "");
  const destinationText = parsedDestination.ok ? parsedDestination.destinationText : null;
  const destinationWasEntered = String(input.destinationText ?? "").length > 0;
  const residentId = input.residentId?.trim() ? input.residentId.trim() : null;

  if (!flatId && !destinationWasEntered) {
    return {
      ok: false,
      message: DESTINATION_REQUIRED_MESSAGE,
      field: "destinationText",
    };
  }

  if (flatId && destinationWasEntered) {
    return {
      ok: false,
      message: DESTINATION_BOTH_REJECTED_MESSAGE,
      field: "destinationText",
    };
  }

  if (!flatId && !parsedDestination.ok) {
    return {
      ok: false,
      message: parsedDestination.message,
      field: "destinationText",
    };
  }

  if (!flatId && residentId) {
    return {
      ok: false,
      message: DESTINATION_OTHER_RESIDENT_REJECTED_MESSAGE,
      field: "residentId",
    };
  }

  return {
    ok: true,
    flatId,
    destinationText: flatId ? null : destinationText,
    residentId: flatId ? residentId : null,
  };
}

export function resolveVisitorDestinationLabel(item: {
  flatId?: string | null;
  flatNumber?: string | null;
  wingBuilding?: string | null;
  destinationText?: string | null;
}): string {
  if (item.flatId) {
    const label = formatResidentFlatLabel(item.wingBuilding, item.flatNumber ?? "");
    return label || "Unknown flat";
  }

  return readStoredDestinationText(item.destinationText) ?? "";
}

export function resolveVisitorDestinationLabelForCsvExport(item: {
  flatId?: string | null;
  flatNumber?: string | null;
  wingBuilding?: string | null;
  destinationText?: string | null;
}): string {
  if (item.flatId) {
    const label = formatResidentFlatLabelForCsvExport(
      item.wingBuilding,
      item.flatNumber ?? "",
    );
    return label || "Unknown flat";
  }

  return readStoredDestinationText(item.destinationText) ?? "";
}

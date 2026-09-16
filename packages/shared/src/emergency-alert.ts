export const SOCIETY_EMERGENCY_TYPES = [
  "SECURITY",
  "MEDICAL",
  "FIRE",
  "POLICE",
  "OTHER",
] as const;

export type SocietyEmergencyType = (typeof SOCIETY_EMERGENCY_TYPES)[number];

export const SOCIETY_EMERGENCY_TYPE_LABELS: Record<
  SocietyEmergencyType,
  string
> = {
  SECURITY: "Security",
  MEDICAL: "Medical",
  FIRE: "Fire",
  POLICE: "Police",
  OTHER: "Other",
};

export const MAX_EMERGENCY_NOTES_LENGTH = 500;

export const RAISE_EMERGENCY_SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please login again.";

export const RAISE_EMERGENCY_FORBIDDEN_MESSAGE =
  "You are not authorized to raise an emergency.";

export const RAISE_EMERGENCY_DUPLICATE_MESSAGE =
  "An identical emergency alert was just raised. Please wait before trying again.";

export const RAISE_EMERGENCY_NETWORK_MESSAGE =
  "Emergency alert could not be sent. Please try again.";

export const RAISE_EMERGENCY_VALIDATION_FALLBACK_MESSAGE =
  "Please check the emergency details and try again.";

export interface RaiseEmergencyRequest {
  emergency_type: SocietyEmergencyType;
  notes?: string;
}

export interface RaisedEmergencyEvent {
  id: string;
  emergencyType: string;
  raisedAt: string;
  status: string;
}

export function isSocietyEmergencyType(
  value: string,
): value is SocietyEmergencyType {
  return (SOCIETY_EMERGENCY_TYPES as readonly string[]).includes(value);
}

export function formatEmergencyTypeLabel(type: string): string {
  if (isSocietyEmergencyType(type)) {
    return SOCIETY_EMERGENCY_TYPE_LABELS[type];
  }
  return type;
}

export function formatEmergencyStatus(status: string): string {
  if (status === "RAISED") {
    return "Raised";
  }
  if (status === "ACKNOWLEDGED") {
    return "Acknowledged";
  }
  if (status === "RESOLVED") {
    return "Resolved";
  }
  return status;
}

export function formatEmergencyRaisedAt(raisedAt: string): string {
  const date = new Date(raisedAt);
  if (Number.isNaN(date.getTime())) {
    return raisedAt;
  }
  return date.toLocaleString();
}

export function buildRaiseEmergencyRequest(
  emergencyType: SocietyEmergencyType,
  notes?: string | null,
): RaiseEmergencyRequest {
  const payload: RaiseEmergencyRequest = {
    emergency_type: emergencyType,
  };

  const trimmed = (notes ?? "").trim();
  if (trimmed.length > 0) {
    payload.notes = trimmed.slice(0, MAX_EMERGENCY_NOTES_LENGTH);
  }

  return payload;
}

export function mapRaiseEmergencyUserMessage(input: {
  status?: number;
  code?: string;
  message?: string;
}): string {
  const status = input.status;
  const code = input.code;

  if (status === 401 || code === "UNAUTHORIZED") {
    return RAISE_EMERGENCY_SESSION_EXPIRED_MESSAGE;
  }

  if (status === 403 || code === "FORBIDDEN" || code === "ACCOUNT_DISABLED") {
    return RAISE_EMERGENCY_FORBIDDEN_MESSAGE;
  }

  if (status === 409 || code === "DUPLICATE_EMERGENCY") {
    return RAISE_EMERGENCY_DUPLICATE_MESSAGE;
  }

  if (status === 400 || code === "VALIDATION_ERROR" || code === "INVALID_EMERGENCY_TYPE") {
    const message = input.message?.trim();
    if (message && code !== "INTERNAL_ERROR") {
      return message;
    }
    return RAISE_EMERGENCY_VALIDATION_FALLBACK_MESSAGE;
  }

  return RAISE_EMERGENCY_NETWORK_MESSAGE;
}

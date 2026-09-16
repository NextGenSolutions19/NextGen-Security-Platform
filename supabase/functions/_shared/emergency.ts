export const EMERGENCY_TYPES = [
  "SECURITY",
  "MEDICAL",
  "FIRE",
  "POLICE",
  "OTHER",
] as const;

export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

export const MAX_EMERGENCY_NOTES_LENGTH = 500;

/** Same Guard + society + type within this window is treated as a rapid duplicate. */
export const EMERGENCY_DUPLICATE_WINDOW_SECONDS = 30;

export interface RaiseEmergencyInput {
  emergency_type?: unknown;
  notes?: unknown;
}

export interface RaiseEmergencyValidationSuccess {
  ok: true;
  value: {
    emergencyType: EmergencyType;
    notes: string | null;
  };
}

export interface RaiseEmergencyValidationFailure {
  ok: false;
  code: string;
  message: string;
  status: number;
}

export type RaiseEmergencyValidationResult =
  | RaiseEmergencyValidationSuccess
  | RaiseEmergencyValidationFailure;

function isEmergencyType(value: string): value is EmergencyType {
  return (EMERGENCY_TYPES as readonly string[]).includes(value);
}

export function validateRaiseEmergencyInput(
  body: RaiseEmergencyInput | null | undefined,
): RaiseEmergencyValidationResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Request body must be a JSON object.",
      status: 400,
    };
  }

  const rawType = String(body.emergency_type ?? "").trim().toUpperCase();
  if (!rawType) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "emergency_type is required.",
      status: 400,
    };
  }

  if (!isEmergencyType(rawType)) {
    return {
      ok: false,
      code: "INVALID_EMERGENCY_TYPE",
      message:
        "emergency_type must be one of: SECURITY, MEDICAL, FIRE, POLICE, OTHER.",
      status: 400,
    };
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "notes must be a string.",
        status: 400,
      };
    }

    const trimmed = body.notes.trim();
    if (trimmed.length > MAX_EMERGENCY_NOTES_LENGTH) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `notes must be at most ${MAX_EMERGENCY_NOTES_LENGTH} characters.`,
        status: 400,
      };
    }

    notes = trimmed.length > 0 ? trimmed : null;
  }

  return {
    ok: true,
    value: {
      emergencyType: rawType,
      notes,
    },
  };
}

export function duplicateWindowStartIso(
  nowMs = Date.now(),
  windowSeconds = EMERGENCY_DUPLICATE_WINDOW_SECONDS,
): string {
  return new Date(nowMs - windowSeconds * 1000).toISOString();
}

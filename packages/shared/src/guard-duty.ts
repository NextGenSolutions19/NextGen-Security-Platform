export const DUTY_STATUS_ON = "ON DUTY";
export const DUTY_STATUS_OFF = "OFF DUTY";

export const DUTY_START_ACTION_LABEL = "Go On Duty";
export const DUTY_END_ACTION_LABEL = "Go Off Duty";

export const DUTY_SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please login again.";

export const DUTY_FORBIDDEN_MESSAGE =
  "You are not authorized to change duty status.";

export const DUTY_ALREADY_ON_MESSAGE = "You are already on duty.";

export const DUTY_ALREADY_OFF_MESSAGE = "You are already off duty.";

export const DUTY_NETWORK_MESSAGE =
  "Duty status could not be updated. Please try again.";

export const DUTY_LOAD_FAILED_MESSAGE =
  "Duty status could not be loaded. Please try again.";

export const GUARD_OFF_DUTY_CHECKIN_MESSAGE =
  "You are currently off duty. Please go On Duty before registering or checking in visitors.";

export interface GuardDutySession {
  id: string;
  startedAt: string;
  endedAt: string | null;
}

export interface GuardDutySessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
}

export function isActiveDutySession(
  session: GuardDutySession | null | undefined,
): boolean {
  return Boolean(session && session.endedAt == null);
}

export function mapGuardDutySession(
  row: GuardDutySessionRow,
): GuardDutySession {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export function formatDutyStartedAt(startedAt: string): string {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return startedAt;
  }
  return date.toLocaleString();
}

export function extractDutyErrorToken(error: unknown): string {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    const record = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    return [record.message, record.code, record.details, record.hint]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
  }

  return "";
}

export function mapDutyUserMessage(
  error: unknown,
  fallback = DUTY_NETWORK_MESSAGE,
): string {
  const token = extractDutyErrorToken(error).toUpperCase();

  if (token.includes("UNAUTHORIZED") || token.includes("JWT")) {
    return DUTY_SESSION_EXPIRED_MESSAGE;
  }

  if (token.includes("FORBIDDEN")) {
    return DUTY_FORBIDDEN_MESSAGE;
  }

  if (token.includes("ALREADY_ON_DUTY")) {
    return DUTY_ALREADY_ON_MESSAGE;
  }

  if (token.includes("ALREADY_OFF_DUTY")) {
    return DUTY_ALREADY_OFF_MESSAGE;
  }

  return fallback;
}

export function isAlreadyOnDutyError(error: unknown): boolean {
  return extractDutyErrorToken(error).toUpperCase().includes("ALREADY_ON_DUTY");
}

export function isAlreadyOffDutyError(error: unknown): boolean {
  return extractDutyErrorToken(error)
    .toUpperCase()
    .includes("ALREADY_OFF_DUTY");
}

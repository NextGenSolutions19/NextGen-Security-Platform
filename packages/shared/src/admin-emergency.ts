export const ADMIN_EMERGENCY_STATUSES = [
  "RAISED",
  "ACKNOWLEDGED",
  "RESOLVED",
] as const;

export type AdminEmergencyStatus = (typeof ADMIN_EMERGENCY_STATUSES)[number];

const EMERGENCY_TYPE_LABELS: Record<string, string> = {
  SECURITY: "Security",
  MEDICAL: "Medical",
  FIRE: "Fire",
  POLICE: "Police",
  OTHER: "Other",
};

function emergencyTypeLabel(type: string): string {
  return EMERGENCY_TYPE_LABELS[type] ?? type;
}

export const ADMIN_EMERGENCY_NOTIFICATION_TYPE = "EMERGENCY" as const;

export const ADMIN_EMERGENCY_LOAD_FAILED_MESSAGE =
  "Unable to load emergency events for your society.";

export const ADMIN_NOTIFICATIONS_LOAD_FAILED_MESSAGE =
  "Unable to load notifications for your society.";

export interface AdminEmergencyEvent {
  id: string;
  societyId: string;
  emergencyType: string;
  notes: string | null;
  raisedAt: string;
  status: AdminEmergencyStatus;
  raisedByAppUserId: string;
  raisedByLoginId: string | null;
  acknowledgedAt: string | null;
  acknowledgedByAppUserId: string | null;
  resolvedAt: string | null;
  resolvedByAppUserId: string | null;
}

export interface AdminEmergencyNotification {
  id: string;
  type: typeof ADMIN_EMERGENCY_NOTIFICATION_TYPE;
  title: string;
  message: string;
  createdAt: string;
  unread: boolean;
  emergencyEventId: string;
  status: AdminEmergencyStatus;
}

export function isAdminEmergencyStatus(
  value: string,
): value is AdminEmergencyStatus {
  return (ADMIN_EMERGENCY_STATUSES as readonly string[]).includes(value);
}

export function canAcknowledgeEmergency(status: string): boolean {
  return status === "RAISED";
}

export function canResolveEmergency(status: string): boolean {
  return status === "ACKNOWLEDGED";
}

export function formatRaisedByLabel(loginId: string | null): string {
  const trimmed = loginId?.trim();
  return trimmed ? trimmed : "Guard";
}

export function buildEmergencyNotificationTitle(emergencyType: string): string {
  return `${emergencyTypeLabel(emergencyType)} emergency`;
}

export function buildEmergencyNotificationMessage(input: {
  emergencyType: string;
  notes: string | null;
  raisedByLoginId: string | null;
}): string {
  const raisedBy = formatRaisedByLabel(input.raisedByLoginId);
  const note = input.notes?.trim();
  if (note) {
    return `${raisedBy} raised a ${emergencyTypeLabel(input.emergencyType).toLowerCase()} alert. ${note}`;
  }
  return `${raisedBy} raised a ${emergencyTypeLabel(input.emergencyType).toLowerCase()} alert.`;
}

export function mapEmergencyToNotification(
  event: AdminEmergencyEvent,
  unread: boolean,
): AdminEmergencyNotification {
  return {
    id: event.id,
    type: ADMIN_EMERGENCY_NOTIFICATION_TYPE,
    title: buildEmergencyNotificationTitle(event.emergencyType),
    message: buildEmergencyNotificationMessage({
      emergencyType: event.emergencyType,
      notes: event.notes,
      raisedByLoginId: event.raisedByLoginId,
    }),
    createdAt: event.raisedAt,
    unread,
    emergencyEventId: event.id,
    status: event.status,
  };
}

export function parseAdminEmergencyAction(body: unknown):
  | {
      ok: true;
      action:
        | "list"
        | "get"
        | "acknowledge"
        | "resolve"
        | "notifications"
        | "mark_read";
      eventId: string | null;
    }
  | { ok: false; code: string; message: string; status: number } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Request body must be a JSON object.",
      status: 400,
    };
  }

  const record = body as Record<string, unknown>;
  if ("society_id" in record || "societyId" in record) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Society is taken from the authenticated session.",
      status: 400,
    };
  }

  const action = String(record.action ?? "").trim();
  const allowed = [
    "list",
    "get",
    "acknowledge",
    "resolve",
    "notifications",
    "mark_read",
  ] as const;
  if (!allowed.includes(action as (typeof allowed)[number])) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message:
        "action must be list, get, acknowledge, resolve, notifications, or mark_read.",
      status: 400,
    };
  }

  const needsEventId =
    action === "get" ||
    action === "acknowledge" ||
    action === "resolve" ||
    action === "mark_read";
  const eventIdRaw = String(record.eventId ?? record.event_id ?? "").trim();
  if (needsEventId && !eventIdRaw) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "eventId is required.",
      status: 400,
    };
  }

  return {
    ok: true,
    action: action as (typeof allowed)[number],
    eventId: needsEventId ? eventIdRaw : null,
  };
}

export function mapAdminEmergencyEvent(input: {
  id: string;
  societyId: string;
  emergencyType: string;
  notes: string | null;
  raisedAt: string;
  status: string;
  raisedByAppUserId: string;
  raisedByLoginId: string | null;
  acknowledgedAt: string | null;
  acknowledgedByAppUserId: string | null;
  resolvedAt: string | null;
  resolvedByAppUserId: string | null;
}): AdminEmergencyEvent | null {
  if (!isAdminEmergencyStatus(input.status)) {
    return null;
  }

  return {
    id: input.id,
    societyId: input.societyId,
    emergencyType: input.emergencyType,
    notes: input.notes,
    raisedAt: input.raisedAt,
    status: input.status,
    raisedByAppUserId: input.raisedByAppUserId,
    raisedByLoginId: input.raisedByLoginId,
    acknowledgedAt: input.acknowledgedAt,
    acknowledgedByAppUserId: input.acknowledgedByAppUserId,
    resolvedAt: input.resolvedAt,
    resolvedByAppUserId: input.resolvedByAppUserId,
  };
}

// formatEmergencyStatus / formatEmergencyTypeLabel live in emergency-alert.ts
// and are re-exported from @nextgen/shared. Do not re-export them here.

export const ADMIN_EMERGENCY_EVENT_SELECT =
  "id, society_id, raised_by_app_user_id, emergency_type, notes, raised_at, status, acknowledged_at, acknowledged_by_app_user_id, updated_at";

export interface EmergencyEventRow {
  id: string;
  society_id: string;
  raised_by_app_user_id: string;
  emergency_type: string;
  notes: string | null;
  raised_at: string;
  status: string;
  acknowledged_at: string | null;
  acknowledged_by_app_user_id: string | null;
  updated_at?: string | null;
  resolved_at?: string | null;
  resolved_by_app_user_id?: string | null;
}

export interface AdminEmergencyEventDto {
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
}

export interface AdminEmergencyNotificationDto {
  id: string;
  type: "EMERGENCY";
  title: string;
  message: string;
  createdAt: string;
  unread: boolean;
  emergencyEventId: string;
  status: string;
}

const TYPE_LABELS: Record<string, string> = {
  SECURITY: "Security",
  MEDICAL: "Medical",
  FIRE: "Fire",
  POLICE: "Police",
  OTHER: "Other",
};

export function canAcknowledgeEmergency(status: string): boolean {
  return status === "RAISED";
}

export function canResolveEmergency(status: string): boolean {
  return status === "ACKNOWLEDGED";
}

function formatTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function formatRaisedByLabel(loginId: string | null): string {
  const trimmed = loginId?.trim();
  return trimmed ? trimmed : "Guard";
}

export function mapAdminEmergencyEventDto(
  row: EmergencyEventRow,
  raisedByLoginId: string | null,
): AdminEmergencyEventDto {
  return {
    id: row.id,
    societyId: row.society_id,
    emergencyType: row.emergency_type,
    notes: row.notes,
    raisedAt: row.raised_at,
    status: row.status,
    raisedByAppUserId: row.raised_by_app_user_id,
    raisedByLoginId,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedByAppUserId: row.acknowledged_by_app_user_id,
    resolvedAt:
      row.resolved_at ??
      (row.status === "RESOLVED" ? row.updated_at ?? null : null),
    resolvedByAppUserId: row.resolved_by_app_user_id ?? null,
  };
}

export function mapEmergencyNotificationDto(
  event: AdminEmergencyEventDto,
  unread: boolean,
): AdminEmergencyNotificationDto {
  const raisedBy = formatRaisedByLabel(event.raisedByLoginId);
  const typeLabel = formatTypeLabel(event.emergencyType).toLowerCase();
  const note = event.notes?.trim();
  return {
    id: event.id,
    type: "EMERGENCY",
    title: `${formatTypeLabel(event.emergencyType)} emergency`,
    message: note
      ? `${raisedBy} raised a ${typeLabel} alert. ${note}`
      : `${raisedBy} raised a ${typeLabel} alert.`,
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
  const eventId = String(record.eventId ?? record.event_id ?? "").trim();
  if (needsEventId && !eventId) {
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
    eventId: needsEventId ? eventId : null,
  };
}

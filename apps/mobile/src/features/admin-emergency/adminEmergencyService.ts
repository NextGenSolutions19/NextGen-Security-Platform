import {
  ADMIN_EMERGENCY_LOAD_FAILED_MESSAGE,
  ADMIN_NOTIFICATIONS_LOAD_FAILED_MESSAGE,
  mapAdminEmergencyEvent,
  type AdminEmergencyEvent,
  type AdminEmergencyNotification,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

export class AdminEmergencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminEmergencyError";
  }
}

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
  events?: unknown[];
  event?: Record<string, unknown>;
  notifications?: unknown[];
  ok?: boolean;
  eventId?: string;
}

async function readFunctionError(
  error: unknown,
): Promise<{ status?: number; code?: string; message?: string }> {
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    const status = error.context.status;
    try {
      const body = (await error.context.json()) as FunctionErrorBody;
      return {
        status,
        code: body.error?.code ?? body.code,
        message: body.error?.message ?? body.message,
      };
    } catch {
      return { status };
    }
  }

  return {};
}

function mapUserMessage(
  parsed: { status?: number; code?: string; message?: string },
  fallback: string,
): string {
  if (parsed.status === 401 || parsed.code === "UNAUTHORIZED") {
    return "Your session has expired. Please login again.";
  }
  if (
    parsed.status === 403 ||
    parsed.code === "FORBIDDEN" ||
    parsed.code === "ACCOUNT_DISABLED"
  ) {
    return "You do not have permission to manage emergency events.";
  }
  if (parsed.status === 404 || parsed.code === "NOT_FOUND") {
    return "Emergency event not found.";
  }
  return parsed.message ?? fallback;
}

function assertConfiguredClient(accessToken: string, fallback: string) {
  if (!isSupabaseConfigured()) {
    throw new AdminEmergencyError(fallback);
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new AdminEmergencyError(fallback);
  }

  return supabase;
}

function mapEventRecord(record: Record<string, unknown> | null): AdminEmergencyEvent {
  const mapped = mapAdminEmergencyEvent({
    id: String(record?.id ?? ""),
    societyId: String(record?.societyId ?? ""),
    emergencyType: String(record?.emergencyType ?? ""),
    notes: typeof record?.notes === "string" ? record.notes : null,
    raisedAt: String(record?.raisedAt ?? ""),
    status: String(record?.status ?? ""),
    raisedByAppUserId: String(record?.raisedByAppUserId ?? ""),
    raisedByLoginId:
      typeof record?.raisedByLoginId === "string" ? record.raisedByLoginId : null,
    acknowledgedAt:
      typeof record?.acknowledgedAt === "string" ? record.acknowledgedAt : null,
    acknowledgedByAppUserId:
      typeof record?.acknowledgedByAppUserId === "string"
        ? record.acknowledgedByAppUserId
        : null,
    resolvedAt: typeof record?.resolvedAt === "string" ? record.resolvedAt : null,
    resolvedByAppUserId:
      typeof record?.resolvedByAppUserId === "string"
        ? record.resolvedByAppUserId
        : null,
  });

  if (!mapped) {
    throw new AdminEmergencyError(ADMIN_EMERGENCY_LOAD_FAILED_MESSAGE);
  }

  return mapped;
}

async function invokeAdminEmergency(
  accessToken: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<FunctionErrorBody> {
  const supabase = assertConfiguredClient(accessToken, fallback);
  const { data, error } = await supabase.functions.invoke<FunctionErrorBody>(
    "admin-emergency",
    {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    const parsed = await readFunctionError(error);
    throw new AdminEmergencyError(mapUserMessage(parsed, fallback));
  }

  if (data?.error?.code) {
    throw new AdminEmergencyError(
      mapUserMessage(
        { code: data.error.code, message: data.error.message },
        fallback,
      ),
    );
  }

  return data ?? {};
}

export async function listAdminEmergencyEvents(
  accessToken: string,
): Promise<AdminEmergencyEvent[]> {
  const data = await invokeAdminEmergency(
    accessToken,
    { action: "list" },
    ADMIN_EMERGENCY_LOAD_FAILED_MESSAGE,
  );
  return ((data.events ?? []) as Record<string, unknown>[]).map(mapEventRecord);
}

export async function getAdminEmergencyEvent(
  accessToken: string,
  eventId: string,
): Promise<AdminEmergencyEvent> {
  const data = await invokeAdminEmergency(
    accessToken,
    { action: "get", eventId },
    ADMIN_EMERGENCY_LOAD_FAILED_MESSAGE,
  );
  return mapEventRecord((data.event ?? null) as Record<string, unknown> | null);
}

export async function acknowledgeAdminEmergencyEvent(
  accessToken: string,
  eventId: string,
): Promise<AdminEmergencyEvent> {
  const data = await invokeAdminEmergency(
    accessToken,
    { action: "acknowledge", eventId },
    ADMIN_EMERGENCY_LOAD_FAILED_MESSAGE,
  );
  return mapEventRecord((data.event ?? null) as Record<string, unknown> | null);
}

export async function resolveAdminEmergencyEvent(
  accessToken: string,
  eventId: string,
): Promise<AdminEmergencyEvent> {
  const data = await invokeAdminEmergency(
    accessToken,
    { action: "resolve", eventId },
    ADMIN_EMERGENCY_LOAD_FAILED_MESSAGE,
  );
  return mapEventRecord((data.event ?? null) as Record<string, unknown> | null);
}

function mapNotificationRecord(
  record: Record<string, unknown>,
): AdminEmergencyNotification {
  const status = String(record.status ?? "");
  if (
    status !== "RAISED" &&
    status !== "ACKNOWLEDGED" &&
    status !== "RESOLVED"
  ) {
    throw new AdminEmergencyError(ADMIN_NOTIFICATIONS_LOAD_FAILED_MESSAGE);
  }

  return {
    id: String(record.id ?? ""),
    type: "EMERGENCY",
    title: String(record.title ?? ""),
    message: String(record.message ?? ""),
    createdAt: String(record.createdAt ?? ""),
    unread: record.unread === true,
    emergencyEventId: String(record.emergencyEventId ?? record.id ?? ""),
    status,
  };
}

export async function listAdminEmergencyNotifications(
  accessToken: string,
): Promise<AdminEmergencyNotification[]> {
  const data = await invokeAdminEmergency(
    accessToken,
    { action: "notifications" },
    ADMIN_NOTIFICATIONS_LOAD_FAILED_MESSAGE,
  );
  return ((data.notifications ?? []) as Record<string, unknown>[]).map(
    mapNotificationRecord,
  );
}

export async function markAdminEmergencyNotificationRead(
  accessToken: string,
  eventId: string,
): Promise<void> {
  await invokeAdminEmergency(
    accessToken,
    { action: "mark_read", eventId },
    ADMIN_NOTIFICATIONS_LOAD_FAILED_MESSAGE,
  );
}

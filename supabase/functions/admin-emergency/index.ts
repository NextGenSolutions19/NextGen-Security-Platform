import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import {
  ADMIN_EMERGENCY_EVENT_SELECT,
  canAcknowledgeEmergency,
  canResolveEmergency,
  mapAdminEmergencyEventDto,
  mapEmergencyNotificationDto,
  parseAdminEmergencyAction,
  type AdminEmergencyEventDto,
  type EmergencyEventRow,
} from "../_shared/admin-emergency.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function rejectClientSociety(body: Record<string, unknown>) {
  if ("society_id" in body || "societyId" in body) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Society is taken from the authenticated session.",
      400,
    );
  }
  return null;
}

async function loadLoginIds(
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("id, login_id")
    .in("id", unique);

  if (error || !data) {
    return map;
  }

  for (const row of data as { id: string; login_id: string }[]) {
    map.set(row.id, row.login_id);
  }
  return map;
}

function mapRows(
  rows: EmergencyEventRow[],
  loginIds: Map<string, string>,
): AdminEmergencyEventDto[] {
  return rows.map((row) =>
    mapAdminEmergencyEventDto(row, loginIds.get(row.raised_by_app_user_id) ?? null),
  );
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(
      "VALIDATION_ERROR",
      "Request body must be valid JSON.",
      400,
    );
  }

  const spoof = rejectClientSociety(body);
  if (spoof) {
    return spoof;
  }

  const parsed = parseAdminEmergencyAction(body);
  if (!parsed.ok) {
    return errorResponse(parsed.code, parsed.message, parsed.status);
  }

  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { user, society } = auth.context;
  const supabase = createServiceClient();

  async function loadSocietyEvent(eventId: string) {
    const { data, error } = await supabase
      .from("emergency_events")
      .select(ADMIN_EMERGENCY_EVENT_SELECT)
      .eq("id", eventId)
      .eq("society_id", society.id)
      .maybeSingle();

    if (error) {
      console.error("admin-emergency load error", error);
      return { error: errorResponse("INTERNAL_ERROR", "Unable to load emergency event.", 500) };
    }

    if (!data) {
      return {
        error: errorResponse("NOT_FOUND", "Emergency event not found.", 404),
      };
    }

    return { row: data as EmergencyEventRow };
  }

  if (parsed.action === "list" || parsed.action === "notifications") {
    const { data, error } = await supabase
      .from("emergency_events")
      .select(ADMIN_EMERGENCY_EVENT_SELECT)
      .eq("society_id", society.id)
      .order("raised_at", { ascending: false });

    if (error) {
      console.error("admin-emergency list error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to load emergency events.", 500);
    }

    const rows = (data ?? []) as EmergencyEventRow[];
    const loginIds = await loadLoginIds(
      supabase,
      rows.map((row) => row.raised_by_app_user_id),
    );
    const events = mapRows(rows, loginIds);

    if (parsed.action === "list") {
      return jsonResponse({ events });
    }

    return jsonResponse({
      notifications: events.map((event) =>
        mapEmergencyNotificationDto(event, event.status === "RAISED"),
      ),
    });
  }

  const loaded = await loadSocietyEvent(parsed.eventId as string);
  if ("error" in loaded) {
    return loaded.error;
  }

  const row = loaded.row;

  if (parsed.action === "get") {
    const loginIds = await loadLoginIds(supabase, [row.raised_by_app_user_id]);
    return jsonResponse({
      event: mapAdminEmergencyEventDto(
        row,
        loginIds.get(row.raised_by_app_user_id) ?? null,
      ),
    });
  }

  if (parsed.action === "mark_read") {
    return jsonResponse({ ok: true, eventId: row.id });
  }

  if (parsed.action === "acknowledge") {
    if (!canAcknowledgeEmergency(row.status)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Only a new emergency can be acknowledged.",
        400,
      );
    }

    const { data, error } = await supabase
      .from("emergency_events")
      .update({
        status: "ACKNOWLEDGED",
        acknowledged_at: new Date().toISOString(),
        acknowledged_by_app_user_id: user.id,
      })
      .eq("id", row.id)
      .eq("society_id", society.id)
      .eq("status", "RAISED")
      .select(ADMIN_EMERGENCY_EVENT_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error("admin-emergency acknowledge error", error);
      return errorResponse("INTERNAL_ERROR", "Unable to acknowledge emergency.", 500);
    }

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: user.id,
      p_actor_role: user.role,
      p_action: "emergency.acknowledged",
      p_entity_type: "emergency_event",
      p_entity_id: row.id,
      p_metadata: { status: "ACKNOWLEDGED" },
    });

    const updated = data as EmergencyEventRow;
    const loginIds = await loadLoginIds(supabase, [updated.raised_by_app_user_id]);
    return jsonResponse({
      event: mapAdminEmergencyEventDto(
        updated,
        loginIds.get(updated.raised_by_app_user_id) ?? null,
      ),
    });
  }

  if (!canResolveEmergency(row.status)) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Acknowledge the emergency before resolving it.",
      400,
    );
  }

  const { data, error } = await supabase
    .from("emergency_events")
    .update({
      status: "RESOLVED",
    })
    .eq("id", row.id)
    .eq("society_id", society.id)
    .eq("status", "ACKNOWLEDGED")
    .select(ADMIN_EMERGENCY_EVENT_SELECT)
    .maybeSingle();

  if (error || !data) {
    console.error("admin-emergency resolve error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to resolve emergency.", 500);
  }

  await supabase.rpc("write_audit_log", {
    p_society_id: society.id,
    p_actor_id: user.id,
    p_actor_role: user.role,
    p_action: "emergency.resolved",
    p_entity_type: "emergency_event",
    p_entity_id: row.id,
    p_metadata: { status: "RESOLVED" },
  });

  const updated = data as EmergencyEventRow;
  const loginIds = await loadLoginIds(supabase, [updated.raised_by_app_user_id]);
  return jsonResponse({
    event: mapAdminEmergencyEventDto(
      updated,
      loginIds.get(updated.raised_by_app_user_id) ?? null,
    ),
  });
});

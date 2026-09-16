import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  duplicateWindowStartIso,
  validateRaiseEmergencyInput,
} from "../_shared/emergency.ts";
import { authenticateGuardRequest } from "../_shared/guard-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

interface EmergencyEventRow {
  id: string;
  society_id: string;
  raised_by_app_user_id: string;
  emergency_type: string;
  notes: string | null;
  raised_at: string;
  status: string;
  sms_attempted: boolean;
  push_attempted: boolean;
}

const EMERGENCY_EVENT_SELECT =
  "id, society_id, raised_by_app_user_id, emergency_type, notes, raised_at, status, sms_attempted, push_attempted";

/**
 * Rapid-tap protection: if this Guard already raised the same emergency_type
 * in the same society within EMERGENCY_DUPLICATE_WINDOW_SECONDS, do not insert
 * a second row. Return 409 with the existing event's safe fields.
 * Later legitimate raises after the window are allowed.
 */
function mapSafeEmergencyEvent(event: EmergencyEventRow) {
  return {
    id: event.id,
    emergencyType: event.emergency_type,
    raisedAt: event.raised_at,
    status: event.status,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

  try {
    const auth = await authenticateGuardRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { user: guardUser, society } = auth.context;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(
        "VALIDATION_ERROR",
        "Request body must be valid JSON.",
        400,
      );
    }

    const validation = validateRaiseEmergencyInput(
      body as Record<string, unknown>,
    );
    if (!validation.ok) {
      return errorResponse(validation.code, validation.message, validation.status);
    }

    const { emergencyType, notes } = validation.value;
    const supabase = createServiceClient();

    const { data: recent, error: recentError } = await supabase
      .from("emergency_events")
      .select(EMERGENCY_EVENT_SELECT)
      .eq("society_id", society.id)
      .eq("raised_by_app_user_id", guardUser.id)
      .eq("emergency_type", emergencyType)
      .gte("raised_at", duplicateWindowStartIso())
      .order("raised_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentError) {
      console.error("raise-emergency duplicate lookup error", recentError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to raise emergency.",
        500,
      );
    }

    if (recent) {
      const existing = recent as EmergencyEventRow;
      return jsonResponse(
        {
          error: {
            code: "DUPLICATE_EMERGENCY",
            message:
              "An emergency of this type was already raised. Please wait before raising again.",
          },
          emergencyEvent: mapSafeEmergencyEvent(existing),
        },
        409,
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("emergency_events")
      .insert({
        society_id: society.id,
        raised_by_app_user_id: guardUser.id,
        emergency_type: emergencyType,
        notes,
        status: "RAISED",
        push_attempted: false,
        sms_attempted: false,
      })
      .select(EMERGENCY_EVENT_SELECT)
      .single();

    if (insertError || !inserted) {
      console.error("raise-emergency insert error", insertError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to raise emergency.",
        500,
      );
    }

    const event = inserted as EmergencyEventRow;

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: guardUser.id,
      p_actor_role: guardUser.role,
      p_action: "emergency.raised",
      p_entity_type: "emergency_event",
      p_entity_id: event.id,
      p_metadata: {
        emergency_type: event.emergency_type,
        status: event.status,
      },
    });

    return jsonResponse({
      emergencyEvent: mapSafeEmergencyEvent(event),
    });
  } catch (error) {
    console.error("raise-emergency unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to raise emergency.", 500);
  }
});

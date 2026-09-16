import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import { validateAdminUpdateRecurringPassScheduleInput } from "../_shared/admin-recurring-pass.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

interface RecurringPassScheduleRow {
  id: string;
  society_id: string;
  status: string;
  valid_from: string;
  valid_until: string;
  allowed_days_of_week: number[] | null;
  allowed_entry_from_time: string | null;
  allowed_entry_to_time: string | null;
  vehicle_number: string | null;
  notes: string | null;
}

function normalizeSqlTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) {
    return value;
  }
  const hour = String(Number(match[1])).padStart(2, "0");
  return `${hour}:${match[2]}:${match[3] ?? "00"}`;
}

function sameDays(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((day, index) => day === right[index]);
}

function collectScheduleChanges(
  current: RecurringPassScheduleRow,
  next: {
    validFrom: string;
    validUntil: string;
    allowedDaysOfWeek: number[];
    allowedEntryFromTime: string | null;
    allowedEntryToTime: string | null;
    vehicleNumber: string | null;
    notes: string | null;
  },
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (current.valid_from !== next.validFrom) {
    changes.valid_from = { from: current.valid_from, to: next.validFrom };
  }
  if (current.valid_until !== next.validUntil) {
    changes.valid_until = { from: current.valid_until, to: next.validUntil };
  }
  const currentDays = [...(current.allowed_days_of_week ?? [])].sort(
    (left, right) => left - right,
  );
  if (!sameDays(currentDays, next.allowedDaysOfWeek)) {
    changes.allowed_days_of_week = {
      from: currentDays,
      to: next.allowedDaysOfWeek,
    };
  }
  if (
    normalizeSqlTime(current.allowed_entry_from_time) !==
    next.allowedEntryFromTime
  ) {
    changes.allowed_entry_from_time = {
      from: current.allowed_entry_from_time,
      to: next.allowedEntryFromTime,
    };
  }
  if (
    normalizeSqlTime(current.allowed_entry_to_time) !== next.allowedEntryToTime
  ) {
    changes.allowed_entry_to_time = {
      from: current.allowed_entry_to_time,
      to: next.allowedEntryToTime,
    };
  }
  if ((current.vehicle_number ?? null) !== next.vehicleNumber) {
    changes.vehicle_number = {
      from: current.vehicle_number,
      to: next.vehicleNumber,
    };
  }
  if ((current.notes ?? null) !== next.notes) {
    changes.notes = { from: current.notes, to: next.notes };
  }
  return changes;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

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

  const parsed = validateAdminUpdateRecurringPassScheduleInput(body);
  if (!parsed.ok) {
    return errorResponse(parsed.code, parsed.message, parsed.status);
  }

  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { user, society } = auth.context;
  const input = parsed.value;
  const supabase = createServiceClient();

  try {
    const { data: pass, error: passError } = await supabase
      .from("recurring_visitor_passes")
      .select(
        "id, society_id, status, valid_from, valid_until, allowed_days_of_week, allowed_entry_from_time, allowed_entry_to_time, vehicle_number, notes",
      )
      .eq("id", input.passId)
      .eq("society_id", society.id)
      .maybeSingle();

    if (passError) {
      console.error("admin-update-recurring-pass-schedule load error", passError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to update the access schedule.",
        500,
      );
    }

    if (!pass) {
      return errorResponse(
        "NOT_FOUND",
        "Recurring visitor pass was not found.",
        404,
      );
    }

    const row = pass as RecurringPassScheduleRow;

    if (row.status === "revoked") {
      return errorResponse(
        "PASS_REVOKED",
        "A revoked pass cannot have its access schedule edited.",
        409,
      );
    }

    const changes = collectScheduleChanges(row, input);

    const { error: updateError } = await supabase
      .from("recurring_visitor_passes")
      .update({
        valid_from: input.validFrom,
        valid_until: input.validUntil,
        allowed_days_of_week: input.allowedDaysOfWeek,
        allowed_entry_from_time: input.allowedEntryFromTime,
        allowed_entry_to_time: input.allowedEntryToTime,
        vehicle_number: input.vehicleNumber,
        notes: input.notes,
      })
      .eq("id", input.passId)
      .eq("society_id", society.id);

    if (updateError) {
      console.error("admin-update-recurring-pass-schedule update error", updateError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to update the access schedule.",
        500,
      );
    }

    if (Object.keys(changes).length > 0) {
      const { error: eventError } = await supabase
        .from("recurring_visitor_pass_events")
        .insert({
          society_id: society.id,
          pass_id: input.passId,
          event_type: "PASS_UPDATED",
          actor_app_user_id: user.id,
          actor_role: user.role,
          previous_status: row.status,
          new_status: row.status,
          metadata: { changes },
        });

      if (eventError) {
        console.error(
          "admin-update-recurring-pass-schedule event insert error",
          eventError,
        );
      }

      await supabase.rpc("write_audit_log", {
        p_society_id: society.id,
        p_actor_id: user.id,
        p_actor_role: user.role,
        p_action: "recurring_pass.schedule_updated",
        p_entity_type: "recurring_visitor_pass",
        p_entity_id: input.passId,
        p_metadata: { changes },
      });
    }

    return jsonResponse({
      passId: input.passId,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      allowedDaysOfWeek: input.allowedDaysOfWeek,
      allowedEntryFromTime: input.allowedEntryFromTime,
      allowedEntryToTime: input.allowedEntryToTime,
      vehicleNumber: input.vehicleNumber,
      notes: input.notes,
      status: row.status,
    });
  } catch (error) {
    console.error("admin-update-recurring-pass-schedule unexpected error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to update the access schedule.",
      500,
    );
  }
});

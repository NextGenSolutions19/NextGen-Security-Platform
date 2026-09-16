import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import {
  credentialRevokeReasonForPass,
  evaluateRecurringPassLifecycleAction,
  getIstDateString,
  mapRecurringPassMutationError,
  validateAdminRecurringPassLifecycleInput,
} from "../_shared/admin-recurring-pass-lifecycle.ts";
import { sanitizeRecurringPassEventMetadata } from "../_shared/admin-recurring-pass-qr.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

interface RecurringPassRow {
  id: string;
  society_id: string;
  status: string;
  valid_from: string;
  valid_until: string;
}

interface ActiveCredentialRow {
  id: string;
}

async function insertPassEvent(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    societyId: string;
    passId: string;
    eventType: string;
    actorId: string;
    actorRole: string;
    credentialId?: string | null;
    previousStatus: string;
    newStatus: string;
    reason?: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("recurring_visitor_pass_events").insert({
    society_id: input.societyId,
    pass_id: input.passId,
    event_type: input.eventType,
    actor_app_user_id: input.actorId,
    actor_role: input.actorRole,
    credential_id: input.credentialId ?? null,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    reason: input.reason ?? null,
    metadata: sanitizeRecurringPassEventMetadata(input.metadata),
  });
  if (error) {
    console.error("admin-manage-recurring-pass-lifecycle event error", error);
  }
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

  const parsed = validateAdminRecurringPassLifecycleInput(body);
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
      .select("id, society_id, status, valid_from, valid_until")
      .eq("id", input.passId)
      .eq("society_id", society.id)
      .maybeSingle();

    if (passError) {
      console.error(
        "admin-manage-recurring-pass-lifecycle load error",
        passError,
      );
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to update the recurring visitor pass.",
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

    const row = pass as RecurringPassRow;
    const decision = evaluateRecurringPassLifecycleAction({
      pass: {
        societyId: row.society_id,
        status: row.status,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
      },
      jwtSocietyId: society.id,
      action: input.action,
      nextValidUntil: input.validUntil,
      istToday: getIstDateString(),
    });

    if (!decision.ok) {
      return errorResponse(decision.code, decision.message, decision.status);
    }

    if (input.action === "suspend") {
      const { error: updateError } = await supabase
        .from("recurring_visitor_passes")
        .update({
          status: "suspended",
          suspended_at: new Date().toISOString(),
          suspended_by_app_user_id: user.id,
          suspension_reason: input.reason,
        })
        .eq("id", input.passId)
        .eq("society_id", society.id)
        .eq("status", "active");

      if (updateError) {
        const mapped = mapRecurringPassMutationError(updateError);
        if (mapped) {
          return errorResponse(mapped.code, mapped.message, mapped.status);
        }
        console.error(
          "admin-manage-recurring-pass-lifecycle suspend error",
          updateError,
        );
        return errorResponse(
          "INTERNAL_ERROR",
          "Unable to suspend the recurring visitor pass.",
          500,
        );
      }

      await insertPassEvent(supabase, {
        societyId: society.id,
        passId: input.passId,
        eventType: "PASS_SUSPENDED",
        actorId: user.id,
        actorRole: user.role,
        previousStatus: row.status,
        newStatus: "suspended",
        reason: input.reason,
        metadata: { action: "suspend" },
      });

      await supabase.rpc("write_audit_log", {
        p_society_id: society.id,
        p_actor_id: user.id,
        p_actor_role: user.role,
        p_action: "recurring_pass.suspended",
        p_entity_type: "recurring_visitor_pass",
        p_entity_id: input.passId,
        p_metadata: sanitizeRecurringPassEventMetadata({
          reason: input.reason,
        }),
      });

      return jsonResponse({
        passId: input.passId,
        status: "suspended",
      });
    }

    if (input.action === "reactivate") {
      const { error: updateError } = await supabase
        .from("recurring_visitor_passes")
        .update({
          status: "active",
          suspended_at: null,
          suspended_by_app_user_id: null,
          suspension_reason: null,
        })
        .eq("id", input.passId)
        .eq("society_id", society.id)
        .eq("status", "suspended");

      if (updateError) {
        const mapped = mapRecurringPassMutationError(updateError);
        if (mapped) {
          return errorResponse(mapped.code, mapped.message, mapped.status);
        }
        console.error(
          "admin-manage-recurring-pass-lifecycle reactivate error",
          updateError,
        );
        return errorResponse(
          "INTERNAL_ERROR",
          "Unable to reactivate the recurring visitor pass.",
          500,
        );
      }

      await insertPassEvent(supabase, {
        societyId: society.id,
        passId: input.passId,
        eventType: "PASS_REACTIVATED",
        actorId: user.id,
        actorRole: user.role,
        previousStatus: row.status,
        newStatus: "active",
        metadata: { action: "reactivate" },
      });

      await supabase.rpc("write_audit_log", {
        p_society_id: society.id,
        p_actor_id: user.id,
        p_actor_role: user.role,
        p_action: "recurring_pass.reactivated",
        p_entity_type: "recurring_visitor_pass",
        p_entity_id: input.passId,
        p_metadata: sanitizeRecurringPassEventMetadata({
          action: "reactivate",
        }),
      });

      return jsonResponse({
        passId: input.passId,
        status: "active",
      });
    }

    if (input.action === "revoke") {
      const { data: credential } = await supabase
        .from("recurring_visitor_pass_credentials")
        .select("id")
        .eq("pass_id", input.passId)
        .eq("society_id", society.id)
        .is("revoked_at", null)
        .maybeSingle();

      const active = (credential as ActiveCredentialRow | null) ?? null;
      if (active) {
        const { error: credentialError } = await supabase
          .from("recurring_visitor_pass_credentials")
          .update({
            revoked_at: new Date().toISOString(),
            revoked_by_app_user_id: user.id,
            revocation_reason: credentialRevokeReasonForPass(input.reason ?? ""),
          })
          .eq("id", active.id)
          .eq("society_id", society.id)
          .is("revoked_at", null);

        if (credentialError) {
          const mapped = mapRecurringPassMutationError(credentialError);
          if (mapped) {
            return errorResponse(mapped.code, mapped.message, mapped.status);
          }
          console.error(
            "admin-manage-recurring-pass-lifecycle credential revoke error",
            credentialError,
          );
          return errorResponse(
            "CONFLICT",
            "The active QR credential could not be revoked. Try again.",
            409,
          );
        }

        await insertPassEvent(supabase, {
          societyId: society.id,
          passId: input.passId,
          eventType: "CREDENTIAL_REVOKED",
          actorId: user.id,
          actorRole: user.role,
          credentialId: active.id,
          previousStatus: row.status,
          newStatus: row.status,
          reason: credentialRevokeReasonForPass(input.reason ?? ""),
          metadata: { action: "revoke_pass" },
        });
      }

      const { error: updateError } = await supabase
        .from("recurring_visitor_passes")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoked_by_app_user_id: user.id,
          revocation_reason: input.reason,
          suspended_at: null,
          suspended_by_app_user_id: null,
          suspension_reason: null,
        })
        .eq("id", input.passId)
        .eq("society_id", society.id)
        .neq("status", "revoked");

      if (updateError) {
        const mapped = mapRecurringPassMutationError(updateError);
        if (mapped) {
          return errorResponse(mapped.code, mapped.message, mapped.status);
        }
        console.error(
          "admin-manage-recurring-pass-lifecycle revoke error",
          updateError,
        );
        return errorResponse(
          "INTERNAL_ERROR",
          "Unable to revoke the recurring visitor pass.",
          500,
        );
      }

      await insertPassEvent(supabase, {
        societyId: society.id,
        passId: input.passId,
        eventType: "PASS_REVOKED",
        actorId: user.id,
        actorRole: user.role,
        previousStatus: row.status,
        newStatus: "revoked",
        reason: input.reason,
        metadata: { action: "revoke" },
      });

      await supabase.rpc("write_audit_log", {
        p_society_id: society.id,
        p_actor_id: user.id,
        p_actor_role: user.role,
        p_action: "recurring_pass.revoked",
        p_entity_type: "recurring_visitor_pass",
        p_entity_id: input.passId,
        p_metadata: sanitizeRecurringPassEventMetadata({
          reason: input.reason,
        }),
      });

      return jsonResponse({
        passId: input.passId,
        status: "revoked",
      });
    }

    const { error: renewError } = await supabase
      .from("recurring_visitor_passes")
      .update({
        valid_until: input.validUntil,
      })
      .eq("id", input.passId)
      .eq("society_id", society.id)
      .neq("status", "revoked");

    if (renewError) {
      const mapped = mapRecurringPassMutationError(renewError);
      if (mapped) {
        return errorResponse(mapped.code, mapped.message, mapped.status);
      }
      console.error(
        "admin-manage-recurring-pass-lifecycle renew error",
        renewError,
      );
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to renew the recurring visitor pass.",
        500,
      );
    }

    await insertPassEvent(supabase, {
      societyId: society.id,
      passId: input.passId,
      eventType: "VALIDITY_RENEWED",
      actorId: user.id,
      actorRole: user.role,
      previousStatus: row.status,
      newStatus: row.status,
      metadata: {
        previous_valid_until: row.valid_until,
        valid_until: input.validUntil,
      },
    });

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: user.id,
      p_actor_role: user.role,
      p_action: "recurring_pass.validity_renewed",
      p_entity_type: "recurring_visitor_pass",
      p_entity_id: input.passId,
      p_metadata: sanitizeRecurringPassEventMetadata({
        previous_valid_until: row.valid_until,
        valid_until: input.validUntil,
      }),
    });

    return jsonResponse({
      passId: input.passId,
      status: row.status,
      validUntil: input.validUntil,
    });
  } catch (error) {
    console.error(
      "admin-manage-recurring-pass-lifecycle unexpected error",
      error,
    );
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to update the recurring visitor pass.",
      500,
    );
  }
});

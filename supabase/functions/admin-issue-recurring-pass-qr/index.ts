import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import {
  CREDENTIAL_REPLACEMENT_REASON,
  evaluateRecurringPassQrAction,
  generateRecurringPassQrToken,
  isUniqueConstraintError,
  sanitizeRecurringPassEventMetadata,
  validateAdminRecurringPassQrInput,
} from "../_shared/admin-recurring-pass-qr.ts";
import { getIstDateString, mapRecurringPassMutationError } from "../_shared/admin-recurring-pass-lifecycle.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { hashToken } from "../_shared/password.ts";
import { createServiceClient } from "../_shared/supabase.ts";

interface RecurringPassRow {
  id: string;
  society_id: string;
  status: string;
  valid_until: string;
}

interface ActiveCredentialRow {
  id: string;
  issued_at: string;
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

  const parsed = validateAdminRecurringPassQrInput(body);
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
      .select("id, society_id, status, valid_until")
      .eq("id", input.passId)
      .eq("society_id", society.id)
      .maybeSingle();

    if (passError) {
      console.error("admin-issue-recurring-pass-qr load error", passError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to process the QR credential request.",
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

    const { data: credential, error: credentialError } = await supabase
      .from("recurring_visitor_pass_credentials")
      .select("id, issued_at")
      .eq("pass_id", input.passId)
      .eq("society_id", society.id)
      .is("revoked_at", null)
      .maybeSingle();

    if (credentialError) {
      console.error(
        "admin-issue-recurring-pass-qr credential load error",
        credentialError,
      );
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to process the QR credential request.",
        500,
      );
    }

    const active = (credential as ActiveCredentialRow | null) ?? null;
    const decision = evaluateRecurringPassQrAction({
      pass: {
        societyId: row.society_id,
        status: row.status,
        validUntil: row.valid_until,
      },
      jwtSocietyId: society.id,
      action: input.action,
      hasActiveCredential: Boolean(active),
      istToday: getIstDateString(),
    });

    if (!decision.ok) {
      return errorResponse(decision.code, decision.message, decision.status);
    }

    if (input.action === "status") {
      return jsonResponse({
        passId: input.passId,
        hasActiveCredential: Boolean(active),
        issuedAt: active?.issued_at ?? null,
      });
    }

    if (input.action === "replace" && active) {
      const { error: revokeError } = await supabase
        .from("recurring_visitor_pass_credentials")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by_app_user_id: user.id,
          revocation_reason: CREDENTIAL_REPLACEMENT_REASON,
        })
        .eq("id", active.id)
        .eq("society_id", society.id)
        .is("revoked_at", null);

      if (revokeError) {
        const mapped = mapRecurringPassMutationError(revokeError);
        if (mapped) {
          return errorResponse(mapped.code, mapped.message, mapped.status);
        }
        console.error(
          "admin-issue-recurring-pass-qr replace revoke error",
          revokeError,
        );
        return errorResponse(
          "CONFLICT",
          "The existing QR credential could not be replaced. Try again.",
          409,
        );
      }

      const { error: revokeEventError } = await supabase
        .from("recurring_visitor_pass_events")
        .insert({
          society_id: society.id,
          pass_id: input.passId,
          event_type: "CREDENTIAL_REVOKED",
          actor_app_user_id: user.id,
          actor_role: user.role,
          credential_id: active.id,
          previous_status: row.status,
          new_status: row.status,
          reason: CREDENTIAL_REPLACEMENT_REASON,
          metadata: sanitizeRecurringPassEventMetadata({
            action: "replace",
          }),
        });

      if (revokeEventError) {
        console.error(
          "admin-issue-recurring-pass-qr replace event error",
          revokeEventError,
        );
      }
    }

    const rawToken = generateRecurringPassQrToken();
    const tokenHash = await hashToken(rawToken);

    const { data: inserted, error: insertError } = await supabase
      .from("recurring_visitor_pass_credentials")
      .insert({
        pass_id: input.passId,
        society_id: society.id,
        token_hash: tokenHash,
        issued_by_app_user_id: user.id,
      })
      .select("id, issued_at")
      .single();

    if (insertError || !inserted) {
      if (insertError && isUniqueConstraintError(insertError)) {
        return errorResponse(
          "CREDENTIAL_EXISTS",
          "This pass already has an active QR credential.",
          409,
        );
      }
      const mapped = insertError
        ? mapRecurringPassMutationError(insertError)
        : null;
      if (mapped) {
        return errorResponse(mapped.code, mapped.message, mapped.status);
      }
      console.error("admin-issue-recurring-pass-qr insert error", insertError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to issue the QR credential.",
        500,
      );
    }

    const { error: issuedEventError } = await supabase
      .from("recurring_visitor_pass_events")
      .insert({
        society_id: society.id,
        pass_id: input.passId,
        event_type: "CREDENTIAL_ISSUED",
        actor_app_user_id: user.id,
        actor_role: user.role,
        credential_id: inserted.id,
        previous_status: row.status,
        new_status: row.status,
        metadata: sanitizeRecurringPassEventMetadata({
          action: input.action,
        }),
      });

    if (issuedEventError) {
      console.error(
        "admin-issue-recurring-pass-qr issued event error",
        issuedEventError,
      );
    }

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: user.id,
      p_actor_role: user.role,
      p_action:
        input.action === "replace"
          ? "recurring_pass.credential_replaced"
          : "recurring_pass.credential_issued",
      p_entity_type: "recurring_visitor_pass",
      p_entity_id: input.passId,
      p_metadata: sanitizeRecurringPassEventMetadata({
        action: input.action,
        credential_id: inserted.id,
      }),
    });

    return jsonResponse({
      passId: input.passId,
      credentialId: inserted.id,
      issuedAt: inserted.issued_at,
      token: rawToken,
      replaced: input.action === "replace",
    });
  } catch (error) {
    console.error("admin-issue-recurring-pass-qr unexpected error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to process the QR credential request.",
      500,
    );
  }
});

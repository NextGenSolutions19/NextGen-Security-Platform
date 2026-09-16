import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { decodeBase64 } from "jsr:@std/encoding/base64";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import { validateAdminCreateRecurringPassInput } from "../_shared/admin-recurring-pass.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  detectVisitorPhotoContentType,
  isSafeSocietyStoragePath,
  normalizeVisitorPhotoContentType,
  VISITOR_PHOTO_ALLOWED_MIME_TYPE_SET,
  VISITOR_PHOTO_BUCKET,
  VISITOR_PHOTO_MAX_BYTES,
} from "../_shared/storage-config.ts";

const CREATION_FAILED_REASON =
  "Pass creation failed before the required photo was attached.";

function extensionForContentType(contentType: string): string {
  if (contentType.includes("png")) {
    return "png";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }
  return "jpg";
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

  const parsed = validateAdminCreateRecurringPassInput(body);
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

  let binary: Uint8Array;
  try {
    binary = decodeBase64(input.imageBase64);
  } catch {
    return errorResponse("VALIDATION_ERROR", "Photo data is invalid.", 400);
  }

  if (binary.byteLength === 0) {
    return errorResponse("VALIDATION_ERROR", "Photo data is empty.", 400);
  }
  if (binary.byteLength > VISITOR_PHOTO_MAX_BYTES) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Photo exceeds the maximum allowed size.",
      400,
    );
  }
  const claimedContentType = normalizeVisitorPhotoContentType(input.contentType);
  if (!VISITOR_PHOTO_ALLOWED_MIME_TYPE_SET.has(claimedContentType)) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Unsupported photo content type.",
      400,
    );
  }
  const contentType = detectVisitorPhotoContentType(binary);
  if (!contentType || contentType !== claimedContentType) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Photo data is not a supported image.",
      400,
    );
  }

  if (input.flatId) {
    const { data: flat, error: flatError } = await supabase
      .from("flats")
      .select("id, society_id, status")
      .eq("id", input.flatId)
      .eq("society_id", society.id)
      .maybeSingle();

    if (flatError || !flat || flat.status !== "active") {
      return errorResponse("FLAT_NOT_FOUND", "Flat not found.", 404);
    }

    if (input.residentId) {
      const { data: resident, error: residentError } = await supabase
        .from("residents")
        .select("id, society_id, status")
        .eq("id", input.residentId)
        .eq("society_id", society.id)
        .maybeSingle();

      if (residentError || !resident || resident.status !== "active") {
        return errorResponse("RESIDENT_NOT_FOUND", "Resident not found.", 404);
      }
      if (resident.society_id !== society.id) {
        return errorResponse(
          "INVALID_RESIDENT_FLAT_RELATIONSHIP",
          "Resident is not associated with the selected flat.",
          400,
        );
      }

      const { data: residentFlat, error: residentFlatError } = await supabase
        .from("resident_flats")
        .select("id")
        .eq("resident_id", input.residentId)
        .eq("flat_id", input.flatId)
        .eq("society_id", society.id)
        .maybeSingle();

      if (residentFlatError || !residentFlat) {
        return errorResponse(
          "INVALID_RESIDENT_FLAT_RELATIONSHIP",
          "Resident is not associated with the selected flat.",
          400,
        );
      }
    }
  }

  const passId = crypto.randomUUID();
  const storagePath = `${society.id}/recurring-passes/${passId}/${crypto.randomUUID()}.${extensionForContentType(contentType)}`;
  if (!isSafeSocietyStoragePath(storagePath, society.id)) {
    return errorResponse("INTERNAL_ERROR", "Unable to create the recurring visitor pass.", 500);
  }

  let uploadedPath: string | null = null;
  let passInserted = false;
  let photoInserted = false;

  const removeUploadedObject = async () => {
    if (!uploadedPath) {
      return;
    }
    const { error } = await supabase.storage
      .from(VISITOR_PHOTO_BUCKET)
      .remove([uploadedPath]);
    if (error) {
      console.error("admin-create-recurring-pass storage rollback error", error);
    }
  };

  const disableUnusablePass = async () => {
    if (!passInserted || photoInserted) {
      return;
    }
    const { error } = await supabase
      .from("recurring_visitor_passes")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by_app_user_id: user.id,
        revocation_reason: CREATION_FAILED_REASON,
      })
      .eq("id", passId)
      .eq("society_id", society.id)
      .eq("status", "active");
    if (error) {
      console.error("admin-create-recurring-pass pass revoke fallback error", error);
    }
  };

  try {
    const { error: uploadError } = await supabase.storage
      .from(VISITOR_PHOTO_BUCKET)
      .upload(storagePath, binary, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("admin-create-recurring-pass storage error", uploadError);
      return errorResponse(
        "PHOTO_UPLOAD_FAILED",
        "Unable to upload the recurring pass photo.",
        500,
      );
    }
    uploadedPath = storagePath;

    const { error: passError } = await supabase.from("recurring_visitor_passes").insert({
      id: passId,
      society_id: society.id,
      visitor_name: input.visitorName,
      visitor_mobile: input.visitorMobile,
      visitor_type_code: input.visitorTypeCode,
      visitor_type_label: input.visitorTypeLabel,
      flat_id: input.flatId,
      resident_id: input.residentId,
      destination_text: input.destinationText,
      vehicle_number: input.vehicleNumber,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      allowed_days_of_week: input.allowedDaysOfWeek,
      allowed_entry_from_time: input.allowedEntryFromTime,
      allowed_entry_to_time: input.allowedEntryToTime,
      status: "active",
      notes: input.notes,
      created_by_app_user_id: user.id,
    });

    if (passError) {
      console.error("admin-create-recurring-pass pass insert error", passError);
      await removeUploadedObject();
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to create the recurring visitor pass.",
        500,
      );
    }
    passInserted = true;

    const { error: photoError } = await supabase
      .from("recurring_visitor_pass_photos")
      .insert({
        pass_id: passId,
        society_id: society.id,
        storage_bucket: VISITOR_PHOTO_BUCKET,
        storage_path: storagePath,
        content_type: contentType,
        upload_status: "ready",
        created_by_app_user_id: user.id,
      });

    if (photoError) {
      console.error("admin-create-recurring-pass photo insert error", photoError);
      await removeUploadedObject();
      await disableUnusablePass();
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to attach the recurring pass photo.",
        500,
      );
    }
    photoInserted = true;

    const { error: eventError } = await supabase
      .from("recurring_visitor_pass_events")
      .insert({
        society_id: society.id,
        pass_id: passId,
        event_type: "PASS_CREATED",
        actor_app_user_id: user.id,
        actor_role: user.role,
        previous_status: null,
        new_status: "active",
        metadata: {
          visitor_type_code: input.visitorTypeCode,
          visitor_type_label: input.visitorTypeLabel,
        },
      });

    if (eventError) {
      console.error("admin-create-recurring-pass event insert error", eventError);
    }

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: user.id,
      p_actor_role: user.role,
      p_action: "recurring_pass.created",
      p_entity_type: "recurring_visitor_pass",
      p_entity_id: passId,
      p_metadata: {
        visitor_type_code: input.visitorTypeCode,
        visitor_type_label: input.visitorTypeLabel,
      },
    });

    return jsonResponse({
      passId,
      visitorName: input.visitorName,
      visitorTypeCode: input.visitorTypeCode,
      visitorTypeLabel: input.visitorTypeLabel,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    });
  } catch (error) {
    console.error("admin-create-recurring-pass unexpected error", error);
    await removeUploadedObject();
    await disableUnusablePass();
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to create the recurring visitor pass.",
      500,
    );
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { decodeBase64 } from "jsr:@std/encoding/base64";

import { requireActiveGuardDuty } from "../_shared/guard-duty.ts";
import { authenticateGuardRequest } from "../_shared/guard-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  ALLOWED_PHOTO_CONTENT_TYPES,
  getPhotoUploadExpiryDate,
  MAX_PHOTO_BYTES,
  VISITOR_PHOTO_BUCKET,
} from "../_shared/visitor-security.ts";
import {
  detectVisitorPhotoContentType,
  isSafeSocietyStoragePath,
  normalizeVisitorPhotoContentType,
} from "../_shared/storage-config.ts";

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

    const body = await req.json();
    const imageBase64 = String(body?.image_base64 ?? "").trim();
    const claimedContentType = normalizeVisitorPhotoContentType(
      String(body?.content_type ?? "image/jpeg"),
    );

    if (!imageBase64) {
      return errorResponse(
        "VALIDATION_ERROR",
        "image_base64 is required.",
        400,
      );
    }

    if (!ALLOWED_PHOTO_CONTENT_TYPES.has(claimedContentType)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Unsupported photo content type.",
        400,
      );
    }

    const binary = decodeBase64(imageBase64);
    if (binary.byteLength === 0) {
      return errorResponse("VALIDATION_ERROR", "Photo data is empty.", 400);
    }

    if (binary.byteLength > MAX_PHOTO_BYTES) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Photo exceeds the maximum allowed size.",
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

    const supabase = createServiceClient();
    const { user: guardUser, society } = auth.context;
    const duty = await requireActiveGuardDuty(supabase, {
      guardUserId: guardUser.id,
      societyId: society.id,
    });
    if (!duty.ok) {
      return duty.response;
    }
    const extension = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
      ? "webp"
      : "jpg";
    const storagePath =
      `${society.id}/${guardUser.id}/${crypto.randomUUID()}.${extension}`;
    if (!isSafeSocietyStoragePath(storagePath, society.id)) {
      return errorResponse("INTERNAL_ERROR", "Unable to upload photo.", 500);
    }
    const expiresAt = getPhotoUploadExpiryDate();

    const { error: uploadError } = await supabase.storage
      .from(VISITOR_PHOTO_BUCKET)
      .upload(storagePath, binary, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("upload-visitor-photo storage error", uploadError);
      return errorResponse("PHOTO_UPLOAD_FAILED", "Unable to upload photo.", 500);
    }

    const { data: created, error: insertError } = await supabase
      .from("visitor_photo_uploads")
      .insert({
        society_id: society.id,
        created_by_app_user_id: guardUser.id,
        storage_bucket: VISITOR_PHOTO_BUCKET,
        storage_path: storagePath,
        content_type: contentType,
        upload_status: "ready",
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      return errorResponse("INTERNAL_ERROR", "Unable to store photo metadata.", 500);
    }

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: guardUser.id,
      p_actor_role: guardUser.role,
      p_action: "visitor.photo.uploaded",
      p_entity_type: "visitor_photo_upload",
      p_entity_id: created.id,
      p_metadata: {
        storage_bucket: VISITOR_PHOTO_BUCKET,
        storage_path: storagePath,
      },
    });

    return jsonResponse({
      photoUploadId: created.id,
      expiresAt,
    });
  } catch (error) {
    console.error("upload-visitor-photo unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to upload photo.", 500);
  }
});

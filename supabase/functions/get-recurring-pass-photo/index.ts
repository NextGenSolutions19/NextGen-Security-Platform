import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import { validateRecurringPassPhotoRequest } from "../_shared/admin-recurring-pass.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  isSafeSocietyStoragePath,
  VISITOR_PHOTO_BUCKET,
} from "../_shared/storage-config.ts";

const SIGNED_URL_TTL_SECONDS = 180;

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

  const parsed = validateRecurringPassPhotoRequest(body);
  if (!parsed.ok) {
    return errorResponse(parsed.code, parsed.message, parsed.status);
  }

  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { society } = auth.context;
  const { passId } = parsed;
  const supabase = createServiceClient();

  try {
    const { data: pass, error: passError } = await supabase
      .from("recurring_visitor_passes")
      .select("id, society_id")
      .eq("id", passId)
      .eq("society_id", society.id)
      .maybeSingle();

    if (passError || !pass) {
      return errorResponse(
        "NOT_FOUND",
        "Recurring visitor pass was not found.",
        404,
      );
    }

    const { data: photo, error: photoError } = await supabase
      .from("recurring_visitor_pass_photos")
      .select("id, society_id, storage_bucket, storage_path, upload_status")
      .eq("pass_id", passId)
      .eq("society_id", society.id)
      .eq("upload_status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (photoError || !photo) {
      return errorResponse(
        "PHOTO_NOT_FOUND",
        "No recurring pass photo is associated with this pass.",
        404,
      );
    }

    if (photo.society_id !== society.id) {
      return errorResponse(
        "FORBIDDEN",
        "Recurring pass photo does not belong to your society.",
        403,
      );
    }

    if (photo.storage_bucket !== VISITOR_PHOTO_BUCKET) {
      return errorResponse(
        "PHOTO_NOT_READY",
        "Recurring pass photo storage is not available.",
        400,
      );
    }

    const expectedPrefix = `${society.id}/recurring-passes/${passId}/`;
    if (
      !isSafeSocietyStoragePath(photo.storage_path, society.id) ||
      !photo.storage_path.startsWith(expectedPrefix)
    ) {
      return errorResponse(
        "PHOTO_NOT_READY",
        "Recurring pass photo storage is not available.",
        400,
      );
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(VISITOR_PHOTO_BUCKET)
      .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signedError || !signed?.signedUrl) {
      console.error("get-recurring-pass-photo signed URL error", signedError);
      return errorResponse(
        "PHOTO_URL_FAILED",
        "Unable to create a secure photo URL.",
        500,
      );
    }

    const expiresAt = new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    ).toISOString();

    return jsonResponse({
      passId,
      signedUrl: signed.signedUrl,
      expiresAt,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error("get-recurring-pass-photo unexpected error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to retrieve recurring pass photo.",
      500,
    );
  }
});

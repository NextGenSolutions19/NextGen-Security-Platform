import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateSocietyMemberRequest } from "../_shared/society-member-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  isSafeSocietyStoragePath,
  VISITOR_PHOTO_BUCKET,
} from "../_shared/storage-config.ts";

/** Short-lived signed URL lifetime (seconds). Private bucket remains non-public. */
const SIGNED_URL_TTL_SECONDS = 180;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

  try {
    const auth = await authenticateSocietyMemberRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { society } = auth.context;
    const body = await req.json();
    const visitorEntryId = String(body?.visitor_entry_id ?? "").trim();

    if (!visitorEntryId || !UUID_PATTERN.test(visitorEntryId)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "visitor_entry_id must be a valid UUID.",
        400,
      );
    }

    const supabase = createServiceClient();

    const { data: entry, error: entryError } = await supabase
      .from("visitor_entries")
      .select("id, society_id")
      .eq("id", visitorEntryId)
      .eq("society_id", society.id)
      .maybeSingle();

    if (entryError || !entry) {
      return errorResponse("VISITOR_NOT_FOUND", "Visitor entry was not found.", 404);
    }

    const { data: photo, error: photoError } = await supabase
      .from("visitor_photos")
      .select("id, society_id, storage_bucket, storage_path, upload_status")
      .eq("visitor_entry_id", visitorEntryId)
      .eq("society_id", society.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (photoError || !photo) {
      return errorResponse(
        "PHOTO_NOT_FOUND",
        "No visitor photo is associated with this entry.",
        404,
      );
    }

    if (photo.society_id !== society.id) {
      return errorResponse(
        "FORBIDDEN",
        "Visitor photo does not belong to your society.",
        403,
      );
    }

    if (
      photo.storage_bucket !== VISITOR_PHOTO_BUCKET ||
      !isSafeSocietyStoragePath(photo.storage_path, society.id)
    ) {
      return errorResponse(
        "PHOTO_NOT_READY",
        "Visitor photo storage is not available.",
        400,
      );
    }

    if (photo.upload_status !== "ready" && photo.upload_status !== "consumed") {
      return errorResponse(
        "PHOTO_NOT_READY",
        "Visitor photo is not available.",
        400,
      );
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(VISITOR_PHOTO_BUCKET)
      .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signedError || !signed?.signedUrl) {
      console.error("get-visitor-photo signed URL error", signedError);
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
      visitorEntryId,
      signedUrl: signed.signedUrl,
      expiresAt,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error("get-visitor-photo unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to retrieve visitor photo.", 500);
  }
});

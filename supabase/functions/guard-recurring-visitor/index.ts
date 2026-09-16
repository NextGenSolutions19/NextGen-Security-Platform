import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { getIstDateString } from "../_shared/admin-recurring-pass-lifecycle.ts";
import { requireActiveGuardDuty } from "../_shared/guard-duty.ts";
import { authenticateGuardRequest } from "../_shared/guard-auth.ts";
import {
  evaluateRecurringPassUsability,
  formatAllowedDays,
  formatClockTime,
  formatDestinationLabel,
  formatIsoDateDisplay,
  GUARD_RECURRING_MESSAGES,
  isUniqueOpenVisitError,
  sanitizeGuardRecurringMetadata,
  validateGuardRecurringInput,
  resolveCredentialDecision,
} from "../_shared/guard-recurring-pass.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { hashToken } from "../_shared/password.ts";
import {
  isSafeSocietyStoragePath,
  VISITOR_PHOTO_BUCKET,
} from "../_shared/storage-config.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const SIGNED_URL_TTL_SECONDS = 180;
const RECURRING_SERVICE_PURPOSE_CODE = "recurring_service";
const RECURRING_SERVICE_PURPOSE_LABEL = "Recurring Service";

interface PassRow {
  id: string;
  society_id: string;
  visitor_name: string;
  visitor_mobile: string;
  visitor_type_code: string;
  visitor_type_label: string;
  flat_id: string | null;
  resident_id: string | null;
  destination_text: string | null;
  vehicle_number: string | null;
  valid_from: string;
  valid_until: string;
  allowed_days_of_week: number[] | null;
  allowed_entry_from_time: string | null;
  allowed_entry_to_time: string | null;
  status: string;
  flats: { flat_number?: string; wing_building?: string | null } | { flat_number?: string; wing_building?: string | null }[] | null;
  residents: { name?: string } | { name?: string }[] | null;
}

interface CredentialRow {
  id: string;
  pass_id: string;
  society_id: string;
  revoked_at: string | null;
}

const PASS_SELECT =
  "id, society_id, visitor_name, visitor_mobile, visitor_type_code, visitor_type_label, flat_id, resident_id, destination_text, vehicle_number, valid_from, valid_until, allowed_days_of_week, allowed_entry_from_time, allowed_entry_to_time, status, flats(flat_number, wing_building), residents(name)";

function firstEmbed<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toEligibility(row: PassRow) {
  return {
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    allowedDaysOfWeek: row.allowed_days_of_week ?? [],
    allowedEntryFromTime: row.allowed_entry_from_time,
    allowedEntryToTime: row.allowed_entry_to_time,
  };
}

function previewFromPass(
  row: PassRow,
  photo: { signedUrl: string | null; expiresAt: string | null },
) {
  const flat = firstEmbed(row.flats);
  const resident = firstEmbed(row.residents);
  const fromTime = formatClockTime(row.allowed_entry_from_time);
  const toTime = formatClockTime(row.allowed_entry_to_time);
  return {
    passId: row.id,
    visitorName: row.visitor_name,
    visitorMobile: row.visitor_mobile,
    visitorType: row.visitor_type_label,
    destination: formatDestinationLabel({
      destinationText: row.destination_text,
      flatNumber: flat?.flat_number ?? null,
      wingBuilding: flat?.wing_building ?? null,
      residentName: resident?.name ?? null,
    }),
    vehicleNumber: row.vehicle_number,
    validFrom: formatIsoDateDisplay(row.valid_from),
    validUntil: formatIsoDateDisplay(row.valid_until),
    allowedDays: formatAllowedDays(row.allowed_days_of_week ?? []),
    allowedTime: fromTime && toTime ? `${fromTime} – ${toTime}` : "Any time",
    photoSignedUrl: photo.signedUrl,
    photoExpiresAt: photo.expiresAt,
  };
}

async function signPassPhoto(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  passId: string,
): Promise<{ signedUrl: string | null; expiresAt: string | null }> {
  const { data: photo } = await supabase
    .from("recurring_visitor_pass_photos")
    .select("storage_bucket, storage_path, upload_status")
    .eq("pass_id", passId)
    .eq("society_id", societyId)
    .eq("upload_status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    !photo ||
    photo.storage_bucket !== VISITOR_PHOTO_BUCKET ||
    !isSafeSocietyStoragePath(String(photo.storage_path), societyId) ||
    !String(photo.storage_path).startsWith(`${societyId}/recurring-passes/${passId}/`)
  ) {
    return { signedUrl: null, expiresAt: null };
  }

  const { data: signed } = await supabase.storage
    .from(VISITOR_PHOTO_BUCKET)
    .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);

  if (!signed?.signedUrl) {
    return { signedUrl: null, expiresAt: null };
  }

  return {
    signedUrl: signed.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

async function loadReadyPhotoMeta(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  passId: string,
): Promise<{ storage_bucket: string; storage_path: string } | null> {
  const { data: photo } = await supabase
    .from("recurring_visitor_pass_photos")
    .select("storage_bucket, storage_path, upload_status")
    .eq("pass_id", passId)
    .eq("society_id", societyId)
    .eq("upload_status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    !photo ||
    photo.storage_bucket !== VISITOR_PHOTO_BUCKET ||
    !isSafeSocietyStoragePath(String(photo.storage_path), societyId) ||
    !String(photo.storage_path).startsWith(`${societyId}/recurring-passes/${passId}/`)
  ) {
    return null;
  }
  return photo;
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
    visitorEntryId?: string | null;
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
    visitor_entry_id: input.visitorEntryId ?? null,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    reason: input.reason ?? null,
    metadata: sanitizeGuardRecurringMetadata(input.metadata),
  });
  if (error) {
    console.error("guard-recurring-visitor event error", error);
  }
}

async function writeAudit(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    societyId: string;
    actorId: string;
    actorRole: string;
    action: string;
    entityId: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.rpc("write_audit_log", {
    p_society_id: input.societyId,
    p_actor_id: input.actorId,
    p_actor_role: input.actorRole,
    p_action: input.action,
    p_entity_type: "recurring_visitor_pass",
    p_entity_id: input.entityId,
    p_metadata: sanitizeGuardRecurringMetadata(input.metadata),
  });
}

async function findOpenVisit(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  passId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("visitor_entries")
    .select("id")
    .eq("society_id", societyId)
    .eq("recurring_pass_id", passId)
    .eq("status", "checked_in")
    .maybeSingle();
  return Boolean(data);
}

async function loadPassById(
  supabase: ReturnType<typeof createServiceClient>,
  passId: string,
  societyId: string,
): Promise<PassRow | null> {
  const { data, error } = await supabase
    .from("recurring_visitor_passes")
    .select(PASS_SELECT)
    .eq("id", passId)
    .eq("society_id", societyId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as PassRow;
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

  const parsed = validateGuardRecurringInput(body);
  if (!parsed.ok) {
    return errorResponse(parsed.code, parsed.message, parsed.status);
  }

  const auth = await authenticateGuardRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { user, society } = auth.context;
  const input = parsed.value;
  const supabase = createServiceClient();

  try {
    if (
      input.action === "checkin" ||
      input.action === "validate_qr" ||
      input.action === "validate_fallback"
    ) {
      const duty = await requireActiveGuardDuty(supabase, {
        guardUserId: user.id,
        societyId: society.id,
      });
      if (!duty.ok) {
        return duty.response;
      }
    }

    if (input.action === "search") {
      const query = (input.query ?? "").replace(/[%_,()]/g, " ").trim();
      const digits = query.replace(/\D/g, "");
      let builder = supabase
        .from("recurring_visitor_passes")
        .select(PASS_SELECT)
        .eq("society_id", society.id)
        .neq("status", "revoked")
        .order("visitor_name", { ascending: true })
        .limit(20);

      if (digits.length === 10) {
        builder = builder.eq("visitor_mobile", digits);
      } else {
        builder = builder.ilike("visitor_name", `%${query}%`);
      }

      const { data, error } = await builder;

      if (error) {
        console.error("guard-recurring-visitor search error", error);
        return errorResponse(
          "INTERNAL_ERROR",
          "Unable to search recurring visitors.",
          500,
        );
      }

      const items = [];
      for (const row of (data ?? []) as PassRow[]) {
        if (row.society_id !== society.id || row.status === "revoked") {
          continue;
        }
        const photo = await signPassPhoto(supabase, society.id, row.id);
        const expired = row.valid_until < getIstDateString();
        items.push({
          ...previewFromPass(row, photo),
          effectiveStatus: expired ? "expired" : row.status,
        });
      }

      return jsonResponse({ items });
    }

    if (input.action === "validate_qr" || (input.action === "checkin" && input.token)) {
      const tokenHash = await hashToken(input.token as string);
      const { data: credential, error: credentialError } = await supabase
        .from("recurring_visitor_pass_credentials")
        .select("id, pass_id, society_id, revoked_at")
        .eq("token_hash", tokenHash)
        .eq("society_id", society.id)
        .maybeSingle();

      if (credentialError) {
        console.error("guard-recurring-visitor credential lookup error");
        return errorResponse(
          "INTERNAL_ERROR",
          "Unable to validate the recurring visitor pass.",
          500,
        );
      }

      const cred = (credential as CredentialRow | null) ?? null;
      const credentialDecision = resolveCredentialDecision({
        credentialSocietyId: cred?.society_id ?? null,
        credentialRevoked: Boolean(cred?.revoked_at),
        jwtSocietyId: society.id,
      });

      if (!credentialDecision.ok || !cred) {
        await writeAudit(supabase, {
          societyId: society.id,
          actorId: user.id,
          actorRole: user.role,
          action: "recurring_pass.qr_rejected",
          entityId: null,
          metadata: {
            code: credentialDecision.ok ? "INVALID_QR" : credentialDecision.code,
            source: input.source,
          },
        });
        return errorResponse(
          credentialDecision.ok ? "INVALID_QR" : credentialDecision.code,
          credentialDecision.ok
            ? GUARD_RECURRING_MESSAGES.INVALID_QR
            : credentialDecision.message,
          409,
        );
      }

      const pass = await loadPassById(supabase, cred.pass_id, society.id);
      if (!pass || pass.society_id !== society.id) {
        await writeAudit(supabase, {
          societyId: society.id,
          actorId: user.id,
          actorRole: user.role,
          action: "recurring_pass.qr_rejected",
          entityId: null,
          metadata: { code: "TENANT_MISMATCH", source: input.source },
        });
        return errorResponse(
          "INVALID_QR",
          GUARD_RECURRING_MESSAGES.INVALID_QR,
          409,
        );
      }

      const eligibility = evaluateRecurringPassUsability(toEligibility(pass));
      if (!eligibility.ok) {
        await insertPassEvent(supabase, {
          societyId: society.id,
          passId: pass.id,
          eventType: "QR_VALIDATION_REJECTED",
          actorId: user.id,
          actorRole: user.role,
          credentialId: cred.id,
          previousStatus: pass.status,
          newStatus: pass.status,
          metadata: { code: eligibility.code, source: input.source },
        });
        return errorResponse(eligibility.code, eligibility.message, 409);
      }

      if (await findOpenVisit(supabase, society.id, pass.id)) {
        return errorResponse(
          "ALREADY_CHECKED_IN",
          GUARD_RECURRING_MESSAGES.ALREADY_CHECKED_IN,
          409,
        );
      }

      if (input.action === "validate_qr") {
        await insertPassEvent(supabase, {
          societyId: society.id,
          passId: pass.id,
          eventType: "QR_VALIDATED",
          actorId: user.id,
          actorRole: user.role,
          credentialId: cred.id,
          previousStatus: pass.status,
          newStatus: pass.status,
          metadata: { source: input.source },
        });
        const photo = await signPassPhoto(supabase, society.id, pass.id);
        return jsonResponse({
          pass: previewFromPass(pass, photo),
          source: input.source,
        });
      }

      return await completeCheckin(supabase, {
        pass,
        userId: user.id,
        userRole: user.role,
        societyId: society.id,
        source: input.source ?? "CAMERA_QR",
        credentialId: cred.id,
        fallbackReason: null,
      });
    }

    if (
      input.action === "validate_fallback" ||
      (input.action === "checkin" && input.source === "FALLBACK_SEARCH")
    ) {
      const pass = await loadPassById(supabase, input.passId as string, society.id);
      if (!pass || pass.society_id !== society.id) {
        return errorResponse(
          "NOT_FOUND",
          "Recurring visitor was not found.",
          404,
        );
      }

      const eligibility = evaluateRecurringPassUsability(toEligibility(pass));
      if (!eligibility.ok) {
        await insertPassEvent(supabase, {
          societyId: society.id,
          passId: pass.id,
          eventType: "QR_VALIDATION_REJECTED",
          actorId: user.id,
          actorRole: user.role,
          previousStatus: pass.status,
          newStatus: pass.status,
          metadata: { code: eligibility.code, source: "FALLBACK_SEARCH" },
        });
        return errorResponse(eligibility.code, eligibility.message, 409);
      }

      if (await findOpenVisit(supabase, society.id, pass.id)) {
        return errorResponse(
          "ALREADY_CHECKED_IN",
          GUARD_RECURRING_MESSAGES.ALREADY_CHECKED_IN,
          409,
        );
      }

      if (input.action === "validate_fallback") {
        const photo = await signPassPhoto(supabase, society.id, pass.id);
        return jsonResponse({
          pass: previewFromPass(pass, photo),
          source: "FALLBACK_SEARCH",
        });
      }

      return await completeCheckin(supabase, {
        pass,
        userId: user.id,
        userRole: user.role,
        societyId: society.id,
        source: "FALLBACK_SEARCH",
        credentialId: null,
        fallbackReason: input.fallbackReason,
      });
    }

    return errorResponse("VALIDATION_ERROR", "Unsupported action.", 400);
  } catch (error) {
    console.error("guard-recurring-visitor unexpected error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to process the recurring visitor request.",
      500,
    );
  }
});

async function completeCheckin(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    pass: PassRow;
    userId: string;
    userRole: string;
    societyId: string;
    source: string;
    credentialId: string | null;
    fallbackReason: string | null;
  },
): Promise<Response> {
  if (await findOpenVisit(supabase, input.societyId, input.pass.id)) {
    return errorResponse(
      "ALREADY_CHECKED_IN",
      GUARD_RECURRING_MESSAGES.ALREADY_CHECKED_IN,
      409,
    );
  }

  const photoMeta = await loadReadyPhotoMeta(
    supabase,
    input.societyId,
    input.pass.id,
  );
  if (!photoMeta) {
    return errorResponse(
      "PHOTO_NOT_FOUND",
      "This recurring visitor has no photo. Ask Admin to update the pass.",
      409,
    );
  }

  const entryMethod =
    input.source === "FALLBACK_SEARCH" ? "RECURRING_FALLBACK" : "RECURRING_QR";

  const { data: entry, error: insertError } = await supabase
    .from("visitor_entries")
    .insert({
      society_id: input.societyId,
      flat_id: input.pass.flat_id,
      destination_text: input.pass.destination_text,
      resident_id: input.pass.resident_id,
      visitor_name: input.pass.visitor_name,
      visitor_mobile: input.pass.visitor_mobile,
      purpose: RECURRING_SERVICE_PURPOSE_LABEL,
      purpose_code: RECURRING_SERVICE_PURPOSE_CODE,
      purpose_label: RECURRING_SERVICE_PURPOSE_LABEL,
      custom_purpose_text: input.pass.visitor_type_label,
      registration_mode: "register_without_otp",
      verification_method: "OTP_NOT_PERFORMED",
      vehicle_number: input.pass.vehicle_number,
      vehicle_visually_checked: false,
      visitor_photo_upload_id: null,
      notes: input.fallbackReason,
      entry_type: "single",
      visitor_count: 1,
      recurring_pass_id: input.pass.id,
      entry_method: entryMethod,
      created_by_app_user_id: input.userId,
    })
    .select("id, status, check_in_at")
    .single();

  if (insertError || !entry) {
    if (insertError && isUniqueOpenVisitError(insertError)) {
      return errorResponse(
        "ALREADY_CHECKED_IN",
        GUARD_RECURRING_MESSAGES.ALREADY_CHECKED_IN,
        409,
      );
    }
    console.error("guard-recurring-visitor check-in insert error", insertError);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to check in this recurring visitor.",
      500,
    );
  }

  const { error: photoInsertError } = await supabase.from("visitor_photos").insert({
    society_id: input.societyId,
    visitor_entry_id: entry.id,
    storage_bucket: photoMeta.storage_bucket,
    storage_path: photoMeta.storage_path,
    upload_status: "ready",
    created_by_app_user_id: input.userId,
  });

  if (photoInsertError) {
    console.error("guard-recurring-visitor photo associate error", photoInsertError);
    await supabase
      .from("visitor_entries")
      .delete()
      .eq("id", entry.id)
      .eq("society_id", input.societyId);
    return errorResponse(
      "PHOTO_ASSOCIATION_FAILED",
      "Unable to associate the visitor photo with this check-in.",
      500,
    );
  }

  await insertPassEvent(supabase, {
    societyId: input.societyId,
    passId: input.pass.id,
    eventType:
      entryMethod === "RECURRING_FALLBACK"
        ? "CHECKIN_VIA_FALLBACK"
        : "CHECKIN_VIA_QR",
    actorId: input.userId,
    actorRole: input.userRole,
    credentialId: input.credentialId,
    visitorEntryId: entry.id,
    previousStatus: input.pass.status,
    newStatus: input.pass.status,
    reason: input.fallbackReason,
    metadata: { source: input.source },
  });

  await writeAudit(supabase, {
    societyId: input.societyId,
    actorId: input.userId,
    actorRole: input.userRole,
    action: "recurring_pass.checked_in",
    entityId: input.pass.id,
    metadata: {
      source: input.source,
      visitor_entry_id: entry.id,
      entry_method: entryMethod,
    },
  });

  return jsonResponse({
    visitorEntryId: entry.id,
    status: entry.status,
    checkInAt: entry.check_in_at,
    passId: input.pass.id,
  });
}

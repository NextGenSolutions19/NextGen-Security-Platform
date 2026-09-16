import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { requireActiveGuardDuty } from "../_shared/guard-duty.ts";
import { authenticateGuardRequest } from "../_shared/guard-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import {
  evaluateVisitorSecurityPolicy,
  mapSocietySecurityPolicyRow,
  SECURITY_POLICY_LOAD_FAILED_MESSAGE,
} from "../_shared/society-security-policies.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { validateRegisterVisitorInput } from "../_shared/visitor-registration.ts";
import {
  consumeOtpChallenge,
  consumePhotoUpload,
  loadReadyPhotoUpload,
  verifyOtpRegistrationToken,
} from "../_shared/visitor-resources.ts";

interface VisitorEntryRow {
  id: string;
  society_id: string;
  flat_id: string | null;
  destination_text: string | null;
  resident_id: string | null;
  visitor_name: string | null;
  visitor_mobile: string;
  purpose: string;
  purpose_code: string;
  purpose_label: string;
  custom_purpose_text: string | null;
  registration_mode: "verify_with_otp" | "register_without_otp";
  verification_method: "OTP_VERIFIED" | "OTP_NOT_PERFORMED";
  vehicle_number: string | null;
  vehicle_visually_checked: boolean;
  visitor_photo_upload_id: string | null;
  id_type: string | null;
  id_number: string | null;
  notes: string | null;
  otp_fallback_reason: string | null;
  entry_type: "single" | "group";
  visitor_count: number;
  status: "checked_in" | "checked_out";
  check_in_at: string;
  check_out_at: string | null;
  created_by_app_user_id: string;
  created_at: string;
  updated_at: string;
}

function mapVisitorEntry(entry: VisitorEntryRow) {
  return {
    id: entry.id,
    societyId: entry.society_id,
    flatId: entry.flat_id,
    destinationText: entry.destination_text,
    residentId: entry.resident_id,
    visitorName: entry.visitor_name,
    visitorMobile: entry.visitor_mobile,
    purpose: entry.purpose,
    purposeCode: entry.purpose_code,
    purposeLabel: entry.purpose_label,
    customPurposeText: entry.custom_purpose_text,
    registrationMode: entry.registration_mode,
    verificationMethod: entry.verification_method,
    vehicleNumber: entry.vehicle_number,
    vehicleVisuallyChecked: entry.vehicle_visually_checked,
    visitorPhotoUploadId: entry.visitor_photo_upload_id,
    idType: entry.id_type,
    idNumber: entry.id_number,
    notes: entry.notes,
    otpFallbackReason: entry.otp_fallback_reason,
    entryType: entry.entry_type,
    visitorCount: entry.visitor_count,
    status: entry.status,
    checkInAt: entry.check_in_at,
    checkOutAt: entry.check_out_at,
    createdByAppUserId: entry.created_by_app_user_id,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
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
    const body = await req.json();
    const validation = validateRegisterVisitorInput(body);
    if (!validation.ok) {
      return errorResponse(validation.code, validation.message, validation.status);
    }

    const input = validation.value;
    const supabase = createServiceClient();
    const duty = await requireActiveGuardDuty(supabase, {
      guardUserId: guardUser.id,
      societyId: society.id,
    });
    if (!duty.ok) {
      return duty.response;
    }

    const { data: policyRow, error: policyError } = await supabase
      .from("society_security_policies")
      .select("otp_required, resident_selection_required")
      .eq("society_id", society.id)
      .maybeSingle();

    if (policyError) {
      console.error("register-visitor policy load error", policyError);
      return errorResponse(
        "POLICY_UNAVAILABLE",
        SECURITY_POLICY_LOAD_FAILED_MESSAGE,
        503,
      );
    }

    const policy = mapSocietySecurityPolicyRow(policyRow);
    const policyCheck = evaluateVisitorSecurityPolicy({
      policy,
      registrationMode: input.registrationMode,
      otpFallbackReason: input.otpFallbackReason,
      residentId: input.residentId,
      purposeCode: input.purposeCode,
    });
    if (!policyCheck.ok) {
      return errorResponse(policyCheck.code, policyCheck.message, 400);
    }

    const photoResult = await loadReadyPhotoUpload(
      supabase,
      input.photoUploadId,
      society.id,
      guardUser.id,
    );
    if (!photoResult.ok) {
      return errorResponse(photoResult.code, photoResult.message, photoResult.status);
    }

    let otpChallengeId: string | null = null;
    if (input.registrationMode === "verify_with_otp") {
      const otpResult = await verifyOtpRegistrationToken(
        supabase,
        input.otpVerificationToken!,
        input.visitorMobile,
        society.id,
        guardUser.id,
      );
      if (!otpResult.ok) {
        return errorResponse(otpResult.code, otpResult.message, otpResult.status);
      }
      otpChallengeId = otpResult.challengeId;
    }

    const verificationMethod =
      input.registrationMode === "verify_with_otp"
        ? "OTP_VERIFIED"
        : "OTP_NOT_PERFORMED";

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

    const insertPayload = {
      society_id: society.id,
      flat_id: input.flatId,
      destination_text: input.destinationText,
      resident_id: input.residentId,
      visitor_name: input.visitorName,
      visitor_mobile: input.visitorMobile,
      purpose: input.purposeText,
      purpose_code: input.purposeCode,
      purpose_label: input.purposeLabel,
      custom_purpose_text: input.customPurposeText,
      registration_mode: input.registrationMode,
      verification_method: verificationMethod,
      vehicle_number: input.vehicleNumber,
      vehicle_visually_checked: input.vehicleVisuallyChecked,
      visitor_photo_upload_id: input.photoUploadId,
      id_type: input.idType,
      id_number: input.idNumber,
      notes: input.notes,
      otp_fallback_reason: input.otpFallbackReason,
      entry_type: input.entryType,
      visitor_count: input.visitorCount,
      created_by_app_user_id: guardUser.id,
    };

    const { data: entry, error: insertError } = await supabase
      .from("visitor_entries")
      .insert(insertPayload)
      .select(
        "id, society_id, flat_id, destination_text, resident_id, visitor_name, visitor_mobile, purpose, purpose_code, purpose_label, custom_purpose_text, registration_mode, verification_method, vehicle_number, vehicle_visually_checked, visitor_photo_upload_id, id_type, id_number, notes, otp_fallback_reason, entry_type, visitor_count, status, check_in_at, check_out_at, created_by_app_user_id, created_at, updated_at",
      )
      .single();

    if (insertError || !entry) {
      console.error("register-visitor insert error", insertError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to register visitor.",
        500,
      );
    }

    const typedEntry = entry as VisitorEntryRow;

    const { error: photoInsertError } = await supabase.from("visitor_photos").insert({
      society_id: society.id,
      visitor_entry_id: typedEntry.id,
      storage_bucket: photoResult.upload.storage_bucket,
      storage_path: photoResult.upload.storage_path,
      upload_status: "ready",
      created_by_app_user_id: guardUser.id,
    });

    if (photoInsertError) {
      console.error("register-visitor visitor_photos insert error", photoInsertError);

      const { error: rollbackError } = await supabase
        .from("visitor_entries")
        .delete()
        .eq("id", typedEntry.id)
        .eq("society_id", society.id);

      if (rollbackError) {
        console.error(
          "register-visitor rollback visitor_entries failed",
          rollbackError,
        );
      }

      // Do not consume the photo upload so the guard can retry registration.
      return errorResponse(
        "PHOTO_ASSOCIATION_FAILED",
        "Unable to associate the visitor photo with this registration. Please try again.",
        500,
      );
    }

    await consumePhotoUpload(supabase, input.photoUploadId);
    if (otpChallengeId) {
      await consumeOtpChallenge(supabase, otpChallengeId);
    }

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: guardUser.id,
      p_actor_role: guardUser.role,
      p_action: "visitor.registered",
      p_entity_type: "visitor_entry",
      p_entity_id: typedEntry.id,
      p_metadata: {
        flat_id: input.flatId,
        destination_text: input.destinationText,
        resident_id: input.residentId,
        visitor_mobile: input.visitorMobile,
        visitor_name: input.visitorName,
        registration_mode: input.registrationMode,
        verification_method: verificationMethod,
        purpose_code: input.purposeCode,
        vehicle_visually_checked: input.vehicleVisuallyChecked,
        photo_upload_id: input.photoUploadId,
        entry_type: input.entryType,
        visitor_count: input.visitorCount,
      },
    });

    return jsonResponse({
      visitorEntry: mapVisitorEntry(typedEntry),
    }, 201);
  } catch (error) {
    console.error("register-visitor unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to register visitor.", 500);
  }
});

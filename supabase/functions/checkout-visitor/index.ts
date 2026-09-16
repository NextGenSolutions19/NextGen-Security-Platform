import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { requireActiveGuardDuty } from "../_shared/guard-duty.ts";
import { authenticateGuardRequest } from "../_shared/guard-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { validateCheckoutVisitorInput } from "../_shared/visitor-checkout.ts";

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
  entry_type: "single" | "group";
  visitor_count: number;
  status: "checked_in" | "checked_out";
  check_in_at: string;
  check_out_at: string | null;
  created_by_app_user_id: string;
  created_at: string;
  updated_at: string;
}

const VISITOR_ENTRY_SELECT =
  "id, society_id, flat_id, destination_text, resident_id, visitor_name, visitor_mobile, purpose, purpose_code, purpose_label, custom_purpose_text, registration_mode, verification_method, vehicle_number, vehicle_visually_checked, visitor_photo_upload_id, id_type, id_number, notes, entry_type, visitor_count, status, check_in_at, check_out_at, created_by_app_user_id, created_at, updated_at";

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
    const validation = validateCheckoutVisitorInput(body);
    if (!validation.ok) {
      return errorResponse(validation.code, validation.message, validation.status);
    }

    const { visitorEntryId } = validation.value;
    const supabase = createServiceClient();
    const duty = await requireActiveGuardDuty(supabase, {
      guardUserId: guardUser.id,
      societyId: society.id,
    });
    if (!duty.ok) {
      return duty.response;
    }

    const { data: existing, error: loadError } = await supabase
      .from("visitor_entries")
      .select(VISITOR_ENTRY_SELECT)
      .eq("id", visitorEntryId)
      .eq("society_id", society.id)
      .maybeSingle();

    if (loadError || !existing) {
      return errorResponse("VISITOR_NOT_FOUND", "Visitor entry was not found.", 404);
    }

    const entry = existing as VisitorEntryRow;

    if (entry.status === "checked_out") {
      return jsonResponse({
        visitorEntry: mapVisitorEntry(entry),
        alreadyCheckedOut: true,
      });
    }

    const checkedOutAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("visitor_entries")
      .update({
        status: "checked_out",
        check_out_at: checkedOutAt,
      })
      .eq("id", visitorEntryId)
      .eq("society_id", society.id)
      .eq("status", "checked_in")
      .select(VISITOR_ENTRY_SELECT)
      .maybeSingle();

    if (updateError) {
      console.error("checkout-visitor update error", updateError);
      return errorResponse("INTERNAL_ERROR", "Unable to check out visitor.", 500);
    }

    if (!updated) {
      const { data: latest } = await supabase
        .from("visitor_entries")
        .select(VISITOR_ENTRY_SELECT)
        .eq("id", visitorEntryId)
        .eq("society_id", society.id)
        .maybeSingle();

      const latestEntry = latest as VisitorEntryRow | null;
      if (latestEntry?.status === "checked_out") {
        return jsonResponse({
          visitorEntry: mapVisitorEntry(latestEntry),
          alreadyCheckedOut: true,
        });
      }

      return errorResponse(
        "VISITOR_NOT_CHECKED_IN",
        "Visitor is no longer checked in.",
        409,
      );
    }

    const typedEntry = updated as VisitorEntryRow;

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: guardUser.id,
      p_actor_role: guardUser.role,
      p_action: "visitor.checked_out",
      p_entity_type: "visitor_entry",
      p_entity_id: typedEntry.id,
      p_metadata: {
        check_out_at: typedEntry.check_out_at,
        visitor_mobile: typedEntry.visitor_mobile,
        entry_type: typedEntry.entry_type,
        visitor_count: typedEntry.visitor_count,
      },
    });

    return jsonResponse({
      visitorEntry: mapVisitorEntry(typedEntry),
      alreadyCheckedOut: false,
    });
  } catch (error) {
    console.error("checkout-visitor unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to check out visitor.", 500);
  }
});

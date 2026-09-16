import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import {
  validateAdminResidentInput,
  type AdminResidentFormValue,
  type ParsedAdminResidentInput,
} from "../_shared/admin-resident.ts";
import { resolveBuildingAwareSocietyFlat } from "../_shared/resident-flat-identity.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

class AdminResidentBackendLimitationError extends Error {
  readonly code = "BACKEND_FLAT_LIMITATION";

  constructor(message: string) {
    super(message);
    this.name = "AdminResidentBackendLimitationError";
  }
}

interface FlatRow {
  id: string;
  society_id: string;
  flat_number: string;
  wing_building: string | null;
  status: "active" | "disabled";
}

interface ResidentRow {
  id: string;
  society_id: string;
  name: string;
  mobile: string | null;
  resident_type: string | null;
  status: "active" | "disabled";
}

interface ResidentFlatRow {
  id: string;
  society_id: string;
  resident_id: string;
  flat_id: string;
}

function mapResidentResponse(
  link: ResidentFlatRow,
  resident: ResidentRow,
  flat: FlatRow,
) {
  return {
    id: link.id,
    residentId: resident.id,
    flatId: flat.id,
    societyId: resident.society_id,
    flatNumber: flat.flat_number,
    residentName: resident.name,
    mobile: resident.mobile,
    residentType: resident.resident_type,
    wingBuilding: flat.wing_building,
    status: resident.status === "disabled" ? "disabled" : "active",
  };
}

async function loadSocietyFlats(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
): Promise<FlatRow[]> {
  const { data, error } = await supabase
    .from("flats")
    .select("id, society_id, flat_number, wing_building, status")
    .eq("society_id", societyId);

  if (error) {
    throw error;
  }

  return (data as FlatRow[] | null) ?? [];
}

async function resolveSocietyFlat(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  form: AdminResidentFormValue,
  options: { replaceWing: boolean },
): Promise<FlatRow> {
  const flats = await loadSocietyFlats(supabase, societyId);
  const resolved = resolveBuildingAwareSocietyFlat(
    flats.map((flat) => ({
      id: flat.id,
      flatNumber: flat.flat_number,
      wingBuilding: flat.wing_building,
    })),
    {
      wingBuilding: form.wingBuilding,
      flatNumber: form.flatNumber,
    },
  );

  if (resolved.kind === "backend_blocked") {
    throw new AdminResidentBackendLimitationError(resolved.message);
  }

  if (resolved.kind === "match") {
    const existing = flats.find((flat) => flat.id === resolved.flat.id);
    if (!existing) {
      throw new Error("Unable to load matched flat.");
    }

    if (
      options.replaceWing &&
      (existing.wing_building ?? null) !== form.wingBuilding
    ) {
      const { data, error } = await supabase
        .from("flats")
        .update({ wing_building: form.wingBuilding })
        .eq("id", existing.id)
        .eq("society_id", societyId)
        .select("id, society_id, flat_number, wing_building, status")
        .single();

      if (error || !data) {
        throw error ?? new Error("Unable to update flat.");
      }

      return data as FlatRow;
    }

    return existing;
  }

  const { data, error } = await supabase
    .from("flats")
    .insert({
      society_id: societyId,
      flat_number: form.flatNumber,
      wing_building: form.wingBuilding,
      status: "active",
    })
    .select("id, society_id, flat_number, wing_building, status")
    .single();

  if (error?.code === "23505") {
    throw new AdminResidentBackendLimitationError(
      "Valid resident data, but this flat requires building-aware database support before it can be saved.",
    );
  }

  if (error || !data) {
    throw error ?? new Error("Unable to create flat.");
  }

  return data as FlatRow;
}

async function loadSocietyResident(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  residentId: string,
): Promise<ResidentRow | null> {
  const { data, error } = await supabase
    .from("residents")
    .select("id, society_id, name, mobile, resident_type, status")
    .eq("id", residentId)
    .eq("society_id", societyId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ResidentRow | null) ?? null;
}

async function writeAudit(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    societyId: string;
    actorId: string;
    actorRole: "society_admin";
    action: string;
    residentId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.rpc("write_audit_log", {
    p_society_id: params.societyId,
    p_actor_id: params.actorId,
    p_actor_role: params.actorRole,
    p_action: params.action,
    p_entity_type: "resident",
    p_entity_id: params.residentId,
    p_metadata: params.metadata,
  });

  if (error) {
    console.error("admin-resident audit error", error);
  }
}

async function handleCreate(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  actorId: string,
  form: AdminResidentFormValue,
) {
  const flat = await resolveSocietyFlat(supabase, societyId, form, {
    replaceWing: form.wingBuilding !== null,
  });

  const { data: resident, error: residentError } = await supabase
    .from("residents")
    .insert({
      society_id: societyId,
      name: form.residentName,
      mobile: form.mobile,
      resident_type: form.residentType,
      status: "active",
    })
    .select("id, society_id, name, mobile, resident_type, status")
    .single();

  if (residentError || !resident) {
    throw residentError ?? new Error("Unable to create resident.");
  }

  const typedResident = resident as ResidentRow;

  const { data: link, error: linkError } = await supabase
    .from("resident_flats")
    .insert({
      society_id: societyId,
      resident_id: typedResident.id,
      flat_id: flat.id,
    })
    .select("id, society_id, resident_id, flat_id")
    .single();

  if (linkError || !link) {
    throw linkError ?? new Error("Unable to link resident to flat.");
  }

  await writeAudit(supabase, {
    societyId,
    actorId,
    actorRole: "society_admin",
    action: "RESIDENT_CREATED",
    residentId: typedResident.id,
    metadata: {
      flat_number: flat.flat_number,
      resident_name: typedResident.name,
    },
  });

  return mapResidentResponse(link as ResidentFlatRow, typedResident, flat);
}

async function handleUpdate(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  actorId: string,
  residentId: string,
  residentFlatId: string,
  form: AdminResidentFormValue,
) {
  const resident = await loadSocietyResident(supabase, societyId, residentId);
  if (!resident) {
    return null;
  }

  const { data: link, error: linkError } = await supabase
    .from("resident_flats")
    .select("id, society_id, resident_id, flat_id")
    .eq("id", residentFlatId)
    .eq("society_id", societyId)
    .eq("resident_id", residentId)
    .maybeSingle();

  if (linkError) {
    throw linkError;
  }

  if (!link) {
    return null;
  }

  const typedLink = link as ResidentFlatRow;
  const flat = await resolveSocietyFlat(supabase, societyId, form, {
    replaceWing: true,
  });

  const { data: updatedResident, error: residentError } = await supabase
    .from("residents")
    .update({
      name: form.residentName,
      mobile: form.mobile,
      resident_type: form.residentType,
    })
    .eq("id", residentId)
    .eq("society_id", societyId)
    .select("id, society_id, name, mobile, resident_type, status")
    .single();

  if (residentError || !updatedResident) {
    throw residentError ?? new Error("Unable to update resident.");
  }

  if (typedLink.flat_id !== flat.id) {
    const { error: relinkError } = await supabase
      .from("resident_flats")
      .update({ flat_id: flat.id })
      .eq("id", typedLink.id)
      .eq("society_id", societyId)
      .eq("resident_id", residentId);

    if (relinkError) {
      throw relinkError;
    }
  }

  const { data: updatedLink, error: updatedLinkError } = await supabase
    .from("resident_flats")
    .select("id, society_id, resident_id, flat_id")
    .eq("id", typedLink.id)
    .maybeSingle();

  if (updatedLinkError || !updatedLink) {
    throw updatedLinkError ?? new Error("Unable to load updated resident.");
  }

  const { data: updatedFlat, error: updatedFlatError } = await supabase
    .from("flats")
    .select("id, society_id, flat_number, wing_building, status")
    .eq("id", flat.id)
    .eq("society_id", societyId)
    .maybeSingle();

  if (updatedFlatError || !updatedFlat) {
    throw updatedFlatError ?? new Error("Unable to load updated flat.");
  }

  await writeAudit(supabase, {
    societyId,
    actorId,
    actorRole: "society_admin",
    action: "RESIDENT_UPDATED",
    residentId,
    metadata: {
      flat_number: (updatedFlat as FlatRow).flat_number,
      resident_name: (updatedResident as ResidentRow).name,
    },
  });

  return mapResidentResponse(
    updatedLink as ResidentFlatRow,
    updatedResident as ResidentRow,
    updatedFlat as FlatRow,
  );
}

async function handleStatusChange(
  supabase: ReturnType<typeof createServiceClient>,
  societyId: string,
  actorId: string,
  input: Extract<ParsedAdminResidentInput, { action: "archive" | "reactivate" }>,
) {
  const resident = await loadSocietyResident(
    supabase,
    societyId,
    input.residentId,
  );
  if (!resident) {
    return null;
  }

  const nextStatus = input.action === "archive" ? "disabled" : "active";
  const { data: updated, error } = await supabase
    .from("residents")
    .update({ status: nextStatus })
    .eq("id", input.residentId)
    .eq("society_id", societyId)
    .select("id, society_id, name, mobile, resident_type, status")
    .single();

  if (error || !updated) {
    throw error ?? new Error("Unable to update resident status.");
  }

  await writeAudit(supabase, {
    societyId,
    actorId,
    actorRole: "society_admin",
    action:
      input.action === "archive" ? "RESIDENT_ARCHIVED" : "RESIDENT_REACTIVATED",
    residentId: input.residentId,
    metadata: {
      status: nextStatus,
      resident_name: (updated as ResidentRow).name,
    },
  });

  return updated as ResidentRow;
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
    const auth = await authenticateAdminRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { user, society } = auth.context;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(
        "VALIDATION_ERROR",
        "Request body must be valid JSON.",
      );
    }

    const validation = validateAdminResidentInput(body);
    if (!validation.ok) {
      return errorResponse(validation.code, validation.message, validation.status);
    }

    const supabase = createServiceClient();
    const input = validation.value;

    if (input.action === "create") {
      const resident = await handleCreate(
        supabase,
        society.id,
        user.id,
        input.form,
      );
      return jsonResponse({ resident });
    }

    if (input.action === "update") {
      const resident = await handleUpdate(
        supabase,
        society.id,
        user.id,
        input.residentId,
        input.residentFlatId,
        input.form,
      );
      if (!resident) {
        return errorResponse("NOT_FOUND", "Resident not found.", 404);
      }
      return jsonResponse({ resident });
    }

    const updated = await handleStatusChange(
      supabase,
      society.id,
      user.id,
      input,
    );
    if (!updated) {
      return errorResponse("NOT_FOUND", "Resident not found.", 404);
    }

    return jsonResponse({
      resident: {
        residentId: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    if (error instanceof AdminResidentBackendLimitationError) {
      return errorResponse(error.code, error.message, 409);
    }
    console.error("admin-resident unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to save resident.", 500);
  }
});

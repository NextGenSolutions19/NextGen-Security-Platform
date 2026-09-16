import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import {
  ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC,
  parseAdminConfirmResidentImportRowResult,
  processResidentImportConfirmRows,
  type PersistResidentImportConfirmResult,
  type ResidentImportConfirmWrite,
} from "../_shared/resident-import-confirm.ts";
import {
  buildAdminConfirmResidentImportRpcArgs,
  buildResidentImportConfirmSafeLog,
  mapResidentImportConfirmApplicationResult,
  parseResidentImportConfirmHttpRequest,
  sanitizeResidentImportConfirmRpcFailure,
  sanitizeResidentImportConfirmServerError,
  toResidentImportConfirmHttpSuccess,
} from "../_shared/resident-import-confirm-http.ts";
import type { ResidentImportExistingResident } from "../_shared/resident-import-verify.ts";
import { createServiceClient } from "../_shared/supabase.ts";

interface FlatEmbed {
  society_id?: string;
  flat_number?: string;
  wing_building?: string | null;
}

interface ResidentEmbed {
  id?: string;
  society_id?: string;
  name?: string;
  mobile?: string | null;
  status?: "active" | "disabled";
}

interface ResidentFlatRow {
  society_id: string;
  resident_id: string;
  flats: FlatEmbed | FlatEmbed[] | null;
  residents: ResidentEmbed | ResidentEmbed[] | null;
}

interface ContactRow {
  society_id: string;
  resident_id: string;
  mobile_digits: string;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapExistingResidents(
  links: ResidentFlatRow[],
  contacts: ContactRow[],
  societyId: string,
): ResidentImportExistingResident[] {
  const mobilesByResident = new Map<string, string[]>();
  for (const contact of contacts) {
    if (contact.society_id !== societyId) {
      continue;
    }
    const list = mobilesByResident.get(contact.resident_id) ?? [];
    list.push(contact.mobile_digits);
    mobilesByResident.set(contact.resident_id, list);
  }

  const existing: ResidentImportExistingResident[] = [];
  for (const link of links) {
    if (link.society_id !== societyId) {
      continue;
    }
    const flat = firstEmbed(link.flats);
    const resident = firstEmbed(link.residents);
    if (!flat || !resident) {
      continue;
    }
    if (flat.society_id && flat.society_id !== societyId) {
      continue;
    }
    if (resident.society_id && resident.society_id !== societyId) {
      continue;
    }
    if (!flat.flat_number || !resident.name) {
      continue;
    }
    existing.push({
      societyId,
      residentName: resident.name,
      flatNumber: flat.flat_number,
      wingBuilding: flat.wing_building ?? null,
      primaryMobile: resident.mobile ?? null,
      additionalMobiles: resident.id
        ? (mobilesByResident.get(resident.id) ?? [])
        : [],
      status: resident.status === "disabled" ? "disabled" : "active",
    });
  }
  return existing;
}

async function writeAudit(
  supabase: ServiceClient,
  params: {
    societyId: string;
    actorId: string;
    residentId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.rpc("write_audit_log", {
    p_society_id: params.societyId,
    p_actor_id: params.actorId,
    p_actor_role: "society_admin",
    p_action: "RESIDENT_CREATED",
    p_entity_type: "resident",
    p_entity_id: params.residentId,
    p_metadata: params.metadata,
  });

  if (error) {
    console.error("admin-resident-import-confirm audit error");
  }
}

async function persistResidentImportConfirmWrite(
  supabase: ServiceClient,
  societyId: string,
  actorId: string,
  write: ResidentImportConfirmWrite,
  additionalMobiles: readonly string[],
): Promise<PersistResidentImportConfirmResult> {
  const args = buildAdminConfirmResidentImportRpcArgs({
    societyId,
    write,
    additionalMobiles,
  });
  const { data, error } = await supabase.rpc(
    ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC,
    {
      p_society_id: args.p_society_id,
      p_row_number: args.p_row_number,
      p_flat_number: args.p_flat_number,
      p_resident_name: args.p_resident_name,
      p_resident_type: args.p_resident_type,
      p_mobile: args.p_mobile,
      p_wing_building: args.p_wing_building,
      p_additional_mobiles: args.p_additional_mobiles,
    },
  );

  if (error) {
    console.error(
      "admin-resident-import-confirm rpc error",
      buildResidentImportConfirmSafeLog({
        societyId,
        rowNumber: write.rowNumber,
        result: "SERVER_ERROR",
      }),
    );
    return sanitizeResidentImportConfirmRpcFailure();
  }

  const parsed = parseAdminConfirmResidentImportRowResult(data);
  if (!parsed) {
    return {
      ok: false,
      status: "FAILED",
      message: "The confirm write returned an invalid result.",
    };
  }

  if (parsed.status !== "IMPORTED") {
    return {
      ok: false,
      status: parsed.status,
      message: parsed.message,
    };
  }

  if (parsed.residentId) {
    await writeAudit(supabase, {
      societyId,
      actorId,
      residentId: parsed.residentId,
      metadata: {
        source: "resident_import_confirm",
        excel_row: write.rowNumber,
        flat_number: parsed.flatNumber ?? write.flatNumber,
        resident_name: parsed.residentName ?? write.residentName,
      },
    });
  }

  return {
    ok: true,
    existing: {
      societyId,
      residentName: parsed.residentName ?? write.residentName,
      flatNumber: parsed.flatNumber ?? write.flatNumber,
      wingBuilding: parsed.wingBuilding ?? write.wingBuilding,
      primaryMobile: parsed.mobile ?? write.mobile,
      additionalMobiles: [],
      status: "active",
    },
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
    const auth = await authenticateAdminRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const societyId = auth.context.society.id;
    const actorId = auth.context.user.id;

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

    const parsed = parseResidentImportConfirmHttpRequest(body);
    if (!parsed.ok) {
      return errorResponse(parsed.code, parsed.message, parsed.status);
    }

    const additionalByRow = new Map(
      parsed.rows.map((row) => [row.rowNumber, row.additionalMobiles]),
    );

    const supabase = createServiceClient();
    const { data: links, error: linkError } = await supabase
      .from("resident_flats")
      .select(
        "society_id, resident_id, flats(society_id, flat_number, wing_building), residents(id, society_id, name, mobile, status)",
      )
      .eq("society_id", societyId);

    if (linkError) {
      console.error(
        "admin-resident-import-confirm load error",
        buildResidentImportConfirmSafeLog({
          societyId,
          rowNumber: 0,
          result: "SERVER_ERROR",
        }),
      );
      const sanitized = sanitizeResidentImportConfirmServerError();
      return errorResponse(sanitized.code, sanitized.message, sanitized.status);
    }

    let contacts: ContactRow[] = [];
    const { data: contactData, error: contactError } = await supabase
      .from("resident_contact_numbers")
      .select("society_id, resident_id, mobile_digits")
      .eq("society_id", societyId);

    if (!contactError && Array.isArray(contactData)) {
      contacts = contactData as ContactRow[];
    }

    const existing = mapExistingResidents(
      (links as ResidentFlatRow[] | null) ?? [],
      contacts,
      societyId,
    );

    const result = await processResidentImportConfirmRows({
      proposed: parsed.rows,
      existing,
      societyId,
      persist: (write) =>
        persistResidentImportConfirmWrite(
          supabase,
          societyId,
          actorId,
          write,
          additionalByRow.get(write.rowNumber) ?? [],
        ),
    });

    for (const row of result.rows) {
      console.info(
        "admin-resident-import-confirm",
        buildResidentImportConfirmSafeLog({
          societyId,
          rowNumber: row.rowNumber,
          result: mapResidentImportConfirmApplicationResult(row.status),
        }),
      );
    }

    return jsonResponse(toResidentImportConfirmHttpSuccess(result));
  } catch {
    const sanitized = sanitizeResidentImportConfirmServerError();
    console.error(
      "admin-resident-import-confirm error",
      buildResidentImportConfirmSafeLog({
        societyId: "unknown",
        rowNumber: 0,
        result: sanitized.code,
      }),
    );
    return errorResponse(sanitized.code, sanitized.message, sanitized.status);
  }
});

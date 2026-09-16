import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authenticateAdminRequest } from "../_shared/admin-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import {
  classifyResidentImportAgainstDatabase,
  parseResidentImportVerifyRequest,
  type ResidentImportExistingResident,
} from "../_shared/resident-import-verify.ts";
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

    const parsed = parseResidentImportVerifyRequest(body);
    if (!parsed.ok) {
      return errorResponse(parsed.code, parsed.message, parsed.status);
    }

    const supabase = createServiceClient();
    const { data: links, error: linkError } = await supabase
      .from("resident_flats")
      .select(
        "society_id, resident_id, flats(society_id, flat_number, wing_building), residents(id, society_id, name, mobile, status)",
      )
      .eq("society_id", societyId);

    if (linkError) {
      console.error("admin-resident-import-verify load error", linkError);
      return errorResponse(
        "QUERY_FAILED",
        "Unable to verify against existing residents.",
        500,
      );
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

    const result = classifyResidentImportAgainstDatabase({
      proposed: parsed.rows,
      existing,
      societyId,
    });

    return jsonResponse(result);
  } catch (error) {
    console.error("admin-resident-import-verify error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to verify against existing residents.",
      500,
    );
  }
});

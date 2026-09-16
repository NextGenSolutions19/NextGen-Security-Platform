import type {
  VisitorEntryType,
  VisitorListItem,
  VisitorRegistrationMode,
  VisitorVerificationMethod,
} from "@nextgen/shared";
import { readStoredDestinationText, readStoredVisitorName, VisitorError } from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

interface FlatEmbed {
  flat_number: string;
  wing_building?: string | null;
}

interface ResidentEmbed {
  name: string;
}

interface VisitorEntryListRow {
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
  registration_mode: VisitorRegistrationMode;
  verification_method: VisitorVerificationMethod;
  vehicle_number: string | null;
  vehicle_visually_checked: boolean;
  visitor_photo_upload_id: string | null;
  id_type: string | null;
  id_number: string | null;
  notes: string | null;
  entry_type: VisitorEntryType;
  visitor_count: number;
  status: "checked_in" | "checked_out";
  check_in_at: string;
  check_out_at: string | null;
  created_by_app_user_id: string;
  created_at: string;
  updated_at: string;
  flats: FlatEmbed | FlatEmbed[] | null;
  residents: ResidentEmbed | ResidentEmbed[] | null;
}

function assertSupabaseClient(accessToken: string) {
  if (!isSupabaseConfigured()) {
    throw new VisitorError(
      "Backend is not configured.",
      "BACKEND_NOT_CONFIGURED",
    );
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new VisitorError("Unable to initialize backend client.", "UNKNOWN");
  }

  return supabase;
}

function normalizeEmbeddedFlat(
  flats: VisitorEntryListRow["flats"],
): FlatEmbed | null {
  if (!flats) {
    return null;
  }

  return Array.isArray(flats) ? flats[0] ?? null : flats;
}

function normalizeEmbeddedResident(
  residents: VisitorEntryListRow["residents"],
): ResidentEmbed | null {
  if (!residents) {
    return null;
  }

  return Array.isArray(residents) ? residents[0] ?? null : residents;
}

function mapVisitorListItem(row: VisitorEntryListRow): VisitorListItem {
  const flat = normalizeEmbeddedFlat(row.flats);
  const resident = normalizeEmbeddedResident(row.residents);

  return {
    id: row.id,
    societyId: row.society_id,
    flatId: row.flat_id,
    destinationText: readStoredDestinationText(row.destination_text),
    residentId: row.resident_id,
    visitorName: readStoredVisitorName(row.visitor_name),
    visitorMobile: row.visitor_mobile,
    purpose: row.purpose,
    purposeCode: row.purpose_code,
    purposeLabel: row.purpose_label,
    customPurposeText: row.custom_purpose_text,
    registrationMode: row.registration_mode,
    verificationMethod: row.verification_method,
    vehicleNumber: row.vehicle_number,
    vehicleVisuallyChecked: row.vehicle_visually_checked,
    visitorPhotoUploadId: row.visitor_photo_upload_id,
    idType: row.id_type,
    idNumber: row.id_number,
    notes: row.notes,
    entryType: row.entry_type ?? "single",
    visitorCount: row.visitor_count ?? 1,
    status: row.status,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    createdByAppUserId: row.created_by_app_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    flatNumber: flat?.flat_number ?? "",
    residentName: resident?.name ?? null,
    wingBuilding: flat?.wing_building ?? null,
  };
}

export async function listCheckedInVisitors(
  accessToken: string,
): Promise<VisitorListItem[]> {
  const supabase = assertSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("visitor_entries")
    .select(
      `
      id,
      society_id,
      flat_id,
      destination_text,
      resident_id,
      visitor_name,
      visitor_mobile,
      purpose,
      purpose_code,
      purpose_label,
      custom_purpose_text,
      registration_mode,
      verification_method,
      vehicle_number,
      vehicle_visually_checked,
      visitor_photo_upload_id,
      id_type,
      id_number,
      notes,
      entry_type,
      visitor_count,
      status,
      check_in_at,
      check_out_at,
      created_by_app_user_id,
      created_at,
      updated_at,
      flats(flat_number, wing_building),
      residents(name)
    `,
    )
    .eq("status", "checked_in")
    .order("check_in_at", { ascending: false });

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return (data as VisitorEntryListRow[]).map(mapVisitorListItem);
}

const VISITOR_HISTORY_DEFAULT_LIMIT = 100;

export async function listCheckedOutVisitors(
  accessToken: string,
  limit = VISITOR_HISTORY_DEFAULT_LIMIT,
): Promise<VisitorListItem[]> {
  const supabase = assertSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("visitor_entries")
    .select(
      `
      id,
      society_id,
      flat_id,
      destination_text,
      resident_id,
      visitor_name,
      visitor_mobile,
      purpose,
      purpose_code,
      purpose_label,
      custom_purpose_text,
      registration_mode,
      verification_method,
      vehicle_number,
      vehicle_visually_checked,
      visitor_photo_upload_id,
      id_type,
      id_number,
      notes,
      entry_type,
      visitor_count,
      status,
      check_in_at,
      check_out_at,
      created_by_app_user_id,
      created_at,
      updated_at,
      flats(flat_number, wing_building),
      residents(name)
    `,
    )
    .eq("status", "checked_out")
    .order("check_out_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return (data as VisitorEntryListRow[]).map(mapVisitorListItem);
}

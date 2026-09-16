import {
  sortAdminVisitorHistoryNewestFirst,
  VisitorError,
  type VisitorEntryType,
  type VisitorListItem,
  type VisitorRegistrationMode,
  type VisitorVerificationMethod,
  readStoredDestinationText,
  readStoredVisitorName,
} from "@nextgen/shared";
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

interface AdminVisitorEntryRow {
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

const VISITOR_HISTORY_SELECT = `
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
`;

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
  flats: AdminVisitorEntryRow["flats"],
): FlatEmbed | null {
  if (!flats) {
    return null;
  }

  return Array.isArray(flats) ? (flats[0] ?? null) : flats;
}

function normalizeEmbeddedResident(
  residents: AdminVisitorEntryRow["residents"],
): ResidentEmbed | null {
  if (!residents) {
    return null;
  }

  return Array.isArray(residents) ? (residents[0] ?? null) : residents;
}

function mapAdminVisitorHistoryItem(
  row: AdminVisitorEntryRow,
  jwtSocietyId: string,
): VisitorListItem | null {
  if (row.society_id !== jwtSocietyId) {
    return null;
  }

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
    idType: null,
    idNumber: null,
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

export async function listAdminSocietyVisitorHistory(
  accessToken: string,
  jwtSocietyId: string,
): Promise<VisitorListItem[]> {
  if (!jwtSocietyId) {
    throw new VisitorError("Society context is missing.", "FORBIDDEN");
  }

  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("visitor_entries")
    .select(VISITOR_HISTORY_SELECT)
    .order("check_in_at", { ascending: false });

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  const mapped = ((data as AdminVisitorEntryRow[]) ?? [])
    .map((row) => mapAdminVisitorHistoryItem(row, jwtSocietyId))
    .filter((item): item is VisitorListItem => item !== null);

  return sortAdminVisitorHistoryNewestFirst(mapped);
}

export async function getAdminSocietyVisitorEntry(
  accessToken: string,
  jwtSocietyId: string,
  entryId: string,
): Promise<VisitorListItem | null> {
  if (!jwtSocietyId || !entryId) {
    throw new VisitorError("Society context is missing.", "FORBIDDEN");
  }

  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("visitor_entries")
    .select(VISITOR_HISTORY_SELECT)
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  if (!data) {
    return null;
  }

  return mapAdminVisitorHistoryItem(data as AdminVisitorEntryRow, jwtSocietyId);
}

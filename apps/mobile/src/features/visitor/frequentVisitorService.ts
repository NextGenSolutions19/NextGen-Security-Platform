import {
  VisitorError,
  deriveFrequentVisitors,
  normalizeFrequentVisitorMobile,
  selectFrequentVisitorHistory,
  type FrequentVisitorHistoryVisit,
  type FrequentVisitorItem,
  type VisitorEntryType,
  type VisitorRegistrationMode,
  type VisitorVerificationMethod,
  type VisitorVisitRecord,
  readStoredDestinationText,
  readStoredVisitorName,
  resolveVisitorDestinationLabel,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

interface FlatEmbed {
  flat_number: string;
}

interface ResidentEmbed {
  name: string;
}

interface FrequentVisitorSummaryRow {
  id: string;
  visitor_name: string | null;
  visitor_mobile: string;
  purpose: string;
  purpose_label: string;
  purpose_code: string | null;
  custom_purpose_text: string | null;
  check_in_at: string;
  entry_type: VisitorEntryType | null;
  visitor_count: number | null;
  flat_id: string | null;
  destination_text: string | null;
  flats: FlatEmbed | FlatEmbed[] | null;
  residents: ResidentEmbed | ResidentEmbed[] | null;
}

interface FrequentVisitorHistoryRow {
  id: string;
  visitor_name: string | null;
  visitor_mobile: string;
  purpose: string;
  purpose_label: string;
  purpose_code: string | null;
  custom_purpose_text: string | null;
  registration_mode: VisitorRegistrationMode | null;
  verification_method: VisitorVerificationMethod | null;
  vehicle_number: string | null;
  notes: string | null;
  id_type: string | null;
  id_number: string | null;
  entry_type: VisitorEntryType | null;
  visitor_count: number | null;
  status: "checked_in" | "checked_out";
  check_in_at: string;
  check_out_at: string | null;
  flat_id: string | null;
  destination_text: string | null;
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
  flats: FlatEmbed | FlatEmbed[] | null,
): FlatEmbed | null {
  if (!flats) {
    return null;
  }

  return Array.isArray(flats) ? (flats[0] ?? null) : flats;
}

function normalizeEmbeddedResident(
  residents: ResidentEmbed | ResidentEmbed[] | null,
): ResidentEmbed | null {
  if (!residents) {
    return null;
  }

  return Array.isArray(residents) ? (residents[0] ?? null) : residents;
}

function mapVisitRecord(row: FrequentVisitorSummaryRow): VisitorVisitRecord {
  const flat = normalizeEmbeddedFlat(row.flats);
  const resident = normalizeEmbeddedResident(row.residents);

  return {
    id: row.id,
    visitorName: readStoredVisitorName(row.visitor_name),
    visitorMobile: row.visitor_mobile,
    purpose: row.purpose,
    purposeLabel: row.purpose_label,
    purposeCode: row.purpose_code,
    customPurposeText: row.custom_purpose_text,
    flatNumber: resolveVisitorDestinationLabel({
      flatId: row.flat_id,
      flatNumber: flat?.flat_number ?? "",
      destinationText: readStoredDestinationText(row.destination_text),
    }),
    destinationText: readStoredDestinationText(row.destination_text),
    residentName: resident?.name ?? null,
    checkInAt: row.check_in_at,
    entryType: row.entry_type ?? "single",
    visitorCount: row.visitor_count ?? 1,
  };
}

function mapHistoryVisit(row: FrequentVisitorHistoryRow): FrequentVisitorHistoryVisit {
  const flat = normalizeEmbeddedFlat(row.flats);
  const resident = normalizeEmbeddedResident(row.residents);

  return {
    id: row.id,
    visitorName: readStoredVisitorName(row.visitor_name),
    visitorMobile: row.visitor_mobile,
    purpose: row.purpose,
    purposeLabel: row.purpose_label,
    purposeCode: row.purpose_code,
    customPurposeText: row.custom_purpose_text,
    flatNumber: resolveVisitorDestinationLabel({
      flatId: row.flat_id,
      flatNumber: flat?.flat_number ?? "",
      destinationText: readStoredDestinationText(row.destination_text),
    }),
    destinationText: readStoredDestinationText(row.destination_text),
    residentName: resident?.name ?? null,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    status: row.status,
    entryType: row.entry_type ?? "single",
    visitorCount: row.visitor_count ?? 1,
    verificationMethod: row.verification_method ?? "OTP_NOT_PERFORMED",
    registrationMode: row.registration_mode ?? "register_without_otp",
    vehicleNumber: row.vehicle_number,
    notes: row.notes,
    idType: row.id_type,
    idNumber: row.id_number,
  };
}

export async function listFrequentVisitors(
  accessToken: string,
): Promise<FrequentVisitorItem[]> {
  const supabase = assertSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("visitor_entries")
    .select(
      `
      id,
      visitor_name,
      visitor_mobile,
      purpose,
      purpose_label,
      purpose_code,
      custom_purpose_text,
      check_in_at,
      entry_type,
      visitor_count,
      flat_id,
      destination_text,
      flats(flat_number),
      residents(name)
    `,
    )
    .order("check_in_at", { ascending: false });

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return deriveFrequentVisitors(
    (data as FrequentVisitorSummaryRow[]).map(mapVisitRecord),
  );
}

export async function listFrequentVisitorHistory(
  accessToken: string,
  routeMobile: string,
): Promise<FrequentVisitorHistoryVisit[]> {
  const visitorMobile = normalizeFrequentVisitorMobile(routeMobile);
  if (!visitorMobile) {
    return [];
  }

  const supabase = assertSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("visitor_entries")
    .select(
      `
      id,
      visitor_name,
      visitor_mobile,
      purpose,
      purpose_label,
      purpose_code,
      custom_purpose_text,
      registration_mode,
      verification_method,
      vehicle_number,
      notes,
      id_type,
      id_number,
      entry_type,
      visitor_count,
      status,
      check_in_at,
      check_out_at,
      flat_id,
      destination_text,
      flats(flat_number),
      residents(name)
    `,
    )
    .eq("visitor_mobile", visitorMobile)
    .order("check_in_at", { ascending: false });

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return selectFrequentVisitorHistory(
    (data as FrequentVisitorHistoryRow[]).map(mapHistoryVisit),
    visitorMobile,
  );
}

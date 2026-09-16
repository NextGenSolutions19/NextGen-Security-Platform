import { VisitorError, type AdminResidentDirectoryItem } from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

interface FlatEmbed {
  id: string;
  flat_number: string;
  wing_building: string | null;
  status: "active" | "disabled";
}

interface ResidentEmbed {
  id: string;
  name: string;
  mobile: string | null;
  resident_type: string | null;
  status: "active" | "disabled";
}

interface AdminResidentFlatDirectoryRow {
  id: string;
  society_id: string;
  resident_id: string;
  flat_id: string;
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
  flats: AdminResidentFlatDirectoryRow["flats"],
): FlatEmbed | null {
  if (!flats) {
    return null;
  }

  return Array.isArray(flats) ? (flats[0] ?? null) : flats;
}

function normalizeEmbeddedResident(
  residents: AdminResidentFlatDirectoryRow["residents"],
): ResidentEmbed | null {
  if (!residents) {
    return null;
  }

  return Array.isArray(residents) ? (residents[0] ?? null) : residents;
}

function mapAdminResidentDirectoryItem(
  row: AdminResidentFlatDirectoryRow,
  jwtSocietyId: string,
): AdminResidentDirectoryItem | null {
  if (row.society_id !== jwtSocietyId) {
    return null;
  }

  const flat = normalizeEmbeddedFlat(row.flats);
  const resident = normalizeEmbeddedResident(row.residents);

  if (!flat || !resident) {
    return null;
  }

  return {
    id: row.id,
    residentId: resident.id,
    flatId: flat.id,
    societyId: row.society_id,
    flatNumber: flat.flat_number,
    residentName: resident.name,
    mobile: resident.mobile,
    residentType: resident.resident_type,
    wingBuilding: flat.wing_building,
    status: resident.status === "disabled" ? "disabled" : "active",
  };
}

function compareAdminDirectoryItems(
  left: AdminResidentDirectoryItem,
  right: AdminResidentDirectoryItem,
): number {
  const flatCompare = left.flatNumber.localeCompare(right.flatNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  });

  if (flatCompare !== 0) {
    return flatCompare;
  }

  return left.residentName.localeCompare(right.residentName, undefined, {
    sensitivity: "base",
  });
}

export async function listAdminSocietyResidents(
  accessToken: string,
  jwtSocietyId: string,
): Promise<AdminResidentDirectoryItem[]> {
  if (!jwtSocietyId) {
    throw new VisitorError("Society context is missing.", "FORBIDDEN");
  }

  const supabase = assertSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("resident_flats")
    .select(
      `
      id,
      society_id,
      resident_id,
      flat_id,
      flats(id, flat_number, wing_building, status),
      residents(id, name, mobile, resident_type, status)
    `,
    );

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return (data as AdminResidentFlatDirectoryRow[])
    .map((row) => mapAdminResidentDirectoryItem(row, jwtSocietyId))
    .filter((item): item is AdminResidentDirectoryItem => item !== null)
    .sort(compareAdminDirectoryItems);
}

export async function getAdminSocietyResident(
  accessToken: string,
  jwtSocietyId: string,
  residentFlatId: string,
): Promise<AdminResidentDirectoryItem | null> {
  if (!jwtSocietyId || !residentFlatId) {
    throw new VisitorError("Society context is missing.", "FORBIDDEN");
  }

  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("resident_flats")
    .select(
      `
      id,
      society_id,
      resident_id,
      flat_id,
      flats(id, flat_number, wing_building, status),
      residents(id, name, mobile, resident_type, status)
    `,
    )
    .eq("id", residentFlatId)
    .maybeSingle();

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  if (!data) {
    return null;
  }

  return mapAdminResidentDirectoryItem(
    data as AdminResidentFlatDirectoryRow,
    jwtSocietyId,
  );
}

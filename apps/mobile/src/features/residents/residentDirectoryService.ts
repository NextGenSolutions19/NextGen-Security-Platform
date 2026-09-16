import { VisitorError, type ResidentDirectoryItem } from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

interface FlatEmbed {
  id: string;
  flat_number: string;
  wing_building?: string | null;
  status: "active" | "disabled";
}

interface ResidentEmbed {
  id: string;
  name: string;
  mobile: string | null;
  status: "active" | "disabled";
}

interface ResidentFlatDirectoryRow {
  id: string;
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
  flats: ResidentFlatDirectoryRow["flats"],
): FlatEmbed | null {
  if (!flats) {
    return null;
  }

  return Array.isArray(flats) ? (flats[0] ?? null) : flats;
}

function normalizeEmbeddedResident(
  residents: ResidentFlatDirectoryRow["residents"],
): ResidentEmbed | null {
  if (!residents) {
    return null;
  }

  return Array.isArray(residents) ? (residents[0] ?? null) : residents;
}

function mapResidentDirectoryItem(
  row: ResidentFlatDirectoryRow,
): ResidentDirectoryItem | null {
  const flat = normalizeEmbeddedFlat(row.flats);
  const resident = normalizeEmbeddedResident(row.residents);

  if (!flat || flat.status !== "active") {
    return null;
  }

  if (!resident || resident.status !== "active") {
    return null;
  }

  return {
    id: row.id,
    residentId: resident.id,
    flatId: flat.id,
    flatNumber: flat.flat_number,
    residentName: resident.name,
    mobile: resident.mobile,
    wingBuilding: flat.wing_building ?? null,
  };
}

function compareDirectoryItems(
  left: ResidentDirectoryItem,
  right: ResidentDirectoryItem,
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

export async function listSocietyResidents(
  accessToken: string,
): Promise<ResidentDirectoryItem[]> {
  const supabase = assertSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("resident_flats")
    .select(
      `
      id,
      resident_id,
      flat_id,
      flats(id, flat_number, wing_building, status),
      residents(id, name, mobile, status)
    `,
    );

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return (data as ResidentFlatDirectoryRow[])
    .map(mapResidentDirectoryItem)
    .filter((item): item is ResidentDirectoryItem => item !== null)
    .sort(compareDirectoryItems);
}

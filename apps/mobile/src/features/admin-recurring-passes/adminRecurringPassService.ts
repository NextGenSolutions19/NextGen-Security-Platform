import {
  RECURRING_PASS_REVOKED_EDIT_MESSAGE,
  RECURRING_PASS_REVOKED_LIFECYCLE_MESSAGE,
  VisitorError,
  isRecurringPassQrToken,
  isRecurringVisitorPassStatus,
  isRecurringVisitorTypeCode,
  resolveAdminRecurringPassDestinationLabel,
  sortAdminRecurringVisitorPasses,
  type AdminCreateRecurringPassPayload,
  type AdminRecurringPassSchedulePayload,
  type AdminRecurringVisitorPassListItem,
  type FlatSummary,
  type LinkedResident,
  type RecurringVisitorPassStatus,
  type RecurringVisitorTypeCode,
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

interface AdminRecurringPassRow {
  id: string;
  society_id: string;
  visitor_name: string;
  visitor_mobile: string;
  visitor_type_code: string;
  visitor_type_label: string;
  flat_id: string | null;
  resident_id: string | null;
  destination_text: string | null;
  vehicle_number: string | null;
  valid_from: string;
  valid_until: string;
  allowed_days_of_week: number[] | null;
  allowed_entry_from_time: string | null;
  allowed_entry_to_time: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  flats: FlatEmbed | FlatEmbed[] | null;
  residents: ResidentEmbed | ResidentEmbed[] | null;
}

const RECURRING_PASS_LIST_SELECT = `
  id,
  society_id,
  visitor_name,
  visitor_mobile,
  visitor_type_code,
  visitor_type_label,
  flat_id,
  resident_id,
  destination_text,
  vehicle_number,
  valid_from,
  valid_until,
  allowed_days_of_week,
  allowed_entry_from_time,
  allowed_entry_to_time,
  status,
  notes,
  created_at,
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
  flats: AdminRecurringPassRow["flats"],
): FlatEmbed | null {
  if (!flats) {
    return null;
  }
  return Array.isArray(flats) ? (flats[0] ?? null) : flats;
}

function normalizeEmbeddedResident(
  residents: AdminRecurringPassRow["residents"],
): ResidentEmbed | null {
  if (!residents) {
    return null;
  }
  return Array.isArray(residents) ? (residents[0] ?? null) : residents;
}

function asStatus(value: string): RecurringVisitorPassStatus | null {
  return isRecurringVisitorPassStatus(value) ? value : null;
}

function asTypeCode(value: string): RecurringVisitorTypeCode | null {
  return isRecurringVisitorTypeCode(value) ? value : null;
}

function mapAdminRecurringPassItem(
  row: AdminRecurringPassRow,
  jwtSocietyId: string,
): AdminRecurringVisitorPassListItem | null {
  if (row.society_id !== jwtSocietyId) {
    return null;
  }

  const status = asStatus(row.status);
  const visitorTypeCode = asTypeCode(row.visitor_type_code);
  if (!status || !visitorTypeCode) {
    return null;
  }

  const flat = normalizeEmbeddedFlat(row.flats);
  const resident = normalizeEmbeddedResident(row.residents);
  const flatNumber = flat?.flat_number ?? null;
  const wingBuilding = flat?.wing_building ?? null;
  const destinationText = row.destination_text;

  return {
    id: row.id,
    societyId: row.society_id,
    visitorName: row.visitor_name,
    visitorMobile: row.visitor_mobile,
    visitorTypeCode,
    visitorTypeLabel: row.visitor_type_label,
    flatId: row.flat_id,
    flatNumber,
    wingBuilding,
    residentId: row.resident_id,
    residentName: resident?.name ?? null,
    destinationText,
    destinationLabel: resolveAdminRecurringPassDestinationLabel({
      flatId: row.flat_id,
      flatNumber,
      wingBuilding,
      destinationText,
    }),
    vehicleNumber: row.vehicle_number,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    allowedDaysOfWeek: Array.isArray(row.allowed_days_of_week)
      ? row.allowed_days_of_week
      : [],
    allowedEntryFromTime: row.allowed_entry_from_time,
    allowedEntryToTime: row.allowed_entry_to_time,
    status,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function listAdminSocietyRecurringPasses(
  accessToken: string,
  jwtSocietyId: string,
): Promise<AdminRecurringVisitorPassListItem[]> {
  if (!jwtSocietyId) {
    throw new VisitorError("Society context is missing.", "FORBIDDEN");
  }

  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("recurring_visitor_passes")
    .select(RECURRING_PASS_LIST_SELECT);

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return sortAdminRecurringVisitorPasses(
    (data as AdminRecurringPassRow[])
      .map((row) => mapAdminRecurringPassItem(row, jwtSocietyId))
      .filter((item): item is AdminRecurringVisitorPassListItem => item !== null),
  );
}

export async function getAdminSocietyRecurringPass(
  accessToken: string,
  jwtSocietyId: string,
  passId: string,
): Promise<AdminRecurringVisitorPassListItem | null> {
  if (!jwtSocietyId || !passId) {
    throw new VisitorError("Society context is missing.", "FORBIDDEN");
  }

  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("recurring_visitor_passes")
    .select(RECURRING_PASS_LIST_SELECT)
    .eq("id", passId)
    .maybeSingle();

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  if (!data) {
    return null;
  }

  return mapAdminRecurringPassItem(data as AdminRecurringPassRow, jwtSocietyId);
}

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
}

interface FlatRow {
  id: string;
  flat_number: string;
  society_id: string;
  status: FlatSummary["status"];
  wing_building?: string | null;
}

interface ResidentFlatRow {
  resident_id: string;
  residents:
    | {
        id: string;
        name: string;
        mobile: string | null;
        status: LinkedResident["status"];
      }
    | {
        id: string;
        name: string;
        mobile: string | null;
        status: LinkedResident["status"];
      }[]
    | null;
}

export interface RecurringPassPhotoSignedUrlResult {
  passId: string;
  signedUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface CreatedRecurringPassResult {
  passId: string;
  visitorName: string;
  visitorTypeCode: RecurringVisitorTypeCode;
  visitorTypeLabel: string;
  validFrom: string;
  validUntil: string;
}

export interface RecurringPassQrStatusResult {
  passId: string;
  hasActiveCredential: boolean;
  issuedAt: string | null;
}

export interface IssuedRecurringPassQrResult {
  passId: string;
  credentialId: string;
  issuedAt: string;
  token: string;
  replaced: boolean;
}

function formatFunctionErrorMessage(body: FunctionErrorBody): string | null {
  const code = body.error?.code ?? body.code;
  const message = body.error?.message ?? body.message;
  if (!message) {
    return null;
  }
  if (code && code !== "INTERNAL_ERROR") {
    return `${message} (${code})`;
  }
  return message;
}

async function readFunctionError(
  error: unknown,
): Promise<{ code?: string; message: string | null }> {
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.json()) as FunctionErrorBody;
      return {
        code: body.error?.code ?? body.code,
        message: formatFunctionErrorMessage(body),
      };
    } catch {
      return { message: null };
    }
  }
  return { message: null };
}

function mapScheduleUpdateError(parsed: {
  code?: string;
  message: string | null;
}): string {
  if (parsed.code === "UNAUTHORIZED") {
    return "Your session has expired. Please login again.";
  }
  if (parsed.code === "FORBIDDEN" || parsed.code === "ACCOUNT_DISABLED") {
    return parsed.message ?? "You do not have permission to perform this action.";
  }
  if (parsed.code === "NOT_FOUND") {
    return "Recurring visitor pass was not found.";
  }
  if (parsed.code === "PASS_REVOKED") {
    return RECURRING_PASS_REVOKED_EDIT_MESSAGE;
  }
  if (parsed.code === "VALIDATION_ERROR" && parsed.message) {
    return parsed.message.replace(/\s*\([A-Z0-9_]+\)$/, "");
  }
  return "Unable to update the access schedule.";
}

function normalizeEmbeddedResidentRow(
  residents: ResidentFlatRow["residents"],
): LinkedResident | null {
  if (!residents) {
    return null;
  }
  const resident = Array.isArray(residents) ? residents[0] : residents;
  if (!resident || resident.status !== "active") {
    return null;
  }
  return {
    id: resident.id,
    name: resident.name,
    mobile: resident.mobile,
    status: resident.status,
  };
}

export async function listAdminSocietyActiveFlats(
  accessToken: string,
  jwtSocietyId: string,
): Promise<FlatSummary[]> {
  if (!jwtSocietyId) {
    throw new VisitorError("Society context is missing.", "FORBIDDEN");
  }

  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("flats")
    .select("id, flat_number, society_id, status, wing_building")
    .eq("status", "active")
    .order("flat_number", { ascending: true });

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return (data as FlatRow[])
    .filter((row) => row.society_id === jwtSocietyId)
    .map((row) => ({
      id: row.id,
      flatNumber: row.flat_number,
      societyId: row.society_id,
      status: row.status,
      wingBuilding: row.wing_building ?? null,
    }));
}

export async function listAdminLinkedResidentsForFlat(
  accessToken: string,
  jwtSocietyId: string,
  flatId: string,
): Promise<LinkedResident[]> {
  if (!jwtSocietyId || !flatId) {
    throw new VisitorError("Society context is missing.", "FORBIDDEN");
  }

  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("resident_flats")
    .select("resident_id, residents(id, name, mobile, status)")
    .eq("flat_id", flatId)
    .eq("society_id", jwtSocietyId);

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return (data as ResidentFlatRow[])
    .map((row) => normalizeEmbeddedResidentRow(row.residents))
    .filter((resident): resident is LinkedResident => resident !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createAdminRecurringPass(
  accessToken: string,
  payload: AdminCreateRecurringPassPayload,
  photo: { imageBase64: string; contentType: string },
): Promise<CreatedRecurringPassResult> {
  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase.functions.invoke<
    CreatedRecurringPassResult & FunctionErrorBody
  >("admin-create-recurring-pass", {
    body: {
      visitor_name: payload.visitorName,
      visitor_mobile: payload.visitorMobile,
      visitor_type_code: payload.visitorTypeCode,
      custom_visitor_type:
        payload.visitorTypeCode === "OTHER" ? payload.visitorTypeLabel : undefined,
      flat_id: payload.flatId ?? undefined,
      resident_id: payload.residentId ?? undefined,
      destination_text: payload.destinationText ?? undefined,
      vehicle_number: payload.vehicleNumber ?? undefined,
      valid_from: payload.validFrom,
      valid_until: payload.validUntil,
      allowed_days_of_week: payload.allowedDaysOfWeek,
      allowed_entry_from_time: payload.allowedEntryFromTime ?? undefined,
      allowed_entry_to_time: payload.allowedEntryToTime ?? undefined,
      notes: payload.notes ?? undefined,
      image_base64: photo.imageBase64,
      content_type: photo.contentType,
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const parsed = await readFunctionError(error);
    throw new VisitorError(
      parsed.message ?? "Unable to create the recurring visitor pass.",
      "UNKNOWN",
    );
  }

  const responseBody = data as FunctionErrorBody & CreatedRecurringPassResult;
  const responseError = formatFunctionErrorMessage(responseBody);
  if (responseError) {
    throw new VisitorError(responseError, "UNKNOWN");
  }
  if (!responseBody?.passId) {
    throw new VisitorError("Unable to create the recurring visitor pass.", "UNKNOWN");
  }

  return {
    passId: responseBody.passId,
    visitorName: responseBody.visitorName,
    visitorTypeCode: isRecurringVisitorTypeCode(responseBody.visitorTypeCode)
      ? responseBody.visitorTypeCode
      : payload.visitorTypeCode,
    visitorTypeLabel: responseBody.visitorTypeLabel,
    validFrom: responseBody.validFrom,
    validUntil: responseBody.validUntil,
  };
}

export async function getRecurringPassPhotoSignedUrl(
  accessToken: string,
  passId: string,
): Promise<RecurringPassPhotoSignedUrlResult> {
  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase.functions.invoke<
    RecurringPassPhotoSignedUrlResult & FunctionErrorBody
  >("get-recurring-pass-photo", {
    body: { pass_id: passId },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const parsed = await readFunctionError(error);
    throw new VisitorError(
      parsed.message ?? "Unable to load the recurring pass photo.",
      "PHOTO_ERROR",
    );
  }

  const responseBody = data as FunctionErrorBody & RecurringPassPhotoSignedUrlResult;
  const responseError = formatFunctionErrorMessage(responseBody);
  if (responseError) {
    throw new VisitorError(responseError, "PHOTO_ERROR");
  }
  if (!responseBody?.signedUrl) {
    throw new VisitorError("Unable to load the recurring pass photo.", "PHOTO_ERROR");
  }

  return {
    passId: responseBody.passId,
    signedUrl: responseBody.signedUrl,
    expiresAt: responseBody.expiresAt,
    expiresInSeconds: responseBody.expiresInSeconds,
  };
}

export async function updateAdminRecurringPassSchedule(
  accessToken: string,
  passId: string,
  payload: AdminRecurringPassSchedulePayload,
): Promise<void> {
  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase.functions.invoke<FunctionErrorBody>(
    "admin-update-recurring-pass-schedule",
    {
      body: {
        pass_id: passId,
        valid_from: payload.validFrom,
        valid_until: payload.validUntil,
        allowed_days_of_week: payload.allowedDaysOfWeek,
        allowed_entry_from_time: payload.allowedEntryFromTime ?? undefined,
        allowed_entry_to_time: payload.allowedEntryToTime ?? undefined,
        vehicle_number: payload.vehicleNumber ?? undefined,
        notes: payload.notes ?? undefined,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    throw new VisitorError(
      mapScheduleUpdateError(await readFunctionError(error)),
      "UNKNOWN",
    );
  }

  const responseError = formatFunctionErrorMessage(data as FunctionErrorBody);
  if (responseError) {
    throw new VisitorError(
      mapScheduleUpdateError({
        code: data?.error?.code ?? data?.code,
        message: responseError,
      }),
      "UNKNOWN",
    );
  }
}

function mapAdminActionError(
  parsed: { code?: string; message: string | null },
  fallback: string,
): string {
  if (parsed.code === "UNAUTHORIZED") {
    return "Your session has expired. Please login again.";
  }
  if (parsed.code === "FORBIDDEN" || parsed.code === "ACCOUNT_DISABLED") {
    return parsed.message ?? "You do not have permission to perform this action.";
  }
  if (parsed.code === "NOT_FOUND") {
    return "Recurring visitor pass was not found.";
  }
  if (parsed.code === "PASS_REVOKED") {
    return parsed.message ?? RECURRING_PASS_REVOKED_LIFECYCLE_MESSAGE;
  }
  if (parsed.message) {
    return parsed.message.replace(/\s*\([A-Z0-9_]+\)$/, "");
  }
  return fallback;
}

export async function getAdminRecurringPassQrStatus(
  accessToken: string,
  passId: string,
): Promise<RecurringPassQrStatusResult> {
  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase.functions.invoke<
    RecurringPassQrStatusResult & FunctionErrorBody
  >("admin-issue-recurring-pass-qr", {
    body: { action: "status", pass_id: passId },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new VisitorError(
      mapAdminActionError(
        await readFunctionError(error),
        "Unable to load QR credential status.",
      ),
      "UNKNOWN",
    );
  }

  const responseError = formatFunctionErrorMessage(data as FunctionErrorBody);
  if (responseError) {
    throw new VisitorError(
      mapAdminActionError(
        { code: data?.error?.code ?? data?.code, message: responseError },
        "Unable to load QR credential status.",
      ),
      "UNKNOWN",
    );
  }

  return {
    passId: data?.passId ?? passId,
    hasActiveCredential: Boolean(data?.hasActiveCredential),
    issuedAt: data?.issuedAt ?? null,
  };
}

async function invokeIssueRecurringPassQr(
  accessToken: string,
  passId: string,
  action: "issue" | "replace",
): Promise<IssuedRecurringPassQrResult> {
  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase.functions.invoke<
    IssuedRecurringPassQrResult & FunctionErrorBody
  >("admin-issue-recurring-pass-qr", {
    body: { action, pass_id: passId },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new VisitorError(
      mapAdminActionError(
        await readFunctionError(error),
        "Unable to issue the QR credential.",
      ),
      "UNKNOWN",
    );
  }

  const responseError = formatFunctionErrorMessage(data as FunctionErrorBody);
  if (responseError) {
    throw new VisitorError(
      mapAdminActionError(
        { code: data?.error?.code ?? data?.code, message: responseError },
        "Unable to issue the QR credential.",
      ),
      "UNKNOWN",
    );
  }

  if (!data?.token || !isRecurringPassQrToken(data.token)) {
    throw new VisitorError("Unable to issue the QR credential.", "UNKNOWN");
  }

  return {
    passId: data.passId,
    credentialId: data.credentialId,
    issuedAt: data.issuedAt,
    token: data.token,
    replaced: Boolean(data.replaced),
  };
}

export async function issueAdminRecurringPassQr(
  accessToken: string,
  passId: string,
): Promise<IssuedRecurringPassQrResult> {
  return invokeIssueRecurringPassQr(accessToken, passId, "issue");
}

export async function replaceAdminRecurringPassQr(
  accessToken: string,
  passId: string,
): Promise<IssuedRecurringPassQrResult> {
  return invokeIssueRecurringPassQr(accessToken, passId, "replace");
}

async function invokeLifecycleAction(
  accessToken: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<void> {
  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase.functions.invoke<FunctionErrorBody>(
    "admin-manage-recurring-pass-lifecycle",
    {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    throw new VisitorError(
      mapAdminActionError(await readFunctionError(error), fallback),
      "UNKNOWN",
    );
  }

  const responseError = formatFunctionErrorMessage(data as FunctionErrorBody);
  if (responseError) {
    throw new VisitorError(
      mapAdminActionError(
        { code: data?.error?.code ?? data?.code, message: responseError },
        fallback,
      ),
      "UNKNOWN",
    );
  }
}

export async function suspendAdminRecurringPass(
  accessToken: string,
  passId: string,
  reason: string,
): Promise<void> {
  await invokeLifecycleAction(
    accessToken,
    { action: "suspend", pass_id: passId, reason },
    "Unable to suspend the recurring visitor pass.",
  );
}

export async function reactivateAdminRecurringPass(
  accessToken: string,
  passId: string,
): Promise<void> {
  await invokeLifecycleAction(
    accessToken,
    { action: "reactivate", pass_id: passId },
    "Unable to reactivate the recurring visitor pass.",
  );
}

export async function revokeAdminRecurringPass(
  accessToken: string,
  passId: string,
  reason: string,
): Promise<void> {
  await invokeLifecycleAction(
    accessToken,
    { action: "revoke", pass_id: passId, reason },
    "Unable to revoke the recurring visitor pass.",
  );
}

export async function renewAdminRecurringPassValidity(
  accessToken: string,
  passId: string,
  validUntil: string,
): Promise<void> {
  await invokeLifecycleAction(
    accessToken,
    { action: "renew", pass_id: passId, valid_until: validUntil },
    "Unable to renew the recurring visitor pass.",
  );
}

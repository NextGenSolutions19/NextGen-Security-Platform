import type {
  FlatSummary,
  LinkedResident,
  OtpChallengeResult,
  OtpVerificationResult,
  PhotoUploadResult,
  RegisterVisitorFormInput,
  VisitorEntry,
  VisitorErrorCode,
} from "@nextgen/shared";
import { VisitorError } from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";
import {
  readDevOtpClientToken,
  sanitizeOtpChallengeResult,
} from "@/features/visitor/devOtpHint";

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
}

function formatFunctionErrorMessage(body: FunctionErrorBody): string | null {
  const code = body.error?.code ?? body.code;
  const message = body.error?.message ?? body.message;
  if (!message) {
    return null;
  }

  if (code === "GUARD_OFF_DUTY") {
    return message;
  }

  if (code && code !== "INTERNAL_ERROR") {
    return `${message} (${code})`;
  }

  return message;
}

interface RegisterVisitorResponse {
  visitorEntry: VisitorEntry;
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

function mapVisitorErrorCode(code?: string): VisitorErrorCode {
  switch (code) {
    case "VALIDATION_ERROR":
      return "VALIDATION_ERROR";
    case "FORBIDDEN":
    case "GUARD_OFF_DUTY":
      return "FORBIDDEN";
    case "FLAT_NOT_FOUND":
    case "RESIDENT_NOT_FOUND":
    case "INVALID_RESIDENT_FLAT_RELATIONSHIP":
    case "PHOTO_NOT_FOUND":
    case "PHOTO_NOT_READY":
    case "PHOTO_EXPIRED":
    case "PHOTO_ALREADY_USED":
    case "PHOTO_ASSOCIATION_FAILED":
      return "NOT_FOUND";
    case "OTP_NOT_FOUND":
    case "OTP_INVALID":
    case "OTP_EXPIRED":
    case "OTP_VERIFICATION_INVALID":
    case "OTP_VERIFICATION_EXPIRED":
    case "OTP_RATE_LIMITED":
      return "OTP_ERROR";
    case "PHOTO_UPLOAD_FAILED":
    case "PHOTO_URL_FAILED":
      return "PHOTO_ERROR";
    case "BACKEND_NOT_CONFIGURED":
      return "BACKEND_NOT_CONFIGURED";
    default:
      return "UNKNOWN";
  }
}

async function parseFunctionError(
  error: unknown,
  fallbackMessage: string,
): Promise<VisitorError> {
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.json()) as FunctionErrorBody;
      const message = formatFunctionErrorMessage(body);
      if (message) {
        const backendCode = body.error?.code ?? body.code;
        return new VisitorError(
          message,
          mapVisitorErrorCode(backendCode),
          backendCode,
        );
      }
    } catch {
      // Fall through.
    }
  }

  return new VisitorError(fallbackMessage, "NETWORK_ERROR");
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

function normalizeEmbeddedResident(
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

async function invokeFunction<T>(
  accessToken: string,
  functionName: string,
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<T> {
  const supabase = assertSupabaseClient(accessToken);
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw await parseFunctionError(error, fallbackMessage);
  }

  const responseBody = data as FunctionErrorBody & T;
  const responseErrorMessage = formatFunctionErrorMessage(responseBody);
  if (responseErrorMessage) {
    const backendCode = responseBody.error?.code ?? responseBody.code;
    throw new VisitorError(
      responseErrorMessage,
      mapVisitorErrorCode(backendCode),
      backendCode,
    );
  }

  return data as T;
}

export async function listActiveFlats(
  accessToken: string,
): Promise<FlatSummary[]> {
  const supabase = assertSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("flats")
    .select("id, flat_number, society_id, status, wing_building")
    .eq("status", "active")
    .order("flat_number", { ascending: true });

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return (data as FlatRow[]).map((row) => ({
    id: row.id,
    flatNumber: row.flat_number,
    societyId: row.society_id,
    status: row.status,
    wingBuilding: row.wing_building ?? null,
  }));
}

export async function listLinkedResidentsForFlat(
  accessToken: string,
  flatId: string,
): Promise<LinkedResident[]> {
  const supabase = assertSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("resident_flats")
    .select("resident_id, residents(id, name, mobile, status)")
    .eq("flat_id", flatId);

  if (error) {
    throw new VisitorError(error.message, "QUERY_FAILED");
  }

  return (data as ResidentFlatRow[])
    .map((row) => normalizeEmbeddedResident(row.residents))
    .filter((resident): resident is LinkedResident => resident !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function sendVisitorOtp(
  accessToken: string,
  visitorMobile: string,
  challengeId?: string | null,
): Promise<OtpChallengeResult> {
  const devOtpClientToken = readDevOtpClientToken();
  const result = await invokeFunction<OtpChallengeResult>(
    accessToken,
    "send-visitor-otp",
    {
      visitor_mobile: visitorMobile,
      ...(challengeId ? { challenge_id: challengeId } : {}),
      ...(devOtpClientToken
        ? { dev_otp_client_token: devOtpClientToken }
        : {}),
    },
    "Unable to send OTP.",
  );
  return sanitizeOtpChallengeResult(result);
}

export async function verifyVisitorOtp(
  accessToken: string,
  challengeId: string,
  otpCode: string,
): Promise<OtpVerificationResult> {
  return invokeFunction<OtpVerificationResult>(
    accessToken,
    "verify-visitor-otp",
    {
      challenge_id: challengeId,
      otp_code: otpCode,
    },
    "Unable to verify OTP.",
  );
}

export async function uploadVisitorPhoto(
  accessToken: string,
  imageBase64: string,
  contentType = "image/jpeg",
): Promise<PhotoUploadResult> {
  return invokeFunction<PhotoUploadResult>(
    accessToken,
    "upload-visitor-photo",
    {
      image_base64: imageBase64,
      content_type: contentType,
    },
    "Unable to upload visitor photo.",
  );
}

export async function registerVisitor(
  accessToken: string,
  input: RegisterVisitorFormInput,
): Promise<VisitorEntry> {
  const body: Record<string, unknown> = {
    visitor_name: input.visitorName,
    visitor_mobile: input.visitorMobile,
    registration_mode: input.registrationMode,
    purpose_code: input.purposeCode,
    photo_upload_id: input.photoUploadId,
    vehicle_visually_checked: input.vehicleVisuallyChecked,
  };

  if (input.flatId) {
    body.flat_id = input.flatId;
  }
  if (input.destinationText) {
    body.destination_text = input.destinationText;
  }
  if (input.residentId) {
    body.resident_id = input.residentId;
  }
  if (input.customPurposeText) {
    body.custom_purpose_text = input.customPurposeText;
  }
  if (input.vehicleNumber) {
    body.vehicle_number = input.vehicleNumber;
  }
  if (input.otpFallbackReason) {
    body.otp_fallback_reason = input.otpFallbackReason;
  }
  if (input.otpVerificationToken) {
    body.otp_verification_token = input.otpVerificationToken;
  }
  if (input.notes) {
    body.notes = input.notes;
  }
  if (input.entryType) {
    body.entry_type = input.entryType;
  }
  if (input.visitorCount !== undefined) {
    body.visitor_count = input.visitorCount;
  }

  const response = await invokeFunction<RegisterVisitorResponse>(
    accessToken,
    "register-visitor",
    body,
    "Unable to register visitor.",
  );

  if (!response?.visitorEntry) {
    throw new VisitorError("Unable to register visitor.", "UNKNOWN");
  }

  return response.visitorEntry;
}

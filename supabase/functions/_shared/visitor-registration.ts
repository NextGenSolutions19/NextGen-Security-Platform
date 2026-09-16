import {
  getVisitorPurposeById,
  isValidIndianMobileNumber,
  isValidVehicleNumber,
  normalizeIndianMobileNumber,
  normalizeVehicleNumber,
  purposeRequiresCustomText,
  purposeRequiresVehicleNumber,
  resolveVisitorPurposeLabel,
} from "./visitor-purposes.ts";
import {
  isValidOtpFallbackReason,
  normalizeOtpFallbackReason,
} from "./society-security-policies.ts";
import {
  DEFAULT_VISITOR_COUNT,
  DEFAULT_VISITOR_ENTRY_TYPE,
  GROUP_VISITOR_MAX_COUNT,
  GROUP_VISITOR_MIN_COUNT,
  isVisitorEntryType,
  type VisitorEntryType,
} from "./visitor-entry-type.ts";

export const DESTINATION_TEXT_MAX_LENGTH = 80;
const VISITOR_NAME_MAX_LENGTH = 80;

export interface RegisterVisitorInput {
  flat_id?: unknown;
  resident_id?: unknown;
  destination_text?: unknown;
  visitor_mobile?: unknown;
  registration_mode?: unknown;
  purpose_code?: unknown;
  custom_purpose_text?: unknown;
  purpose?: unknown;
  vehicle_number?: unknown;
  vehicle_visually_checked?: unknown;
  photo_upload_id?: unknown;
  otp_verification_token?: unknown;
  otp_fallback_reason?: unknown;
  id_type?: unknown;
  id_number?: unknown;
  notes?: unknown;
  entry_type?: unknown;
  visitor_count?: unknown;
  society_id?: unknown;
  created_by_app_user_id?: unknown;
  verification_method?: unknown;
  otp_verified?: unknown;
}

export interface ValidationSuccess {
  ok: true;
  value: {
    flatId: string | null;
    destinationText: string | null;
    residentId: string | null;
    visitorName: string;
    visitorMobile: string;
    registrationMode: "verify_with_otp" | "register_without_otp";
    purposeCode: string;
    purposeLabel: string;
    purposeText: string;
    customPurposeText: string | null;
    vehicleNumber: string | null;
    vehicleVisuallyChecked: boolean;
    photoUploadId: string;
    otpVerificationToken: string | null;
    otpFallbackReason: string | null;
    idType: string | null;
    idNumber: string | null;
    notes: string | null;
    entryType: VisitorEntryType;
    visitorCount: number;
  };
}

export interface ValidationFailure {
  ok: false;
  code: string;
  message: string;
  status: number;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rejectClientDerivedFields(
  body: RegisterVisitorInput,
): ValidationFailure | null {
  const forbiddenFields = [
    "society_id",
    "created_by_app_user_id",
    "verification_method",
    "otp_verified",
    "purpose",
  ] as const;

  for (const field of forbiddenFields) {
    if (field in body) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Server-derived fields must not be supplied by the client.",
        status: 400,
      };
    }
  }

  return null;
}

export function validateRegisterVisitorInput(
  body: RegisterVisitorInput,
): ValidationResult {
  const forbidden = rejectClientDerivedFields(body);
  if (forbidden) {
    return forbidden;
  }

  const flatIdRaw = String(body?.flat_id ?? "").trim();
  const destinationTextRaw = String(body?.destination_text ?? "").trim();
  const visitorName = String(body?.visitor_name ?? "").trim();
  const visitorMobile = normalizeIndianMobileNumber(
    String(body?.visitor_mobile ?? ""),
  );
  const registrationMode = String(body?.registration_mode ?? "").trim();
  const purposeCode = String(body?.purpose_code ?? "").trim();
  const customPurposeText = optionalText(body?.custom_purpose_text);
  const photoUploadId = String(body?.photo_upload_id ?? "").trim();
  const otpVerificationToken = optionalText(body?.otp_verification_token);
  const otpFallbackReason = normalizeOtpFallbackReason(
    optionalText(body?.otp_fallback_reason),
  );
  const vehicleNumberRaw = optionalText(body?.vehicle_number);
  const vehicleVisuallyChecked = body?.vehicle_visually_checked === true;
  const residentIdRaw = body?.resident_id;
  const residentId =
    residentIdRaw === undefined || residentIdRaw === null
      ? null
      : String(residentIdRaw).trim();

  const hasFlat = Boolean(flatIdRaw);
  const hasDestination = Boolean(destinationTextRaw);

  if (!hasFlat && !hasDestination) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Select an existing flat or enter an Other destination.",
      status: 400,
    };
  }

  if (hasFlat && hasDestination) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Choose either an existing flat or Other destination, not both.",
      status: 400,
    };
  }

  let flatId: string | null = null;
  let destinationText: string | null = null;

  if (hasFlat) {
    if (!isUuid(flatIdRaw)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "flat_id must be a valid UUID.",
        status: 400,
      };
    }
    flatId = flatIdRaw;
  } else {
    if (destinationTextRaw.length > DESTINATION_TEXT_MAX_LENGTH) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `destination_text must be ${DESTINATION_TEXT_MAX_LENGTH} characters or fewer.`,
        status: 400,
      };
    }
    destinationText = destinationTextRaw;
    if (residentId) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Other destination cannot be linked to a resident.",
        status: 400,
      };
    }
  }

  if (!visitorName) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "visitor_name is required.",
      status: 400,
    };
  }

  if (visitorName.length > VISITOR_NAME_MAX_LENGTH) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `visitor_name must be ${VISITOR_NAME_MAX_LENGTH} characters or fewer.`,
      status: 400,
    };
  }

  if (!visitorMobile) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "visitor_mobile is required.",
      status: 400,
    };
  }

  if (!isValidIndianMobileNumber(visitorMobile)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Enter a valid 10-digit Indian mobile number.",
      status: 400,
    };
  }

  if (
    registrationMode !== "verify_with_otp" &&
    registrationMode !== "register_without_otp"
  ) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "registration_mode is invalid.",
      status: 400,
    };
  }

  if (registrationMode === "verify_with_otp" && !otpVerificationToken) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "OTP verification is required for this registration mode.",
      status: 400,
    };
  }

  if (registrationMode === "register_without_otp" && otpVerificationToken) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "OTP verification token must not be supplied for this mode.",
      status: 400,
    };
  }

  if (registrationMode === "register_without_otp") {
    if (!isValidOtpFallbackReason(otpFallbackReason)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Enter a reason for registering without OTP.",
        status: 400,
      };
    }
  }

  if (!purposeCode) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "purpose_code is required.",
      status: 400,
    };
  }

  const purpose = getVisitorPurposeById(purposeCode);
  if (!purpose || !purpose.enabled) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "purpose_code is invalid or disabled.",
      status: 400,
    };
  }

  if (purposeRequiresCustomText(purpose) && !customPurposeText) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "custom_purpose_text is required for the selected purpose.",
      status: 400,
    };
  }

  const purposeText = resolveVisitorPurposeLabel(purpose, customPurposeText);
  if (!purposeText) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "purpose text could not be resolved.",
      status: 400,
    };
  }

  let vehicleNumber: string | null = null;
  if (vehicleNumberRaw) {
    vehicleNumber = normalizeVehicleNumber(vehicleNumberRaw);
    if (!isValidVehicleNumber(vehicleNumberRaw)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Enter a valid vehicle registration number.",
        status: 400,
      };
    }
  }

  if (purposeRequiresVehicleNumber(purpose) && !vehicleNumber) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "vehicle_number is required for the selected purpose.",
      status: 400,
    };
  }

  if (purposeRequiresVehicleNumber(purpose) && !vehicleVisuallyChecked) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "vehicle_visually_checked must be confirmed for Cab / Taxi.",
      status: 400,
    };
  }

  if (!photoUploadId) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "photo_upload_id is required.",
      status: 400,
    };
  }

  if (!isUuid(photoUploadId)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "photo_upload_id must be a valid UUID.",
      status: 400,
    };
  }

  const entryTypeRaw = optionalText(body?.entry_type);
  const visitorCountRaw = body?.visitor_count;

  if (residentId !== null) {
    if (!residentId) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "resident_id cannot be empty when provided.",
        status: 400,
      };
    }
    if (!isUuid(residentId)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "resident_id must be a valid UUID.",
        status: 400,
      };
    }
  }

  let entryType: VisitorEntryType = DEFAULT_VISITOR_ENTRY_TYPE;
  if (entryTypeRaw) {
    if (!isVisitorEntryType(entryTypeRaw)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "entry_type is invalid.",
        status: 400,
      };
    }
    entryType = entryTypeRaw;
  }

  let visitorCount = DEFAULT_VISITOR_COUNT;
  if (visitorCountRaw !== undefined && visitorCountRaw !== null && visitorCountRaw !== "") {
    const parsedCount = Number(visitorCountRaw);
    if (!Number.isInteger(parsedCount)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "visitor_count must be an integer.",
        status: 400,
      };
    }
    visitorCount = parsedCount;
  } else if (entryType === "group") {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "visitor_count is required for group visitor registration.",
      status: 400,
    };
  }

  if (entryType === "single" && visitorCount !== DEFAULT_VISITOR_COUNT) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Single visitor registrations must have a visitor count of 1.",
      status: 400,
    };
  }

  if (entryType === "group") {
    if (visitorCount < GROUP_VISITOR_MIN_COUNT) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `visitor_count must be at least ${GROUP_VISITOR_MIN_COUNT} for a group. Use New Visitor for one person.`,
        status: 400,
      };
    }
    if (visitorCount > GROUP_VISITOR_MAX_COUNT) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `visitor_count cannot exceed ${GROUP_VISITOR_MAX_COUNT}.`,
        status: 400,
      };
    }
  }

  return {
    ok: true,
    value: {
      flatId,
      destinationText,
      residentId: destinationText ? null : residentId,
      visitorName,
      visitorMobile,
      registrationMode,
      purposeCode: purpose.id,
      purposeLabel: purpose.label,
      purposeText,
      customPurposeText,
      vehicleNumber,
      vehicleVisuallyChecked,
      photoUploadId,
      otpVerificationToken,
      otpFallbackReason:
        registrationMode === "register_without_otp" ? otpFallbackReason : null,
      idType: optionalText(body?.id_type),
      idNumber: optionalText(body?.id_number),
      notes: optionalText(body?.notes),
      entryType,
      visitorCount,
    },
  };
}

export interface SocietySecurityPolicy {
  otpRequired: boolean;
  residentSelectionRequired: boolean;
}

export const DEFAULT_SOCIETY_SECURITY_POLICY: SocietySecurityPolicy = {
  otpRequired: false,
  residentSelectionRequired: false,
};

export const OTP_FALLBACK_REASON_MAX_LENGTH = 200;

export const SECURITY_POLICY_LOAD_FAILED_MESSAGE =
  "Unable to load society security policies. Visitor registration is paused until policies can be loaded.";

export const SECURITY_POLICY_OTP_REQUIRED_MESSAGE =
  "This society requires mobile OTP verification. Register without OTP is not allowed.";

export const SECURITY_POLICY_FALLBACK_REASON_REQUIRED_MESSAGE =
  "Enter a reason for registering without OTP.";

export function normalizeOtpFallbackReason(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidOtpFallbackReason(
  value: string | null | undefined,
): boolean {
  const normalized = normalizeOtpFallbackReason(value);
  if (!normalized) {
    return false;
  }
  return normalized.length <= OTP_FALLBACK_REASON_MAX_LENGTH;
}

export function parseSocietySecurityPolicy(
  input: Partial<SocietySecurityPolicy> | null | undefined,
): SocietySecurityPolicy {
  return {
    otpRequired: input?.otpRequired === true,
    residentSelectionRequired: input?.residentSelectionRequired === true,
  };
}

export function isRegisterWithoutOtpAllowed(
  policy: SocietySecurityPolicy,
): boolean {
  return policy.otpRequired === false;
}

export function purposeRequiresResidentSelection(
  _policy: SocietySecurityPolicy,
  _purposeCode: string,
): boolean {
  return false;
}

export type VisitorSecurityPolicyEvaluation =
  | { ok: true }
  | {
      ok: false;
      code: "OTP_REQUIRED" | "FALLBACK_REASON_REQUIRED";
      message: string;
      field: "registrationMode" | "otpFallbackReason";
    };

export function evaluateVisitorSecurityPolicy(input: {
  policy: SocietySecurityPolicy;
  registrationMode: "verify_with_otp" | "register_without_otp";
  otpFallbackReason?: string | null;
  residentId?: string | null;
  purposeCode: string;
}): VisitorSecurityPolicyEvaluation {
  const { policy, registrationMode } = input;

  if (registrationMode === "register_without_otp" && !isRegisterWithoutOtpAllowed(policy)) {
    return {
      ok: false,
      code: "OTP_REQUIRED",
      message: SECURITY_POLICY_OTP_REQUIRED_MESSAGE,
      field: "registrationMode",
    };
  }

  if (registrationMode === "register_without_otp") {
    if (!isValidOtpFallbackReason(input.otpFallbackReason)) {
      return {
        ok: false,
        code: "FALLBACK_REASON_REQUIRED",
        message: SECURITY_POLICY_FALLBACK_REASON_REQUIRED_MESSAGE,
        field: "otpFallbackReason",
      };
    }
  }

  return { ok: true };
}

export function parseSocietySecurityPolicySaveInput(body: unknown):
  | { ok: true; value: SocietySecurityPolicy }
  | { ok: false; code: string; message: string; status: number } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Request body must be a JSON object.",
      status: 400,
    };
  }

  const record = body as Record<string, unknown>;
  if ("society_id" in record || "societyId" in record) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Society is taken from the authenticated session.",
      status: 400,
    };
  }

  if (typeof record.otpRequired !== "boolean") {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "otpRequired must be a boolean.",
      status: 400,
    };
  }

  if (
    "residentSelectionRequired" in record &&
    typeof record.residentSelectionRequired !== "boolean"
  ) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "residentSelectionRequired must be a boolean.",
      status: 400,
    };
  }

  return {
    ok: true,
    value: {
      otpRequired: record.otpRequired,
      residentSelectionRequired: record.residentSelectionRequired === true,
    },
  };
}

export function mapSocietySecurityPolicyRow(row: {
  otp_required?: boolean | null;
  resident_selection_required?: boolean | null;
} | null): SocietySecurityPolicy {
  if (!row) {
    return DEFAULT_SOCIETY_SECURITY_POLICY;
  }
  return {
    otpRequired: row.otp_required === true,
    residentSelectionRequired: row.resident_selection_required === true,
  };
}

import type { VisitorErrorCode } from "./visitor";
import type { VisitorVerificationMethod } from "./visitor-verification";

export const OTP_CODE_PATTERN = /^\d{4}$/;

export const OTP_VERIFICATION_MESSAGES = {
  incorrect: "Incorrect OTP. Please try again.",
  expired: "OTP has expired. Please request a new OTP.",
  invalidFormat: "Enter a valid OTP.",
  network: "Unable to verify OTP. Please try again.",
} as const;

export function isValidOtpCodeFormat(otpCode: string): boolean {
  return OTP_CODE_PATTERN.test(otpCode.trim());
}

export interface OtpVerificationFailure {
  verified: false;
  fieldError: string;
}

export function resolveOtpVerificationFailure(input: {
  otpCode?: string;
  backendCode?: string | null;
  visitorErrorCode?: VisitorErrorCode | string | null;
}): OtpVerificationFailure {
  if (input.otpCode !== undefined && !isValidOtpCodeFormat(input.otpCode)) {
    return {
      verified: false,
      fieldError: OTP_VERIFICATION_MESSAGES.invalidFormat,
    };
  }

  const backendCode = (input.backendCode ?? "").trim().toUpperCase();

  if (backendCode === "OTP_INVALID" || backendCode === "OTP_VERIFICATION_INVALID") {
    return {
      verified: false,
      fieldError: OTP_VERIFICATION_MESSAGES.incorrect,
    };
  }

  if (backendCode === "OTP_EXPIRED" || backendCode === "OTP_VERIFICATION_EXPIRED") {
    return {
      verified: false,
      fieldError: OTP_VERIFICATION_MESSAGES.expired,
    };
  }

  if (input.visitorErrorCode === "NETWORK_ERROR") {
    return {
      verified: false,
      fieldError: OTP_VERIFICATION_MESSAGES.network,
    };
  }

  return {
    verified: false,
    fieldError: OTP_VERIFICATION_MESSAGES.network,
  };
}

export function resolveOtpVerificationFailureFromUnknown(
  error: unknown,
  otpCode: string,
): OtpVerificationFailure {
  if (error && typeof error === "object" && "code" in error) {
    const visitorError = error as {
      code?: string;
      backendCode?: string;
    };
    return resolveOtpVerificationFailure({
      otpCode,
      backendCode: visitorError.backendCode,
      visitorErrorCode: visitorError.code,
    });
  }

  return resolveOtpVerificationFailure({
    otpCode,
    visitorErrorCode: "NETWORK_ERROR",
  });
}

export interface OtpVerifySessionState {
  isVerifying: boolean;
  verificationToken: string | null;
  fieldError: string;
  verificationMethod: VisitorVerificationMethod | null;
}

export function createOtpVerifySessionState(): OtpVerifySessionState {
  return {
    isVerifying: false,
    verificationToken: null,
    fieldError: "",
    verificationMethod: null,
  };
}

export function startOtpVerification(state: OtpVerifySessionState): {
  accepted: boolean;
  state: OtpVerifySessionState;
} {
  if (state.isVerifying) {
    return { accepted: false, state };
  }

  return {
    accepted: true,
    state: {
      ...state,
      isVerifying: true,
      fieldError: "",
      verificationToken: null,
      verificationMethod: null,
    },
  };
}

export function completeOtpVerificationSuccess(
  verificationToken: string,
): OtpVerifySessionState {
  return {
    isVerifying: false,
    verificationToken,
    fieldError: "",
    verificationMethod: "OTP_VERIFIED",
  };
}

export function completeOtpVerificationFailure(
  failure: OtpVerificationFailure,
): OtpVerifySessionState {
  return {
    isVerifying: false,
    verificationToken: null,
    fieldError: failure.fieldError,
    verificationMethod: null,
  };
}

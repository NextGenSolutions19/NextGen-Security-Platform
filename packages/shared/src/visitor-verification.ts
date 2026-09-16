export const VISITOR_REGISTRATION_MODES = [
  "verify_with_otp",
  "register_without_otp",
] as const;

export type VisitorRegistrationMode =
  (typeof VISITOR_REGISTRATION_MODES)[number];

export const VISITOR_VERIFICATION_METHODS = [
  "OTP_VERIFIED",
  "OTP_NOT_PERFORMED",
] as const;

export type VisitorVerificationMethod =
  (typeof VISITOR_VERIFICATION_METHODS)[number];

export const REGISTRATION_MODE_LABELS: Record<VisitorRegistrationMode, string> = {
  verify_with_otp: "Verify with OTP",
  register_without_otp: "Register without OTP",
};

export function resolveVerificationMethod(
  registrationMode: VisitorRegistrationMode,
  otpVerified: boolean,
): VisitorVerificationMethod {
  if (registrationMode === "register_without_otp") {
    return "OTP_NOT_PERFORMED";
  }

  return otpVerified ? "OTP_VERIFIED" : "OTP_NOT_PERFORMED";
}

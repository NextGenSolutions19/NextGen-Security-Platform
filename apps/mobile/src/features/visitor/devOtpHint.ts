import type { OtpChallengeResult } from "@nextgen/shared";

export function isDevOtpHintEnabled(): boolean {
  return (
    typeof __DEV__ !== "undefined" &&
    __DEV__ === true &&
    process.env.EXPO_PUBLIC_ENABLE_DEV_OTP_HINT === "true"
  );
}

export function readDevOtpClientToken(): string | undefined {
  if (!isDevOtpHintEnabled()) {
    return undefined;
  }

  const token = process.env.EXPO_PUBLIC_DEV_OTP_CLIENT_TOKEN?.trim();
  return token || undefined;
}

export function sanitizeOtpChallengeResult(
  result: OtpChallengeResult,
): OtpChallengeResult {
  if (isDevOtpHintEnabled() && readDevOtpClientToken() && result.devOtpCode) {
    return result;
  }

  if (!result.devOtpCode) {
    return result;
  }

  const { devOtpCode: _removed, ...rest } = result;
  return rest;
}

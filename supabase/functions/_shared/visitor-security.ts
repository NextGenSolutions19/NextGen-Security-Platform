import { hashToken } from "./password.ts";

export {
  VISITOR_PHOTO_ALLOWED_MIME_TYPE_SET as ALLOWED_PHOTO_CONTENT_TYPES,
  VISITOR_PHOTO_BUCKET,
  VISITOR_PHOTO_MAX_BYTES as MAX_PHOTO_BYTES,
} from "./storage-config.ts";

const OTP_TTL_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_RESENDS = 5;
const VERIFICATION_TOKEN_TTL_MINUTES = 10;

export function getOtpTtlMinutes(): number {
  return OTP_TTL_MINUTES;
}

export function getOtpResendCooldownSeconds(): number {
  return OTP_RESEND_COOLDOWN_SECONDS;
}

export function generateOtpCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function generateVerificationToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashOtpCode(code: string): Promise<string> {
  return hashToken(code);
}

export async function hashVerificationToken(token: string): Promise<string> {
  return hashToken(token);
}

export function getOtpExpiryDate(): string {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
}

export function getVerificationTokenExpiryDate(): string {
  return new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000)
    .toISOString();
}

export function getResendAvailableAt(lastSentAt: string): string {
  return new Date(
    new Date(lastSentAt).getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
  ).toISOString();
}

export function canStartNewOtpSend(
  lastSentAt: string,
): { ok: true } | { ok: false; message: string } {
  const availableAt = new Date(getResendAvailableAt(lastSentAt)).getTime();
  if (Date.now() < availableAt) {
    return {
      ok: false,
      message: "Please wait before requesting another OTP.",
    };
  }

  return { ok: true };
}

export function canSendOtpResend(
  lastSentAt: string,
  resendCount: number,
): { ok: true } | { ok: false; message: string } {
  if (resendCount >= OTP_MAX_RESENDS) {
    return {
      ok: false,
      message: "OTP resend limit reached. Start a new verification.",
    };
  }

  const availableAt = new Date(getResendAvailableAt(lastSentAt)).getTime();
  if (Date.now() < availableAt) {
    return {
      ok: false,
      message: "Please wait before requesting another OTP.",
    };
  }

  return { ok: true };
}

export function canAttemptOtpVerification(
  attemptCount: number,
  expiresAt: string,
): { ok: true } | { ok: false; message: string } {
  if (new Date(expiresAt).getTime() <= Date.now()) {
    return { ok: false, message: "OTP has expired. Request a new code." };
  }

  if (attemptCount >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      message: "Maximum OTP attempts reached. Request a new code.",
    };
  }

  return { ok: true };
}

export async function sendVisitorOtpSms(
  mobile: string,
  otpCode: string,
): Promise<{ delivered: boolean; devMode: boolean }> {
  const provider = Deno.env.get("VISITOR_OTP_SMS_PROVIDER")?.trim().toLowerCase();
  if (!provider || provider === "dev") {
    console.info("visitor OTP dev mode active for mobile ending", mobile.slice(-4));
    return { delivered: false, devMode: true };
  }

  // Future provider integrations remain server-side only.
  throw new Error(`Unsupported VISITOR_OTP_SMS_PROVIDER: ${provider}`);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

export function resolveShouldExposeDevOtpCode(input: {
  exposeFlag?: string | null;
  smsProvider?: string | null;
  clientDevToken?: string | null;
  expectedClientToken?: string | null;
}): boolean {
  if (input.exposeFlag?.trim().toLowerCase() !== "true") {
    return false;
  }
  const provider = input.smsProvider?.trim().toLowerCase() ?? "";
  if (provider !== "" && provider !== "dev") {
    return false;
  }
  const expected = input.expectedClientToken?.trim() ?? "";
  if (!expected) {
    return false;
  }
  const client = input.clientDevToken?.trim() ?? "";
  if (!client) {
    return false;
  }
  return constantTimeEqual(client, expected);
}

export function shouldExposeDevOtpCode(clientDevToken?: string | null): boolean {
  return resolveShouldExposeDevOtpCode({
    exposeFlag: Deno.env.get("VISITOR_OTP_DEV_EXPOSE_CODE"),
    smsProvider: Deno.env.get("VISITOR_OTP_SMS_PROVIDER"),
    clientDevToken,
    expectedClientToken: Deno.env.get("VISITOR_OTP_DEV_CLIENT_TOKEN"),
  });
}

export const VISITOR_PHOTO_TTL_MINUTES = 30;

export function getPhotoUploadExpiryDate(): string {
  return new Date(Date.now() + VISITOR_PHOTO_TTL_MINUTES * 60 * 1000).toISOString();
}

import { hashToken, verifyTokenHash } from "./password.ts";
import type { createServiceClient } from "./supabase.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface PhotoUploadRow {
  id: string;
  society_id: string;
  created_by_app_user_id: string;
  storage_bucket: string;
  storage_path: string;
  content_type: string;
  upload_status: string;
  expires_at: string;
  consumed_at: string | null;
}

interface OtpChallengeRow {
  id: string;
  society_id: string;
  visitor_mobile: string;
  created_by_app_user_id: string;
  verification_token_hash: string | null;
  verification_token_expires_at: string | null;
  consumed_at: string | null;
  verified_at: string | null;
}

export async function loadReadyPhotoUpload(
  supabase: ServiceClient,
  photoUploadId: string,
  societyId: string,
  guardId: string,
): Promise<
  | { ok: true; upload: PhotoUploadRow }
  | { ok: false; code: string; message: string; status: number }
> {
  const { data, error } = await supabase
    .from("visitor_photo_uploads")
    .select(
      "id, society_id, created_by_app_user_id, storage_bucket, storage_path, content_type, upload_status, expires_at, consumed_at",
    )
    .eq("id", photoUploadId)
    .eq("society_id", societyId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      code: "PHOTO_NOT_FOUND",
      message: "Visitor photo upload was not found.",
      status: 404,
    };
  }

  const upload = data as PhotoUploadRow;
  if (
    upload.society_id !== societyId ||
    upload.created_by_app_user_id !== guardId
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Visitor photo upload does not belong to this guard.",
      status: 403,
    };
  }

  if (upload.consumed_at) {
    return {
      ok: false,
      code: "PHOTO_ALREADY_USED",
      message: "Visitor photo upload has already been used.",
      status: 400,
    };
  }

  if (upload.upload_status !== "ready") {
    return {
      ok: false,
      code: "PHOTO_NOT_READY",
      message: "Visitor photo upload is not ready.",
      status: 400,
    };
  }

  if (new Date(upload.expires_at).getTime() <= Date.now()) {
    return {
      ok: false,
      code: "PHOTO_EXPIRED",
      message: "Visitor photo upload has expired.",
      status: 400,
    };
  }

  return { ok: true, upload };
}

export async function consumePhotoUpload(
  supabase: ServiceClient,
  photoUploadId: string,
): Promise<void> {
  await supabase
    .from("visitor_photo_uploads")
    .update({
      consumed_at: new Date().toISOString(),
      upload_status: "consumed",
    })
    .eq("id", photoUploadId);
}

export async function verifyOtpRegistrationToken(
  supabase: ServiceClient,
  token: string,
  visitorMobile: string,
  societyId: string,
  guardId: string,
): Promise<
  | { ok: true; challengeId: string }
  | { ok: false; code: string; message: string; status: number }
> {
  const tokenHash = await hashToken(token);
  const { data, error } = await supabase
    .from("visitor_otp_challenges")
    .select(
      "id, society_id, visitor_mobile, created_by_app_user_id, verification_token_hash, verification_token_expires_at, consumed_at, verified_at",
    )
    .eq("verification_token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      code: "OTP_VERIFICATION_INVALID",
      message: "OTP verification is invalid or expired.",
      status: 400,
    };
  }

  const challenge = data as OtpChallengeRow;
  if (
    challenge.society_id !== societyId ||
    challenge.created_by_app_user_id !== guardId ||
    challenge.visitor_mobile !== visitorMobile
  ) {
    return {
      ok: false,
      code: "OTP_VERIFICATION_INVALID",
      message: "OTP verification does not match this registration.",
      status: 400,
    };
  }

  if (!challenge.verified_at || challenge.consumed_at) {
    return {
      ok: false,
      code: "OTP_VERIFICATION_INVALID",
      message: "OTP verification is invalid or already used.",
      status: 400,
    };
  }

  if (
    !challenge.verification_token_expires_at ||
    new Date(challenge.verification_token_expires_at).getTime() <= Date.now()
  ) {
    return {
      ok: false,
      code: "OTP_VERIFICATION_EXPIRED",
      message: "OTP verification has expired.",
      status: 400,
    };
  }

  const matches = await verifyTokenHash(
    token,
    challenge.verification_token_hash ?? "",
  );
  if (!matches) {
    return {
      ok: false,
      code: "OTP_VERIFICATION_INVALID",
      message: "OTP verification is invalid.",
      status: 400,
    };
  }

  return { ok: true, challengeId: challenge.id };
}

export async function consumeOtpChallenge(
  supabase: ServiceClient,
  challengeId: string,
): Promise<void> {
  await supabase
    .from("visitor_otp_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeId);
}

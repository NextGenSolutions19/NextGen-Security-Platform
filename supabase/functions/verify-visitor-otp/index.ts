import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { requireActiveGuardDuty } from "../_shared/guard-duty.ts";
import { authenticateGuardRequest } from "../_shared/guard-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { verifyTokenHash } from "../_shared/password.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  canAttemptOtpVerification,
  generateVerificationToken,
  getVerificationTokenExpiryDate,
  hashVerificationToken,
} from "../_shared/visitor-security.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

  try {
    const auth = await authenticateGuardRequest(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const challengeId = String(body?.challenge_id ?? "").trim();
    const otpCode = String(body?.otp_code ?? "").trim();

    if (!challengeId || !/^\d{4}$/.test(otpCode)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "A valid OTP challenge and 4-digit code are required.",
        400,
      );
    }

    const supabase = createServiceClient();
    const { user: guardUser, society } = auth.context;
    const duty = await requireActiveGuardDuty(supabase, {
      guardUserId: guardUser.id,
      societyId: society.id,
    });
    if (!duty.ok) {
      return duty.response;
    }

    const { data: challenge, error } = await supabase
      .from("visitor_otp_challenges")
      .select(
        "id, society_id, created_by_app_user_id, visitor_mobile, otp_hash, expires_at, attempt_count, verified_at, consumed_at",
      )
      .eq("id", challengeId)
      .eq("society_id", society.id)
      .eq("created_by_app_user_id", guardUser.id)
      .maybeSingle();

    if (error || !challenge) {
      return errorResponse("OTP_NOT_FOUND", "OTP challenge not found.", 404);
    }

    if (
      challenge.society_id !== society.id ||
      challenge.created_by_app_user_id !== guardUser.id ||
      challenge.consumed_at
    ) {
      return errorResponse("FORBIDDEN", "OTP challenge is not available.", 403);
    }

    const attemptCheck = canAttemptOtpVerification(
      challenge.attempt_count,
      challenge.expires_at,
    );
    if (!attemptCheck.ok) {
      return errorResponse("OTP_EXPIRED", attemptCheck.message, 400);
    }

    const otpMatches = await verifyTokenHash(otpCode, challenge.otp_hash);
    if (!otpMatches) {
      await supabase
        .from("visitor_otp_challenges")
        .update({ attempt_count: challenge.attempt_count + 1 })
        .eq("id", challengeId)
        .eq("society_id", society.id);

      return errorResponse("OTP_INVALID", "The OTP code is incorrect.", 400);
    }

    const verificationToken = generateVerificationToken();
    const verificationTokenHash = await hashVerificationToken(verificationToken);
    const verificationTokenExpiresAt = getVerificationTokenExpiryDate();

    const { error: updateError } = await supabase
      .from("visitor_otp_challenges")
      .update({
        verified_at: new Date().toISOString(),
        verification_token_hash: verificationTokenHash,
        verification_token_expires_at: verificationTokenExpiresAt,
      })
      .eq("id", challengeId)
      .eq("society_id", society.id);

    if (updateError) {
      return errorResponse("INTERNAL_ERROR", "Unable to verify OTP.", 500);
    }

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: guardUser.id,
      p_actor_role: guardUser.role,
      p_action: "visitor.otp.verified",
      p_entity_type: "visitor_otp_challenge",
      p_entity_id: challengeId,
      p_metadata: {
        visitor_mobile: challenge.visitor_mobile,
      },
    });

    return jsonResponse({
      verificationToken,
      expiresAt: verificationTokenExpiresAt,
    });
  } catch (error) {
    console.error("verify-visitor-otp unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to verify OTP.", 500);
  }
});

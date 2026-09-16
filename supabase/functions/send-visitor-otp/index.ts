import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { requireActiveGuardDuty } from "../_shared/guard-duty.ts";
import { authenticateGuardRequest } from "../_shared/guard-auth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { hashToken, verifyTokenHash } from "../_shared/password.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  canSendOtpResend,
  canStartNewOtpSend,
  generateOtpCode,
  getOtpExpiryDate,
  getOtpResendCooldownSeconds,
  getResendAvailableAt,
  hashOtpCode,
  sendVisitorOtpSms,
  shouldExposeDevOtpCode,
} from "../_shared/visitor-security.ts";
import {
  isValidIndianMobileNumber,
  normalizeIndianMobileNumber,
} from "../_shared/visitor-purposes.ts";

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
    const visitorMobile = normalizeIndianMobileNumber(
      String(body?.visitor_mobile ?? ""),
    );
    const existingChallengeId = String(body?.challenge_id ?? "").trim();
    const devOtpClientToken = String(body?.dev_otp_client_token ?? "").trim() || null;

    if (!isValidIndianMobileNumber(visitorMobile)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Enter a valid 10-digit Indian mobile number.",
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
    const otpCode = generateOtpCode();
    const otpHash = await hashOtpCode(otpCode);
    const expiresAt = getOtpExpiryDate();
    const now = new Date().toISOString();

    if (existingChallengeId) {
      const { data: existing, error } = await supabase
        .from("visitor_otp_challenges")
        .select("id, society_id, created_by_app_user_id, visitor_mobile, resend_count, last_sent_at, consumed_at")
        .eq("id", existingChallengeId)
        .eq("society_id", society.id)
        .eq("created_by_app_user_id", guardUser.id)
        .maybeSingle();

      if (error || !existing) {
        return errorResponse("OTP_NOT_FOUND", "OTP challenge not found.", 404);
      }

      if (
        existing.society_id !== society.id ||
        existing.created_by_app_user_id !== guardUser.id ||
        existing.visitor_mobile !== visitorMobile ||
        existing.consumed_at
      ) {
        return errorResponse("FORBIDDEN", "OTP challenge is not available.", 403);
      }

      const resendCheck = canSendOtpResend(
        existing.last_sent_at,
        existing.resend_count,
      );
      if (!resendCheck.ok) {
        return errorResponse("OTP_RATE_LIMITED", resendCheck.message, 429);
      }

      const { error: updateError } = await supabase
        .from("visitor_otp_challenges")
        .update({
          otp_hash: otpHash,
          expires_at: expiresAt,
          resend_count: existing.resend_count + 1,
          last_sent_at: now,
          verified_at: null,
          verification_token_hash: null,
          verification_token_expires_at: null,
          attempt_count: 0,
        })
        .eq("id", existingChallengeId);

      if (updateError) {
        return errorResponse("INTERNAL_ERROR", "Unable to resend OTP.", 500);
      }

      await sendVisitorOtpSms(visitorMobile, otpCode);

      return jsonResponse({
        challengeId: existingChallengeId,
        expiresAt,
        resendAvailableAt: getResendAvailableAt(now),
        resendCooldownSeconds: getOtpResendCooldownSeconds(),
        ...(shouldExposeDevOtpCode(devOtpClientToken)
          ? { devOtpCode: otpCode }
          : {}),
      });
    }

    const { data: recent } = await supabase
      .from("visitor_otp_challenges")
      .select("last_sent_at")
      .eq("society_id", society.id)
      .eq("created_by_app_user_id", guardUser.id)
      .eq("visitor_mobile", visitorMobile)
      .order("last_sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent?.last_sent_at) {
      const startCheck = canStartNewOtpSend(recent.last_sent_at);
      if (!startCheck.ok) {
        return errorResponse("OTP_RATE_LIMITED", startCheck.message, 429);
      }
    }

    const { data: created, error: insertError } = await supabase
      .from("visitor_otp_challenges")
      .insert({
        society_id: society.id,
        visitor_mobile: visitorMobile,
        created_by_app_user_id: guardUser.id,
        otp_hash: otpHash,
        expires_at: expiresAt,
        last_sent_at: now,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      return errorResponse("INTERNAL_ERROR", "Unable to send OTP.", 500);
    }

    await sendVisitorOtpSms(visitorMobile, otpCode);

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: guardUser.id,
      p_actor_role: guardUser.role,
      p_action: "visitor.otp.sent",
      p_entity_type: "visitor_otp_challenge",
      p_entity_id: created.id,
      p_metadata: {
        visitor_mobile: visitorMobile,
      },
    });

    return jsonResponse({
      challengeId: created.id,
      expiresAt,
      resendAvailableAt: getResendAvailableAt(now),
      resendCooldownSeconds: getOtpResendCooldownSeconds(),
      ...(shouldExposeDevOtpCode(devOtpClientToken)
        ? { devOtpCode: otpCode }
        : {}),
    });
  } catch (error) {
    console.error("send-visitor-otp unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to send OTP.", 500);
  }
});

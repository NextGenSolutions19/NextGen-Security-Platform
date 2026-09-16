import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createServiceClient } from "../_shared/supabase.ts";
import {
  createRefreshToken,
  getRefreshTokenExpiry,
  signAccessToken,
} from "../_shared/jwt.ts";
import { hashToken } from "../_shared/password.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import type { AppUserRow, AuthSessionResponse } from "../_shared/types.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

  try {
    const body = await req.json();
    const refreshToken = String(body?.refreshToken ?? "").trim();

    if (!refreshToken) {
      return errorResponse("VALIDATION_ERROR", "Refresh token is required.");
    }

    const supabase = createServiceClient();
    const refreshHash = await hashToken(refreshToken);

    const { data: matchedSession, error } = await supabase
      .from("auth_sessions")
      .select("id, app_user_id, expires_at, revoked_at")
      .eq("refresh_token_hash", refreshHash)
      .maybeSingle();

    if (error || !matchedSession || matchedSession.revoked_at) {
      return errorResponse("SESSION_EXPIRED", "Session expired.", 401);
    }

    if (new Date(matchedSession.expires_at).getTime() <= Date.now()) {
      return errorResponse("SESSION_EXPIRED", "Session expired.", 401);
    }

    const { data: user, error: userError } = await supabase
      .from("app_users")
      .select(
        "id, login_id, role, society_id, status, must_change_password, is_authorized_admin, societies(id, society_code, name, status)",
      )
      .eq("id", matchedSession.app_user_id)
      .maybeSingle();

    if (userError || !user) {
      return errorResponse("SESSION_EXPIRED", "Session expired.", 401);
    }

    const typedUser = user as AppUserRow;
    const society = Array.isArray(typedUser.societies)
      ? typedUser.societies[0]
      : typedUser.societies;

    if (
      typedUser.status !== "active" ||
      !society ||
      society.status !== "active"
    ) {
      return errorResponse(
        "ACCOUNT_DISABLED",
        "This account has been deactivated.",
        403,
      );
    }

    await supabase
      .from("auth_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", matchedSession.id);

    const newRefreshToken = createRefreshToken();
    const newRefreshHash = await hashToken(newRefreshToken);
    const refreshExpiresAt = getRefreshTokenExpiry();

    const { token: accessToken, expiresAt } = await signAccessToken(
      typedUser.id,
      {
        app_user_id: typedUser.id,
        app_role: typedUser.role,
        society_id: society.id,
        society_code: society.society_code,
        is_authorized_admin: typedUser.is_authorized_admin,
      },
    );

    const { error: insertError } = await supabase.from("auth_sessions").insert({
      app_user_id: typedUser.id,
      refresh_token_hash: newRefreshHash,
      expires_at: refreshExpiresAt.toISOString(),
    });

    if (insertError) {
      console.error("auth-refresh session insert error", insertError);
      return errorResponse("INTERNAL_ERROR", "Unable to refresh session.", 500);
    }

    const response: AuthSessionResponse = {
      session: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresAt,
        user: {
          id: typedUser.id,
          loginId: typedUser.login_id,
          role: typedUser.role,
          societyId: society.id,
          societyCode: society.society_code,
          societyName: society.name,
          mustChangePassword: typedUser.must_change_password,
          isAuthorizedAdmin: typedUser.is_authorized_admin,
        },
      },
    };

    return jsonResponse(response);
  } catch (error) {
    console.error("auth-refresh unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to refresh session.", 500);
  }
});

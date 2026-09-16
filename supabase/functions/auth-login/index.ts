import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createServiceClient } from "../_shared/supabase.ts";
import {
  createRefreshToken,
  getRefreshTokenExpiry,
  signAccessToken,
} from "../_shared/jwt.ts";
import { hashToken, verifyPassword } from "../_shared/password.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  type AppUserRow,
  type AuthSessionResponse,
} from "../_shared/types.ts";

async function registerFailedLogin(
  supabase: ReturnType<typeof createServiceClient>,
  user: AppUserRow,
): Promise<void> {
  const attempts = user.failed_login_attempts + 1;
  const lockedUntil =
    attempts >= MAX_FAILED_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;

  await supabase
    .from("app_users")
    .update({
      failed_login_attempts: attempts,
      locked_until: lockedUntil,
    })
    .eq("id", user.id);
}

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
    const societyCode = String(body?.societyCode ?? "").trim().toUpperCase();
    const loginId = String(body?.loginId ?? "").trim();
    const password = String(body?.password ?? "");

    if (!societyCode || !loginId || !password) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Society code, login ID, and password are required.",
      );
    }

    const supabase = createServiceClient();

    const { data: society, error: societyError } = await supabase
      .from("societies")
      .select("id, society_code, name, status")
      .eq("society_code", societyCode)
      .maybeSingle();

    if (societyError || !society || society.status !== "active") {
      return errorResponse("SOCIETY_NOT_FOUND", "Society code not found.", 404);
    }

    const { data: user, error: userError } = await supabase
      .from("app_users")
      .select(
        "id, login_id, password_hash, role, society_id, status, must_change_password, is_authorized_admin, failed_login_attempts, locked_until",
      )
      .eq("login_id", loginId)
      .maybeSingle();

    if (userError) {
      console.error("auth-login user query error", userError);
      return errorResponse("INTERNAL_ERROR", "Unable to sign in.", 500);
    }

    if (!user) {
      return errorResponse(
        "INVALID_CREDENTIALS",
        "Invalid login ID or password.",
        401,
      );
    }

    const typedUser = user as AppUserRow;

    if (typedUser.status !== "active") {
      return errorResponse(
        "ACCOUNT_DISABLED",
        "This account has been deactivated.",
        403,
      );
    }

    if (typedUser.society_id !== society.id) {
      return errorResponse(
        "INVALID_CREDENTIALS",
        "Invalid login ID or password.",
        401,
      );
    }

    if (typedUser.locked_until) {
      const lockedUntil = new Date(typedUser.locked_until).getTime();
      if (lockedUntil > Date.now()) {
        return errorResponse(
          "ACCOUNT_LOCKED",
          "Too many failed login attempts. Try again later.",
          429,
        );
      }
    }

    const passwordValid = await verifyPassword(password, typedUser.password_hash);
    if (!passwordValid) {
      await registerFailedLogin(supabase, typedUser);
      return errorResponse(
        "INVALID_CREDENTIALS",
        "Invalid login ID or password.",
        401,
      );
    }

    const refreshToken = createRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);
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

    const { error: sessionError } = await supabase.from("auth_sessions").insert({
      app_user_id: typedUser.id,
      refresh_token_hash: refreshTokenHash,
      expires_at: refreshExpiresAt.toISOString(),
    });

    if (sessionError) {
      console.error("auth-login session insert error", sessionError);
      return errorResponse("INTERNAL_ERROR", "Unable to sign in.", 500);
    }

    await supabase
      .from("app_users")
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      })
      .eq("id", typedUser.id);

    await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: typedUser.id,
      p_actor_role: typedUser.role,
      p_action: "auth.login.success",
      p_entity_type: "app_user",
      p_entity_id: typedUser.id,
      p_metadata: { login_id: typedUser.login_id },
    });

    const response: AuthSessionResponse = {
      session: {
        accessToken,
        refreshToken,
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
    console.error("auth-login unexpected error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to sign in.", 500);
  }
});

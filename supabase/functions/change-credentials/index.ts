import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createServiceClient } from "../_shared/supabase.ts";
import {
  createRefreshToken,
  getRefreshTokenExpiry,
  signAccessToken,
  getBearerToken,
  verifyAccessToken,
} from "../_shared/jwt.ts";
import { hashPassword, hashToken, verifyPassword } from "../_shared/password.ts";
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
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
    }

    let claims;
    try {
      claims = await verifyAccessToken(accessToken);
    } catch {
      return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
    }

    const body = await req.json();
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");
    const newLoginId = body?.newLoginId
      ? String(body.newLoginId).trim()
      : undefined;

    if (!currentPassword || !newPassword) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Current password and new password are required.",
      );
    }

    if (newPassword.length < 8) {
      return errorResponse(
        "VALIDATION_ERROR",
        "New password must be at least 8 characters.",
      );
    }

    if (newLoginId !== undefined && newLoginId.length === 0) {
      return errorResponse("VALIDATION_ERROR", "Login ID cannot be empty.");
    }

    const supabase = createServiceClient();
    const { data: user, error: userError } = await supabase
      .from("app_users")
      .select(
        "id, login_id, password_hash, role, society_id, status, must_change_password, is_authorized_admin, societies(id, society_code, name, status)",
      )
      .eq("id", claims.app_user_id)
      .maybeSingle();

    if (userError) {
      console.error("change-credentials user query error", userError);
      return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
    }

    if (!user) {
      return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
    }

    const typedUser = user as AppUserRow;
    const society = Array.isArray(typedUser.societies)
      ? typedUser.societies[0]
      : typedUser.societies;

    if (
      typedUser.status !== "active" ||
      !society ||
      society.status !== "active" ||
      typedUser.society_id !== claims.society_id
    ) {
      return errorResponse(
        "ACCOUNT_DISABLED",
        "This account has been deactivated.",
        403,
      );
    }

    const currentValid = await verifyPassword(
      currentPassword,
      typedUser.password_hash,
    );
    if (!currentValid) {
      return errorResponse(
        "INVALID_CREDENTIALS",
        "Current password is incorrect.",
        401,
      );
    }

    if (newLoginId && newLoginId !== typedUser.login_id) {
      const { data: existingLogin } = await supabase
        .from("app_users")
        .select("id")
        .eq("login_id", newLoginId)
        .maybeSingle();

      if (existingLogin) {
        return errorResponse(
          "LOGIN_ID_TAKEN",
          "This login ID is already in use.",
          409,
        );
      }
    }

    const passwordHash = await hashPassword(newPassword);
    const nextLoginId = newLoginId ?? typedUser.login_id;

    const { error: updateError } = await supabase
      .from("app_users")
      .update({
        login_id: nextLoginId,
        password_hash: passwordHash,
        must_change_password: false,
      })
      .eq("id", typedUser.id);

    if (updateError) {
      console.error("change-credentials update error", updateError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to update credentials.",
        500,
      );
    }

    const { error: revokeError } = await supabase
      .from("auth_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("app_user_id", typedUser.id)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("change-credentials revoke sessions error", revokeError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to update credentials.",
        500,
      );
    }

    const refreshToken = createRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);
    const refreshExpiresAt = getRefreshTokenExpiry();

    const { token: newAccessToken, expiresAt } = await signAccessToken(
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
      console.error("change-credentials session insert error", sessionError);
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to update credentials.",
        500,
      );
    }

    const { error: auditError } = await supabase.rpc("write_audit_log", {
      p_society_id: society.id,
      p_actor_id: typedUser.id,
      p_actor_role: typedUser.role,
      p_action: "auth.credentials.changed",
      p_entity_type: "app_user",
      p_entity_id: typedUser.id,
      p_metadata: {
        login_id_changed: nextLoginId !== typedUser.login_id,
      },
    });

    if (auditError) {
      console.error("change-credentials audit error", auditError);
      // Credentials already updated; do not fail the user flow on audit write.
    }

    const response: AuthSessionResponse = {
      session: {
        accessToken: newAccessToken,
        refreshToken,
        expiresAt,
        user: {
          id: typedUser.id,
          loginId: nextLoginId,
          role: typedUser.role,
          societyId: society.id,
          societyCode: society.society_code,
          societyName: society.name,
          mustChangePassword: false,
          isAuthorizedAdmin: typedUser.is_authorized_admin,
        },
      },
    };

    return jsonResponse(response);
  } catch (error) {
    console.error("change-credentials unexpected error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to update credentials.",
      500,
    );
  }
});

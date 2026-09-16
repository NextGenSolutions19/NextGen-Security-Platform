import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createServiceClient } from "../_shared/supabase.ts";
import { getBearerToken, verifyAccessToken } from "../_shared/jwt.ts";
import { hashToken } from "../_shared/password.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";

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
    const body = await req.json().catch(() => ({}));
    const refreshToken = String(body?.refreshToken ?? "").trim();

    const supabase = createServiceClient();
    let appUserId: string | null = null;
    let actorRole: "guard" | "society_admin" | null = null;
    let societyId: string | null = null;

    if (accessToken) {
      try {
        const claims = await verifyAccessToken(accessToken);
        appUserId = claims.app_user_id;
        actorRole = claims.app_role;
        societyId = claims.society_id;
      } catch {
        // Continue with refresh token revocation if provided.
      }
    }

    if (refreshToken) {
      const refreshHash = await hashToken(refreshToken);
      const { data: sessionRow } = await supabase
        .from("auth_sessions")
        .select("id, app_user_id, revoked_at")
        .eq("refresh_token_hash", refreshHash)
        .maybeSingle();

      if (sessionRow && !sessionRow.revoked_at) {
        await supabase
          .from("auth_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", sessionRow.id);

        if (!appUserId) {
          appUserId = sessionRow.app_user_id;
        }
      }
    }

    if (appUserId && actorRole && societyId) {
      await supabase.rpc("write_audit_log", {
        p_society_id: societyId,
        p_actor_id: appUserId,
        p_actor_role: actorRole,
        p_action: "auth.logout",
        p_entity_type: "app_user",
        p_entity_id: appUserId,
        p_metadata: {},
      });
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("auth-logout unexpected error", error);
    return jsonResponse({ success: true });
  }
});

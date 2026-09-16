import { createServiceClient } from "./supabase.ts";
import { errorResponse } from "./http.ts";
import { getBearerToken, verifyAccessToken } from "./jwt.ts";
import type { AppUserRow, SocietyRow } from "./types.ts";

export interface SocietyMemberAuthContext {
  claims: Awaited<ReturnType<typeof verifyAccessToken>>;
  user: AppUserRow;
  society: SocietyRow;
}

/**
 * Guard or society_admin JWT. Society is taken from verified claims and
 * re-checked against app_users. Used for visit-scoped photo retrieval.
 */
export async function authenticateSocietyMemberRequest(
  req: Request,
): Promise<
  | { ok: true; context: SocietyMemberAuthContext }
  | { ok: false; response: Response }
> {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return {
      ok: false,
      response: errorResponse("UNAUTHORIZED", "Authentication required.", 401),
    };
  }

  let claims;
  try {
    claims = await verifyAccessToken(accessToken);
  } catch {
    return {
      ok: false,
      response: errorResponse("UNAUTHORIZED", "Authentication required.", 401),
    };
  }

  if (claims.app_role !== "guard" && claims.app_role !== "society_admin") {
    return {
      ok: false,
      response: errorResponse(
        "FORBIDDEN",
        "You do not have permission to view visitor photos.",
        403,
      ),
    };
  }

  const supabase = createServiceClient();
  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select(
      "id, login_id, role, society_id, status, must_change_password, is_authorized_admin, failed_login_attempts, locked_until, societies(id, society_code, name, status)",
    )
    .eq("id", claims.app_user_id)
    .maybeSingle();

  if (userError || !user) {
    return {
      ok: false,
      response: errorResponse("UNAUTHORIZED", "Authentication required.", 401),
    };
  }

  const typedUser = user as AppUserRow;
  const society = Array.isArray(typedUser.societies)
    ? typedUser.societies[0]
    : typedUser.societies;

  if (
    typedUser.status !== "active" ||
    !society ||
    society.status !== "active" ||
    typedUser.society_id !== claims.society_id ||
    typedUser.role !== claims.app_role
  ) {
    return {
      ok: false,
      response: errorResponse(
        "ACCOUNT_DISABLED",
        "This account has been deactivated.",
        403,
      ),
    };
  }

  return {
    ok: true,
    context: {
      claims,
      user: typedUser,
      society,
    },
  };
}

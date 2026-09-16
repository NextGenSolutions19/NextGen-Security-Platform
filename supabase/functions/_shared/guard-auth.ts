import { createServiceClient } from "./supabase.ts";
import { errorResponse } from "./http.ts";
import { getBearerToken, verifyAccessToken } from "./jwt.ts";
import type { AppUserRow, SocietyRow } from "./types.ts";

export interface GuardAuthContext {
  claims: Awaited<ReturnType<typeof verifyAccessToken>>;
  user: AppUserRow;
  society: SocietyRow;
}

export async function authenticateGuardRequest(
  req: Request,
): Promise<
  | { ok: true; context: GuardAuthContext }
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

  if (claims.app_role !== "guard") {
    return {
      ok: false,
      response: errorResponse(
        "FORBIDDEN",
        "Only guards can perform this action.",
        403,
      ),
    };
  }

  const supabase = createServiceClient();
  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select(
      "id, login_id, password_hash, role, society_id, status, must_change_password, is_authorized_admin, failed_login_attempts, locked_until, societies(id, society_code, name, status)",
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
    typedUser.role !== "guard"
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

import { SignJWT, jwtVerify } from "npm:jose@5";
import { isAllowedAppRole, type AppJwtRole } from "./jwt-role.ts";

export { isAllowedAppRole, type AppJwtRole };

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export interface AppJwtClaims {
  app_user_id: string;
  app_role: AppJwtRole;
  society_id: string;
  society_code: string;
  is_authorized_admin: boolean;
}

export interface VerifiedAccessToken extends AppJwtClaims {
  sub: string;
  exp: number;
}

function getJwtSecret(): Uint8Array {
  const secret = Deno.env.get("JWT_SECRET") ?? Deno.env.get("SUPABASE_JWT_SECRET");
  if (!secret) {
    throw new Error("Missing JWT secret.");
  }
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  userId: string,
  claims: AppJwtClaims,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({
    ...claims,
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret());

  return { token, expiresAt: expiresAt * 1000 };
}

export function createRefreshToken(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

export function getRefreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}

export async function verifyAccessToken(
  token: string,
): Promise<VerifiedAccessToken> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    audience: "authenticated",
  });

  const appUserId = payload.app_user_id as string | undefined;
  const appRole = payload.app_role;
  const societyId = payload.society_id as string | undefined;
  const societyCode = payload.society_code as string | undefined;
  const isAuthorizedAdmin = Boolean(payload.is_authorized_admin);
  const sub = payload.sub as string | undefined;
  const exp = payload.exp as number | undefined;

  if (
    !appUserId ||
    !isAllowedAppRole(appRole) ||
    !societyId ||
    !societyCode ||
    !sub ||
    !exp
  ) {
    throw new Error("Invalid access token claims.");
  }

  return {
    sub,
    exp,
    app_user_id: appUserId,
    app_role: appRole,
    society_id: societyId,
    society_code: societyCode,
    is_authorized_admin: isAuthorizedAdmin,
  };
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

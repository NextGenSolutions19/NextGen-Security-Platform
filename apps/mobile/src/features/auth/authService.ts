import type {
  AuthSession,
  ChangeCredentialsInput,
  LoginCredentials,
  LoginResult,
  SocietyContext,
  UserRole,
} from "@nextgen/shared";
import { AuthError, type AuthErrorCode } from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

interface ValidateSocietyCodeErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

async function parseValidateSocietyCodeFunctionError(
  error: unknown,
  fallbackMessage: string,
): Promise<AuthError> {
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.json()) as ValidateSocietyCodeErrorBody;
      return new AuthError(
        body.error?.message ?? fallbackMessage,
        mapErrorCode(body.error?.code),
      );
    } catch {
      // Fall through to fallback error.
    }
  }

  return new AuthError(fallbackMessage, "NETWORK_ERROR");
}

interface AuthLoginResponse {
  session: AuthSession;
}

interface ValidateSocietyCodeResponse {
  society: SocietyContext;
}

function mapErrorCode(code?: string): AuthErrorCode {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "INVALID_CREDENTIALS";
    case "ACCOUNT_DISABLED":
      return "ACCOUNT_DISABLED";
    case "ACCOUNT_LOCKED":
      return "ACCOUNT_LOCKED";
    case "SOCIETY_NOT_FOUND":
      return "SOCIETY_NOT_FOUND";
    case "SOCIETY_MISMATCH":
      return "SOCIETY_MISMATCH";
    case "SESSION_EXPIRED":
    case "UNAUTHORIZED":
      return "SESSION_EXPIRED";
    case "LOGIN_ID_TAKEN":
      return "LOGIN_ID_TAKEN";
    case "BACKEND_NOT_CONFIGURED":
      return "BACKEND_NOT_CONFIGURED";
    default:
      return "UNKNOWN";
  }
}

function readFunctionErrorBody(body: unknown): FunctionErrorBody | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  return body as FunctionErrorBody;
}

async function parseFunctionError(
  error: unknown,
  fallbackMessage: string,
  fallbackCode: AuthErrorCode,
  responseData?: unknown,
): Promise<AuthError> {
  const fromData = readFunctionErrorBody(responseData);
  if (fromData?.error?.message) {
    return new AuthError(
      fromData.error.message,
      mapErrorCode(fromData.error.code),
    );
  }

  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = readFunctionErrorBody(await error.context.json());
      if (body?.error?.message) {
        return new AuthError(
          body.error.message,
          mapErrorCode(body.error.code),
        );
      }
    } catch {
      // Fall through to fallback error.
    }
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim();
    if (message && message !== "Edge Function returned a non-2xx status code") {
      return new AuthError(message, fallbackCode);
    }
  }

  return new AuthError(fallbackMessage, fallbackCode);
}

function assertNoFunctionError(
  data: unknown,
  fallbackMessage: string,
  fallbackCode: AuthErrorCode,
): void {
  const body = data as FunctionErrorBody;
  if (body?.error?.message) {
    throw new AuthError(body.error.message, mapErrorCode(body.error.code));
  }

  if (!data) {
    throw new AuthError(fallbackMessage, fallbackCode);
  }
}

function applySession(session: AuthSession): LoginResult {
  setSupabaseAccessToken(session.accessToken);
  return { session };
}

function isDevMockAuthEnabled(): boolean {
  return (
    typeof __DEV__ !== "undefined" &&
    __DEV__ === true &&
    process.env.EXPO_PUBLIC_ENABLE_DEV_MOCK_AUTH === "true"
  );
}

function readDevMockConfig() {
  return {
    societyCode: process.env.EXPO_PUBLIC_DEV_MOCK_SOCIETY_CODE ?? "",
    societyName: process.env.EXPO_PUBLIC_DEV_MOCK_SOCIETY_NAME ?? "Development Society",
    guardLoginId: process.env.EXPO_PUBLIC_DEV_MOCK_GUARD_LOGIN_ID ?? "",
    guardPassword: process.env.EXPO_PUBLIC_DEV_MOCK_GUARD_PASSWORD ?? "",
    adminLoginId: process.env.EXPO_PUBLIC_DEV_MOCK_ADMIN_LOGIN_ID ?? "",
    adminPassword: process.env.EXPO_PUBLIC_DEV_MOCK_ADMIN_PASSWORD ?? "",
  };
}

async function validateSocietyCodeWithMock(
  societyCode: string,
): Promise<SocietyContext> {
  const mock = readDevMockConfig();

  if (!mock.societyCode) {
    throw new AuthError(
      "Development mock society code is not configured.",
      "BACKEND_NOT_CONFIGURED",
    );
  }

  if (societyCode.toUpperCase() !== mock.societyCode.toUpperCase()) {
    throw new AuthError("Society code not found.", "SOCIETY_NOT_FOUND");
  }

  return {
    societyId: "dev-society-id",
    societyCode: mock.societyCode.toUpperCase(),
    societyName: mock.societyName,
  };
}

async function loginWithMock(
  credentials: LoginCredentials,
): Promise<LoginResult> {
  const mock = readDevMockConfig();
  const societyCode = credentials.societyCode.toUpperCase();

  if (societyCode !== mock.societyCode.toUpperCase()) {
    throw new AuthError("Society code not found.", "SOCIETY_NOT_FOUND");
  }

  let role: UserRole | null = null;

  if (
    mock.guardLoginId &&
    credentials.loginId === mock.guardLoginId &&
    credentials.password === mock.guardPassword
  ) {
    role = "guard";
  } else if (
    mock.adminLoginId &&
    credentials.loginId === mock.adminLoginId &&
    credentials.password === mock.adminPassword
  ) {
    role = "society_admin";
  }

  if (!role) {
    throw new AuthError("Invalid login ID or password.", "INVALID_CREDENTIALS");
  }

  const session: AuthSession = {
    accessToken: `dev-token-${Date.now()}`,
    refreshToken: `dev-refresh-${Date.now()}`,
    expiresAt: Date.now() + 1000 * 60 * 60 * 8,
    user: {
      id: role === "guard" ? "dev-guard-id" : "dev-admin-id",
      loginId: credentials.loginId,
      role,
      societyId: "dev-society-id",
      societyCode,
      societyName: mock.societyName,
      mustChangePassword: false,
      isAuthorizedAdmin: role === "society_admin",
    },
  };

  return applySession(session);
}

export async function validateSocietyCode(
  societyCode: string,
): Promise<SocietyContext> {
  const normalizedCode = societyCode.trim().toUpperCase();

  if (!isSupabaseConfigured()) {
    if (isDevMockAuthEnabled()) {
      return validateSocietyCodeWithMock(normalizedCode);
    }

    throw new AuthError(
      "Backend is not configured. Set Supabase environment variables or enable development mock auth.",
      "BACKEND_NOT_CONFIGURED",
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new AuthError("Unable to initialize backend client.", "UNKNOWN");
  }

  const { data, error } = await supabase.functions.invoke<ValidateSocietyCodeResponse>(
    "validate-society-code",
    {
      body: { societyCode: normalizedCode },
    },
  );

  if (error) {
    throw await parseValidateSocietyCodeFunctionError(
      error,
      "Unable to validate society code. Check your connection and try again.",
    );
  }

  const responseBody = data as ValidateSocietyCodeErrorBody;
  if (responseBody?.error?.message) {
    throw new AuthError(
      responseBody.error.message,
      mapErrorCode(responseBody.error.code),
    );
  }

  if (!data) {
    throw new AuthError("Society code not found.", "SOCIETY_NOT_FOUND");
  }

  const response = data as ValidateSocietyCodeResponse;
  return response.society;
}

export async function login(credentials: LoginCredentials): Promise<LoginResult> {
  const societyCode = credentials.societyCode.trim().toUpperCase();
  const loginId = credentials.loginId.trim();

  if (!isSupabaseConfigured()) {
    if (isDevMockAuthEnabled()) {
      return loginWithMock({ ...credentials, societyCode, loginId });
    }

    throw new AuthError(
      "Backend is not configured. Set Supabase environment variables or enable development mock auth.",
      "BACKEND_NOT_CONFIGURED",
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new AuthError("Unable to initialize backend client.", "UNKNOWN");
  }

  const { data, error } = await supabase.functions.invoke<AuthLoginResponse>(
    "auth-login",
    {
      body: {
        societyCode,
        loginId,
        password: credentials.password,
      },
    },
  );

  if (error) {
    throw await parseFunctionError(
      error,
      "Unable to sign in. Check your connection and try again.",
      "NETWORK_ERROR",
    );
  }

  assertNoFunctionError(
    data,
    "Invalid login ID or password.",
    "INVALID_CREDENTIALS",
  );

  const response = data as AuthLoginResponse;

  if (response.session.user.societyCode !== societyCode) {
    throw new AuthError(
      "This account does not belong to the selected society.",
      "SOCIETY_MISMATCH",
    );
  }

  return applySession(response.session);
}

export async function refreshSession(
  refreshToken: string,
): Promise<LoginResult> {
  if (!isSupabaseConfigured()) {
    throw new AuthError("Backend is not configured.", "BACKEND_NOT_CONFIGURED");
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new AuthError("Unable to initialize backend client.", "UNKNOWN");
  }

  const { data, error } = await supabase.functions.invoke<AuthLoginResponse>(
    "auth-refresh",
    {
      body: { refreshToken },
    },
  );

  if (error) {
    throw await parseFunctionError(
      error,
      "Session expired. Please sign in again.",
      "SESSION_EXPIRED",
    );
  }

  assertNoFunctionError(
    data,
    "Session expired. Please sign in again.",
    "SESSION_EXPIRED",
  );

  return applySession((data as AuthLoginResponse).session);
}

export async function changeCredentials(
  input: ChangeCredentialsInput,
  accessToken: string,
): Promise<LoginResult> {
  if (!isSupabaseConfigured()) {
    throw new AuthError("Backend is not configured.", "BACKEND_NOT_CONFIGURED");
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new AuthError("Unable to initialize backend client.", "UNKNOWN");
  }

  const { data, error } = await supabase.functions.invoke<AuthLoginResponse>(
    "change-credentials",
    {
      body: input,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    throw await parseFunctionError(
      error,
      "Unable to update credentials.",
      "UNKNOWN",
      data,
    );
  }

  assertNoFunctionError(data, "Unable to update credentials.", "UNKNOWN");

  const response = data as AuthLoginResponse;
  if (!response?.session) {
    throw new AuthError("Unable to update credentials.", "UNKNOWN");
  }

  return applySession(response.session);
}

export async function logout(session: AuthSession | null): Promise<void> {
  if (!session || !isSupabaseConfigured()) {
    setSupabaseAccessToken(null);
    return;
  }

  setSupabaseAccessToken(session.accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    setSupabaseAccessToken(null);
    return;
  }

  try {
    await supabase.functions.invoke("auth-logout", {
      body: { refreshToken: session.refreshToken },
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
  } finally {
    setSupabaseAccessToken(null);
  }
}

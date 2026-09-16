import {
  GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE,
  mapGuardAccount,
  type GuardAccount,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

export class GuardManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardManagementError";
  }
}

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
  guards?: unknown[];
  guard?: Record<string, unknown>;
  passwordReset?: boolean;
}

async function readFunctionError(
  error: unknown,
): Promise<{ status?: number; code?: string; message?: string }> {
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    const status = error.context.status;
    try {
      const body = (await error.context.json()) as FunctionErrorBody;
      return {
        status,
        code: body.error?.code ?? body.code,
        message: body.error?.message ?? body.message,
      };
    } catch {
      return { status };
    }
  }
  return {};
}

function mapUserMessage(parsed: {
  status?: number;
  code?: string;
  message?: string;
}): string {
  if (parsed.status === 401 || parsed.code === "UNAUTHORIZED") {
    return "Your session has expired. Please login again.";
  }
  if (
    parsed.status === 403 ||
    parsed.code === "FORBIDDEN" ||
    parsed.code === "ACCOUNT_DISABLED"
  ) {
    return parsed.message ?? "You do not have permission to perform this action.";
  }
  if (parsed.status === 404 || parsed.code === "NOT_FOUND") {
    return "Guard account not found.";
  }
  if (parsed.status === 409 || parsed.code === "LOGIN_ID_TAKEN") {
    return parsed.message ?? "This login ID is already in use.";
  }
  return parsed.message ?? GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE;
}

function assertConfiguredClient(accessToken: string) {
  if (!isSupabaseConfigured()) {
    throw new GuardManagementError(GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new GuardManagementError(GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  return supabase;
}

async function invokeGuardManagement(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<FunctionErrorBody> {
  const supabase = assertConfiguredClient(accessToken);
  const { data, error } = await supabase.functions.invoke<FunctionErrorBody>(
    "admin-guard-management",
    {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    const parsed = await readFunctionError(error);
    throw new GuardManagementError(mapUserMessage(parsed));
  }
  if (data?.error?.code) {
    throw new GuardManagementError(
      mapUserMessage({
        code: data.error.code,
        message: data.error.message,
      }),
    );
  }
  return data ?? {};
}

function optionalText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function parseGuard(raw: Record<string, unknown> | undefined): GuardAccount {
  if (!raw) {
    throw new GuardManagementError(GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  if ("passwordHash" in raw || "password_hash" in raw) {
    throw new GuardManagementError(GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  const mapped = mapGuardAccount({
    id: String(raw.id ?? ""),
    login_id: String(raw.loginId ?? raw.login_id ?? ""),
    role: String(raw.role ?? "guard"),
    status: String(raw.status ?? ""),
    must_change_password:
      raw.mustChangePassword === true || raw.must_change_password === true,
    admin_name: optionalText(raw.guardName ?? raw.admin_name ?? raw.adminName),
    mobile_number: optionalText(raw.mobileNumber ?? raw.mobile_number),
    on_duty: raw.onDuty === true || raw.on_duty === true,
  });
  if (!mapped) {
    throw new GuardManagementError(GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  return mapped;
}

export async function listGuardAccounts(accessToken: string): Promise<GuardAccount[]> {
  const data = await invokeGuardManagement(accessToken, { action: "list_guards" });
  if (!Array.isArray(data.guards)) {
    throw new GuardManagementError(GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  return data.guards.map((row) => parseGuard(row as Record<string, unknown>));
}

export async function createGuardAccount(
  accessToken: string,
  input: { guardName: string; mobileNumber: string | null; password: string },
): Promise<GuardAccount> {
  const data = await invokeGuardManagement(accessToken, {
    action: "create_guard",
    guardName: input.guardName,
    mobileNumber: input.mobileNumber,
    password: input.password,
  });
  return parseGuard(data.guard);
}

export async function updateGuardAccount(
  accessToken: string,
  input: { guardId: string; guardName: string; mobileNumber: string | null },
): Promise<GuardAccount> {
  const data = await invokeGuardManagement(accessToken, {
    action: "update_guard",
    guardId: input.guardId,
    guardName: input.guardName,
    mobileNumber: input.mobileNumber,
  });
  return parseGuard(data.guard);
}

export async function setGuardAccountStatus(
  accessToken: string,
  input: { guardId: string; status: "active" | "disabled" },
): Promise<GuardAccount> {
  const data = await invokeGuardManagement(accessToken, {
    action: "set_guard_status",
    guardId: input.guardId,
    status: input.status,
  });
  return parseGuard(data.guard);
}

export async function resetGuardAccountPassword(
  accessToken: string,
  input: { guardId: string; password: string },
): Promise<GuardAccount> {
  const data = await invokeGuardManagement(accessToken, {
    action: "reset_guard_password",
    guardId: input.guardId,
    password: input.password,
  });
  return parseGuard(data.guard);
}

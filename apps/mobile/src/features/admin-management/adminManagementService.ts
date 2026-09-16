import {
  ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE,
  mapAdminAccount,
  mapSocietyInformation,
  type AdminAccount,
  type AdminProfile,
  type SocietyInformation,
} from "@nextgen/shared";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  setSupabaseAccessToken,
} from "@/lib/supabase/client";

export class AdminManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminManagementError";
  }
}

interface FunctionErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
  society?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  admins?: unknown[];
  admin?: Record<string, unknown>;
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
    return "Admin account not found.";
  }
  if (parsed.status === 409 || parsed.code === "LOGIN_ID_TAKEN") {
    return parsed.message ?? "This login ID is already in use.";
  }
  return parsed.message ?? ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE;
}

function assertConfiguredClient(accessToken: string) {
  if (!isSupabaseConfigured()) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }

  setSupabaseAccessToken(accessToken);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }

  return supabase;
}

async function invokeAdminManagement(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<FunctionErrorBody> {
  const supabase = assertConfiguredClient(accessToken);
  const { data, error } = await supabase.functions.invoke<FunctionErrorBody>(
    "admin-management",
    {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (error) {
    const parsed = await readFunctionError(error);
    throw new AdminManagementError(mapUserMessage(parsed));
  }

  if (data?.error?.code) {
    throw new AdminManagementError(
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

function parseSociety(raw: Record<string, unknown> | undefined): SocietyInformation {
  if (!raw) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  const mapped = mapSocietyInformation({
    id: String(raw.id ?? ""),
    society_code: String(raw.society_code ?? raw.societyCode ?? ""),
    name: String(raw.name ?? ""),
    status: String(raw.status ?? ""),
    address: optionalText(raw.address),
    city: optionalText(raw.city),
    state: optionalText(raw.state),
    pin_code: optionalText(raw.pin_code ?? raw.pinCode),
    contact_number: optionalText(raw.contact_number ?? raw.contactNumber),
    email: optionalText(raw.email),
  });
  if (!mapped) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  return mapped;
}

function parseProfile(raw: Record<string, unknown> | undefined): AdminProfile {
  if (
    !raw ||
    typeof raw.id !== "string" ||
    typeof raw.loginId !== "string" ||
    raw.role !== "society_admin" ||
    (raw.status !== "active" && raw.status !== "disabled") ||
    typeof raw.societyId !== "string" ||
    typeof raw.societyCode !== "string" ||
    typeof raw.societyName !== "string"
  ) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  if ("passwordHash" in raw || "password_hash" in raw) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  return {
    id: raw.id,
    loginId: raw.loginId,
    role: "society_admin",
    status: raw.status,
    isAuthorizedAdmin: raw.isAuthorizedAdmin === true,
    societyId: raw.societyId,
    societyCode: raw.societyCode,
    societyName: raw.societyName,
    adminName: optionalText(raw.adminName ?? raw.admin_name),
    mobileNumber: optionalText(raw.mobileNumber ?? raw.mobile_number),
    email: optionalText(raw.email),
  };
}

function parseAdmin(raw: Record<string, unknown> | undefined): AdminAccount {
  if (!raw) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  if ("passwordHash" in raw || "password_hash" in raw) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  const mapped = mapAdminAccount({
    id: String(raw.id ?? ""),
    login_id: String(raw.loginId ?? raw.login_id ?? ""),
    role: String(raw.role ?? "society_admin"),
    status: String(raw.status ?? ""),
    is_authorized_admin:
      raw.isAuthorizedAdmin === true || raw.is_authorized_admin === true,
    admin_name: optionalText(raw.adminName ?? raw.admin_name),
    mobile_number: optionalText(raw.mobileNumber ?? raw.mobile_number),
    email: optionalText(raw.email),
  });
  if (!mapped) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  return mapped;
}

export async function getSocietyInformation(
  accessToken: string,
): Promise<SocietyInformation> {
  const data = await invokeAdminManagement(accessToken, { action: "get_society" });
  return parseSociety(data.society);
}

export async function saveSocietyInformation(
  accessToken: string,
  input: {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pinCode: string | null;
    contactNumber: string | null;
    email: string | null;
  },
): Promise<SocietyInformation> {
  const data = await invokeAdminManagement(accessToken, {
    action: "save_society",
    name: input.name,
    address: input.address,
    city: input.city,
    state: input.state,
    pinCode: input.pinCode,
    contactNumber: input.contactNumber,
    email: input.email,
  });
  return parseSociety(data.society);
}

export async function getAdminProfile(accessToken: string): Promise<AdminProfile> {
  const data = await invokeAdminManagement(accessToken, { action: "get_profile" });
  return parseProfile(data.profile);
}

export async function saveAdminProfile(
  accessToken: string,
  input: {
    adminName: string;
    mobileNumber: string | null;
    email: string | null;
  },
): Promise<AdminProfile> {
  const data = await invokeAdminManagement(accessToken, {
    action: "save_profile",
    adminName: input.adminName,
    mobileNumber: input.mobileNumber,
    email: input.email,
  });
  return parseProfile(data.profile);
}

export async function listAdminAccounts(accessToken: string): Promise<AdminAccount[]> {
  const data = await invokeAdminManagement(accessToken, { action: "list_admins" });
  if (!Array.isArray(data.admins)) {
    throw new AdminManagementError(ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE);
  }
  return data.admins.map((row) => parseAdmin(row as Record<string, unknown>));
}

export async function createAdminAccount(
  accessToken: string,
  input: {
    adminName: string;
    mobileNumber: string | null;
    email: string | null;
    password: string;
  },
): Promise<AdminAccount> {
  const data = await invokeAdminManagement(accessToken, {
    action: "create_admin",
    adminName: input.adminName,
    mobileNumber: input.mobileNumber,
    email: input.email,
    password: input.password,
  });
  return parseAdmin(data.admin);
}

export async function updateAdminAccount(
  accessToken: string,
  input: {
    adminId: string;
    adminName: string;
    mobileNumber: string | null;
    email: string | null;
  },
): Promise<AdminAccount> {
  const data = await invokeAdminManagement(accessToken, {
    action: "update_admin",
    adminId: input.adminId,
    adminName: input.adminName,
    mobileNumber: input.mobileNumber,
    email: input.email,
  });
  return parseAdmin(data.admin);
}

export async function setAdminAccountStatus(
  accessToken: string,
  input: { adminId: string; status: "active" | "disabled" },
): Promise<AdminAccount> {
  const data = await invokeAdminManagement(accessToken, {
    action: "set_admin_status",
    adminId: input.adminId,
    status: input.status,
  });
  return parseAdmin(data.admin);
}

export async function setAdminAuthorized(
  accessToken: string,
  input: { adminId: string; isAuthorizedAdmin: boolean },
): Promise<AdminAccount> {
  const data = await invokeAdminManagement(accessToken, {
    action: "set_authorized_admin",
    adminId: input.adminId,
    isAuthorizedAdmin: input.isAuthorizedAdmin,
  });
  return parseAdmin(data.admin);
}

export async function resetAdminAccountPassword(
  accessToken: string,
  input: { adminId: string; password: string },
): Promise<AdminAccount> {
  const data = await invokeAdminManagement(accessToken, {
    action: "reset_admin_password",
    adminId: input.adminId,
    password: input.password,
  });
  return parseAdmin(data.admin);
}

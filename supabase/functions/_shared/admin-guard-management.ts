import {
  ADMIN_NAME_MAX_LENGTH,
  parseAccountStatus,
  parseAdminMobileNumber,
  parseNewPassword,
  rejectClientSocietyId,
  type AdminAccountStatus,
} from "./admin-management.ts";

export const GUARD_MANAGEMENT_LOAD_FAILED_MESSAGE =
  "Unable to load guard management data.";
export const GUARD_ACCOUNT_CREATED_MESSAGE = "Guard account created.";
export const GUARD_ACCOUNT_UPDATED_MESSAGE = "Guard account updated.";
export const GUARD_ACCOUNT_STATUS_UPDATED_MESSAGE = "Guard account updated.";
export const GUARD_PASSWORD_RESET_MESSAGE =
  "Password reset. The guard must sign in with the new password.";
export const GUARD_DEACTIVATE_CONFIRM_TITLE = "Deactivate Guard?";
export const GUARD_DEACTIVATE_CONFIRM_MESSAGE =
  "This Guard will no longer be able to sign in or access the Guard app until reactivated.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERATED_GUARD_LOGIN_PATTERN = /^GUARD([0-9]+)$/;

export interface GuardAccount {
  id: string;
  loginId: string;
  role: "guard";
  status: AdminAccountStatus;
  mustChangePassword: boolean;
  guardName: string | null;
  mobileNumber: string | null;
  onDuty: boolean;
}

export interface GuardProfileSave {
  guardName: string;
  mobileNumber: string | null;
}

export function parseGuardManagementAction(body: unknown):
  | {
      ok: true;
      action:
        | "list_guards"
        | "create_guard"
        | "update_guard"
        | "set_guard_status"
        | "reset_guard_password";
    }
  | { ok: false; code: string; message: string; status: number } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Request body must be a JSON object.",
      status: 400,
    };
  }

  const record = body as Record<string, unknown>;
  const societyError = rejectClientSocietyId(record);
  if (societyError) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: societyError,
      status: 400,
    };
  }

  const action = String(record.action ?? "").trim();
  const allowed = [
    "list_guards",
    "create_guard",
    "update_guard",
    "set_guard_status",
    "reset_guard_password",
  ] as const;
  if (!allowed.includes(action as (typeof allowed)[number])) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "action is invalid.",
      status: 400,
    };
  }

  return { ok: true, action: action as (typeof allowed)[number] };
}

export function parseGuardName(value: unknown):
  | { ok: true; guardName: string }
  | { ok: false; message: string } {
  const guardName = String(value ?? "").trim();
  if (!guardName) {
    return { ok: false, message: "Guard name is required." };
  }
  if (guardName.length > ADMIN_NAME_MAX_LENGTH) {
    return { ok: false, message: "Guard name is too long." };
  }
  return { ok: true, guardName };
}

export function parseGuardProfileSave(body: unknown):
  | { ok: true; value: GuardProfileSave }
  | { ok: false; message: string } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const record = body as Record<string, unknown>;
  const nameParsed = parseGuardName(record.guardName ?? record.guard_name ?? record.adminName);
  if (!nameParsed.ok) {
    return nameParsed;
  }
  const mobileParsed = parseAdminMobileNumber(
    record.mobileNumber ?? record.mobile_number,
  );
  if (!mobileParsed.ok) {
    return mobileParsed;
  }
  return {
    ok: true,
    value: {
      guardName: nameParsed.guardName,
      mobileNumber: mobileParsed.mobileNumber,
    },
  };
}

export function toGuardProfileUpdateRow(value: GuardProfileSave): {
  admin_name: string;
  mobile_number: string | null;
} {
  return {
    admin_name: value.guardName,
    mobile_number: value.mobileNumber,
  };
}

export function parseGuardUserId(value: unknown):
  | { ok: true; guardId: string }
  | { ok: false; message: string } {
  const guardId = String(value ?? "").trim();
  if (!UUID_PATTERN.test(guardId)) {
    return { ok: false, message: "Guard ID is invalid." };
  }
  return { ok: true, guardId };
}

export function parseGuardAccountStatus(value: unknown) {
  return parseAccountStatus(value);
}

export function parseGuardPassword(value: unknown) {
  return parseNewPassword(value);
}

function parseGeneratedGuardLoginSuffix(loginId: string): number | null {
  const match = GENERATED_GUARD_LOGIN_PATTERN.exec(loginId.trim().toUpperCase());
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export function nextGuardLoginSequence(existingLoginIds: string[]): number {
  let max = 0;
  for (const loginId of existingLoginIds) {
    const suffix = parseGeneratedGuardLoginSuffix(loginId);
    if (suffix != null && suffix > max) {
      max = suffix;
    }
  }
  return max + 1;
}

export function formatGeneratedGuardLoginId(sequence: number): string {
  const width = Math.max(2, String(sequence).length);
  return `GUARD${String(sequence).padStart(width, "0")}`;
}

export function allocateGeneratedGuardLoginId(input: {
  societyLoginIds: string[];
  globallyTakenLoginIds: string[];
}): string {
  const taken = new Set(
    [...input.societyLoginIds, ...input.globallyTakenLoginIds].map((id) =>
      id.trim().toUpperCase(),
    ),
  );
  let sequence = nextGuardLoginSequence(input.societyLoginIds);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = formatGeneratedGuardLoginId(sequence);
    if (!taken.has(candidate)) {
      return candidate;
    }
    sequence += 1;
  }
  throw new Error("Unable to allocate guard login id.");
}

export function formatGuardCreatedMessage(loginId: string): string {
  return `Guard created successfully.\nLogin ID: ${loginId}`;
}

export function formatGuardAccountStatus(status: string): string {
  return status === "disabled" ? "Disabled" : "Active";
}

export function formatGuardDutyLabel(onDuty: boolean): string {
  return onDuty ? "On Duty" : "Off Duty";
}

export function mapGuardAccount(row: {
  id: string;
  login_id: string;
  role: string;
  status: string;
  must_change_password?: boolean;
  admin_name?: string | null;
  mobile_number?: string | null;
  on_duty?: boolean;
  password_hash?: string;
}): GuardAccount | null {
  if (row.role !== "guard") {
    return null;
  }
  if (row.status !== "active" && row.status !== "disabled") {
    return null;
  }
  if ("password_hash" in row && row.password_hash != null) {
    return null;
  }
  return {
    id: row.id,
    loginId: row.login_id,
    role: "guard",
    status: row.status,
    mustChangePassword: row.must_change_password === true,
    guardName: row.admin_name?.trim() ? row.admin_name.trim() : null,
    mobileNumber: row.mobile_number?.trim() ? row.mobile_number.trim() : null,
    onDuty: row.on_duty === true,
  };
}

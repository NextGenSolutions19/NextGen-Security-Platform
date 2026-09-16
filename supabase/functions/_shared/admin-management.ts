export const ADMIN_MANAGEMENT_LOAD_FAILED_MESSAGE =
  "Unable to load admin management data.";

export const SOCIETY_SAVE_SUCCESS_MESSAGE = "Society information saved.";
export const ADMIN_PASSWORD_CHANGED_MESSAGE = "Password updated.";
export const ADMIN_ACCOUNT_CREATED_MESSAGE = "Admin account created.";
export const ADMIN_PROFILE_SAVED_MESSAGE = "Admin profile saved.";
export const ADMIN_ACCOUNT_STATUS_UPDATED_MESSAGE = "Admin account updated.";
export const ADMIN_PASSWORD_RESET_MESSAGE =
  "Password reset. The admin must sign in with the new password.";
export const ADMIN_PROMOTED_MESSAGE = "Admin is now an Authorized Admin.";
export const ADMIN_DEMOTED_MESSAGE = "Authorized access removed.";
export const ADMIN_PROMOTE_CONFIRM_TITLE = "Make Authorized Admin?";
export const ADMIN_PROMOTE_CONFIRM_MESSAGE =
  "This Admin will gain Admin Account Management authority, including creating and managing other Admin accounts in this society.";
export const ADMIN_DEMOTE_CONFIRM_TITLE = "Remove Authorized Access?";
export const ADMIN_DEMOTE_CONFIRM_MESSAGE =
  "This Admin will become a normal Admin and will no longer manage other Admin accounts.";

export const SOCIETY_NAME_MAX_LENGTH = 120;
export const SOCIETY_ADDRESS_MAX_LENGTH = 200;
export const SOCIETY_CITY_MAX_LENGTH = 80;
export const SOCIETY_STATE_MAX_LENGTH = 80;
export const SOCIETY_EMAIL_MAX_LENGTH = 120;
export const SOCIETY_CONTACT_MIN_DIGITS = 8;
export const SOCIETY_CONTACT_MAX_DIGITS = 15;
export const LOGIN_ID_MAX_LENGTH = 64;
export const ADMIN_PASSWORD_MIN_LENGTH = 8;
export const ADMIN_NAME_MAX_LENGTH = 80;

export const ADMIN_PROFILE_WRITABLE_COLUMNS = [
  "admin_name",
  "mobile_number",
  "email",
] as const;

export const ADMIN_PROFILE_PROTECTED_COLUMNS = [
  "id",
  "login_id",
  "role",
  "society_id",
  "status",
  "is_authorized_admin",
] as const;

export const SOCIETY_INFORMATION_WRITABLE_COLUMNS = [
  "name",
  "address",
  "city",
  "state",
  "pin_code",
  "contact_number",
  "email",
] as const;

export const SOCIETY_INFORMATION_PROTECTED_COLUMNS = [
  "id",
  "society_code",
  "status",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN_CODE_PATTERN = /^[0-9]{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_ALLOWED_PATTERN = /^[0-9+\-() ]+$/;
const INDIAN_MOBILE_PATTERN = /^[6-9][0-9]{9}$/;
const GENERATED_ADMIN_LOGIN_PATTERN = /^ADMIN([0-9]+)$/;

export type AdminAccountStatus = "active" | "disabled";

export interface SocietyInformation {
  id: string;
  societyCode: string;
  name: string;
  status: AdminAccountStatus;
  address: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  contactNumber: string | null;
  email: string | null;
}

export interface SocietyInformationSave {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  contactNumber: string | null;
  email: string | null;
}

export interface AdminProfile {
  id: string;
  loginId: string;
  role: "society_admin";
  status: AdminAccountStatus;
  isAuthorizedAdmin: boolean;
  societyId: string;
  societyCode: string;
  societyName: string;
  adminName: string | null;
  mobileNumber: string | null;
  email: string | null;
}

export interface AdminAccount {
  id: string;
  loginId: string;
  role: "society_admin";
  status: AdminAccountStatus;
  isAuthorizedAdmin: boolean;
  adminName: string | null;
  mobileNumber: string | null;
  email: string | null;
}

export interface AdminProfileSave {
  adminName: string;
  mobileNumber: string | null;
  email: string | null;
}

export function rejectClientSocietyId(body: Record<string, unknown>): string | null {
  if ("society_id" in body || "societyId" in body) {
    return "Society is taken from the authenticated session.";
  }
  return null;
}

export function parseAdminManagementAction(body: unknown):
  | {
      ok: true;
      action:
        | "get_society"
        | "save_society"
        | "get_profile"
        | "save_profile"
        | "list_admins"
        | "create_admin"
        | "update_admin"
        | "set_admin_status"
        | "set_authorized_admin"
        | "reset_admin_password";
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
    "get_society",
    "save_society",
    "get_profile",
    "save_profile",
    "list_admins",
    "create_admin",
    "update_admin",
    "set_admin_status",
    "set_authorized_admin",
    "reset_admin_password",
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

export function parseSocietyName(value: unknown):
  | { ok: true; name: string }
  | { ok: false; message: string } {
  const name = String(value ?? "").trim();
  if (!name) {
    return { ok: false, message: "Society name is required." };
  }
  if (name.length > SOCIETY_NAME_MAX_LENGTH) {
    return { ok: false, message: "Society name is too long." };
  }
  return { ok: true, name };
}

function parseOptionalText(
  value: unknown,
  maxLength: number,
  label: string,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const text = String(value ?? "").trim();
  if (!text) {
    return { ok: true, value: null };
  }
  if (text.length > maxLength) {
    return { ok: false, message: `${label} is too long.` };
  }
  return { ok: true, value: text };
}

export function parseSocietyPinCode(value: unknown):
  | { ok: true; pinCode: string | null }
  | { ok: false; message: string } {
  const pinCode = String(value ?? "").trim();
  if (!pinCode) {
    return { ok: true, pinCode: null };
  }
  if (!PIN_CODE_PATTERN.test(pinCode)) {
    return { ok: false, message: "PIN code must be 6 digits." };
  }
  return { ok: true, pinCode };
}

export function parseSocietyContactNumber(value: unknown):
  | { ok: true; contactNumber: string | null }
  | { ok: false; message: string } {
  const contactNumber = String(value ?? "").trim();
  if (!contactNumber) {
    return { ok: true, contactNumber: null };
  }
  if (!CONTACT_ALLOWED_PATTERN.test(contactNumber)) {
    return {
      ok: false,
      message: "Enter a valid society contact number.",
    };
  }
  const digits = contactNumber.replace(/\D/g, "");
  if (
    digits.length < SOCIETY_CONTACT_MIN_DIGITS ||
    digits.length > SOCIETY_CONTACT_MAX_DIGITS
  ) {
    return {
      ok: false,
      message: "Enter a valid society contact number.",
    };
  }
  return { ok: true, contactNumber };
}

export function parseSocietyEmail(value: unknown):
  | { ok: true; email: string | null }
  | { ok: false; message: string } {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: true, email: null };
  }
  if (email.length > SOCIETY_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  return { ok: true, email };
}

export function parseAdminName(value: unknown):
  | { ok: true; adminName: string }
  | { ok: false; message: string } {
  const adminName = String(value ?? "").trim();
  if (!adminName) {
    return { ok: false, message: "Admin name is required." };
  }
  if (adminName.length > ADMIN_NAME_MAX_LENGTH) {
    return { ok: false, message: "Admin name is too long." };
  }
  return { ok: true, adminName };
}

export function parseAdminMobileNumber(value: unknown):
  | { ok: true; mobileNumber: string | null }
  | { ok: false; message: string } {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { ok: true, mobileNumber: null };
  }
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  }
  if (!INDIAN_MOBILE_PATTERN.test(digits)) {
    return { ok: false, message: "Enter a valid 10-digit Indian mobile number." };
  }
  return { ok: true, mobileNumber: digits };
}

export function parseAdminProfileSave(body: unknown):
  | { ok: true; value: AdminProfileSave }
  | { ok: false; message: string } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const record = body as Record<string, unknown>;
  const nameParsed = parseAdminName(record.adminName ?? record.admin_name);
  if (!nameParsed.ok) {
    return nameParsed;
  }
  const mobileParsed = parseAdminMobileNumber(
    record.mobileNumber ?? record.mobile_number,
  );
  if (!mobileParsed.ok) {
    return mobileParsed;
  }
  const emailParsed = parseSocietyEmail(record.email);
  if (!emailParsed.ok) {
    return emailParsed;
  }
  return {
    ok: true,
    value: {
      adminName: nameParsed.adminName,
      mobileNumber: mobileParsed.mobileNumber,
      email: emailParsed.email,
    },
  };
}

export function toAdminProfileUpdateRow(value: AdminProfileSave): {
  admin_name: string;
  mobile_number: string | null;
  email: string | null;
} {
  return {
    admin_name: value.adminName,
    mobile_number: value.mobileNumber,
    email: value.email,
  };
}

export function parseGeneratedAdminLoginSuffix(loginId: string): number | null {
  const match = GENERATED_ADMIN_LOGIN_PATTERN.exec(loginId.trim().toUpperCase());
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export function nextAdminLoginSequence(existingLoginIds: string[]): number {
  let max = 0;
  for (const loginId of existingLoginIds) {
    const suffix = parseGeneratedAdminLoginSuffix(loginId);
    if (suffix != null && suffix > max) {
      max = suffix;
    }
  }
  return max + 1;
}

export function formatGeneratedAdminLoginId(sequence: number): string {
  const width = Math.max(2, String(sequence).length);
  return `ADMIN${String(sequence).padStart(width, "0")}`;
}

export function allocateGeneratedAdminLoginId(input: {
  societyLoginIds: string[];
  globallyTakenLoginIds: string[];
}): string {
  const taken = new Set(
    [...input.societyLoginIds, ...input.globallyTakenLoginIds].map((id) =>
      id.trim().toUpperCase(),
    ),
  );
  let sequence = nextAdminLoginSequence(input.societyLoginIds);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = formatGeneratedAdminLoginId(sequence);
    if (!taken.has(candidate)) {
      return candidate;
    }
    sequence += 1;
  }
  throw new Error("Unable to allocate admin login id.");
}

export function formatAdminCreatedMessage(loginId: string): string {
  return `Admin created successfully.\nLogin ID: ${loginId}`;
}

export function parseSocietyInformationSave(body: unknown):
  | { ok: true; value: SocietyInformationSave }
  | { ok: false; message: string } {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const record = body as Record<string, unknown>;
  const nameParsed = parseSocietyName(record.name);
  if (!nameParsed.ok) {
    return nameParsed;
  }
  const address = parseOptionalText(record.address, SOCIETY_ADDRESS_MAX_LENGTH, "Address");
  if (!address.ok) {
    return address;
  }
  const city = parseOptionalText(record.city, SOCIETY_CITY_MAX_LENGTH, "City");
  if (!city.ok) {
    return city;
  }
  const state = parseOptionalText(record.state, SOCIETY_STATE_MAX_LENGTH, "State");
  if (!state.ok) {
    return state;
  }
  const pinCode = parseSocietyPinCode(record.pinCode ?? record.pin_code);
  if (!pinCode.ok) {
    return pinCode;
  }
  const contactNumber = parseSocietyContactNumber(
    record.contactNumber ?? record.contact_number,
  );
  if (!contactNumber.ok) {
    return contactNumber;
  }
  const email = parseSocietyEmail(record.email);
  if (!email.ok) {
    return email;
  }
  return {
    ok: true,
    value: {
      name: nameParsed.name,
      address: address.value,
      city: city.value,
      state: state.value,
      pinCode: pinCode.pinCode,
      contactNumber: contactNumber.contactNumber,
      email: email.email,
    },
  };
}

export function toSocietyInformationUpdateRow(value: SocietyInformationSave): {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pin_code: string | null;
  contact_number: string | null;
  email: string | null;
} {
  return {
    name: value.name,
    address: value.address,
    city: value.city,
    state: value.state,
    pin_code: value.pinCode,
    contact_number: value.contactNumber,
    email: value.email,
  };
}

function readOptionalText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function parseLoginId(value: unknown):
  | { ok: true; loginId: string }
  | { ok: false; message: string } {
  const loginId = String(value ?? "").trim();
  if (!loginId) {
    return { ok: false, message: "Login ID is required." };
  }
  if (loginId.length > LOGIN_ID_MAX_LENGTH) {
    return { ok: false, message: "Login ID is too long." };
  }
  return { ok: true, loginId };
}

export function parseNewPassword(value: unknown):
  | { ok: true; password: string }
  | { ok: false; message: string } {
  const password = String(value ?? "");
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  return { ok: true, password };
}

export function parseAdminUserId(value: unknown):
  | { ok: true; adminId: string }
  | { ok: false; message: string } {
  const adminId = String(value ?? "").trim();
  if (!UUID_PATTERN.test(adminId)) {
    return { ok: false, message: "Admin ID is invalid." };
  }
  return { ok: true, adminId };
}

export function parseAccountStatus(value: unknown):
  | { ok: true; status: AdminAccountStatus }
  | { ok: false; message: string } {
  const status = String(value ?? "").trim();
  if (status !== "active" && status !== "disabled") {
    return { ok: false, message: "Status must be active or disabled." };
  }
  return { ok: true, status };
}

export function parseAuthorizedAdminFlag(value: unknown):
  | { ok: true; isAuthorizedAdmin: boolean }
  | { ok: false; message: string } {
  if (typeof value !== "boolean") {
    return {
      ok: false,
      message: "isAuthorizedAdmin must be true or false.",
    };
  }
  return { ok: true, isAuthorizedAdmin: value };
}

export function mapSocietyInformation(row: {
  id: string;
  society_code: string;
  name: string;
  status: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pin_code?: string | null;
  contact_number?: string | null;
  email?: string | null;
}): SocietyInformation | null {
  if (row.status !== "active" && row.status !== "disabled") {
    return null;
  }
  return {
    id: row.id,
    societyCode: row.society_code,
    name: row.name,
    status: row.status,
    address: readOptionalText(row.address),
    city: readOptionalText(row.city),
    state: readOptionalText(row.state),
    pinCode: readOptionalText(row.pin_code),
    contactNumber: readOptionalText(row.contact_number),
    email: readOptionalText(row.email),
  };
}

export function formatAdminRoleLabel(isAuthorizedAdmin: boolean): string {
  return isAuthorizedAdmin ? "Authorized Admin" : "Admin";
}

export function formatAdminAccountStatus(status: string): string {
  return status === "disabled" ? "Disabled" : "Active";
}

export function getAdminDeactivateBlockReason(input: {
  actorId: string;
  targetId: string;
  targetIsAuthorizedAdmin: boolean;
  targetStatus: string;
  newStatus: string;
  activeAuthorizedAdminCount: number;
}): string | null {
  if (input.newStatus !== "disabled") {
    return null;
  }
  if (input.actorId === input.targetId) {
    return "You cannot deactivate your own account.";
  }
  if (
    input.targetIsAuthorizedAdmin &&
    input.targetStatus === "active" &&
    input.activeAuthorizedAdminCount <= 1
  ) {
    return "The last authorized admin cannot be deactivated.";
  }
  return null;
}

export function getAdminPromoteBlockReason(input: {
  targetIsAuthorizedAdmin: boolean;
  targetStatus: string;
}): string | null {
  if (input.targetIsAuthorizedAdmin) {
    return "This admin is already an Authorized Admin.";
  }
  if (input.targetStatus !== "active") {
    return "Only an active Admin can be made an Authorized Admin.";
  }
  return null;
}

export function getAdminDemoteBlockReason(input: {
  targetIsAuthorizedAdmin: boolean;
  targetStatus: string;
  activeAuthorizedAdminCount: number;
}): string | null {
  if (!input.targetIsAuthorizedAdmin) {
    return "This admin is not an Authorized Admin.";
  }
  if (input.targetStatus === "active" && input.activeAuthorizedAdminCount <= 1) {
    return "The last authorized admin cannot be demoted.";
  }
  return null;
}

export function mapAdminAccount(row: {
  id: string;
  login_id: string;
  role: string;
  status: string;
  is_authorized_admin: boolean;
  admin_name?: string | null;
  mobile_number?: string | null;
  email?: string | null;
}): AdminAccount | null {
  if (row.role !== "society_admin") {
    return null;
  }
  if (row.status !== "active" && row.status !== "disabled") {
    return null;
  }
  return {
    id: row.id,
    loginId: row.login_id,
    role: "society_admin",
    status: row.status,
    isAuthorizedAdmin: row.is_authorized_admin === true,
    adminName: readOptionalText(row.admin_name),
    mobileNumber: readOptionalText(row.mobile_number),
    email: readOptionalText(row.email),
  };
}

export function mapAdminProfile(
  row: {
    id: string;
    login_id: string;
    role: string;
    status: string;
    is_authorized_admin: boolean;
    society_id: string;
    admin_name?: string | null;
    mobile_number?: string | null;
    email?: string | null;
  },
  society: { id: string; society_code: string; name: string },
): AdminProfile | null {
  const account = mapAdminAccount(row);
  if (!account) {
    return null;
  }
  return {
    ...account,
    societyId: society.id,
    societyCode: society.society_code,
    societyName: society.name,
  };
}

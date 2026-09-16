import {
  getAdminDeactivateBlockReason,
  getAdminDemoteBlockReason,
  getAdminPromoteBlockReason,
  mapAdminAccount,
  parseAdminManagementAction,
  parseAdminUserId,
  parseAuthorizedAdminFlag,
  parseSocietyContactNumber,
  parseSocietyInformationSave,
  parseSocietyPinCode,
  toSocietyInformationUpdateRow,
  allocateGeneratedAdminLoginId,
} from "../_shared/admin-management.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("rejects client society identifiers", () => {
  const result = parseAdminManagementAction({
    action: "get_society",
    society_id: "11111111-1111-1111-1111-111111111102",
  });
  assert(!result.ok, "client society_id must be rejected");
});

Deno.test("accepts get_profile without extra identifiers", () => {
  const result = parseAdminManagementAction({ action: "get_profile" });
  assert(result.ok, "get_profile should parse");
});

Deno.test("society save allowlist never writes society_code, id, or status", () => {
  const parsed = parseSocietyInformationSave({
    action: "save_society",
    name: "Green Park Society",
    pinCode: "411001",
    society_code: "DEMO2",
    status: "disabled",
    id: "11111111-1111-1111-1111-111111111102",
  });
  assert(parsed.ok, "valid save payload should parse");
  if (!parsed.ok) {
    return;
  }
  const row = toSocietyInformationUpdateRow(parsed.value);
  assert(!("society_code" in row), "society_code must not be writable");
  assert(!("id" in row), "id must not be writable");
  assert(!("status" in row), "status must not be writable");
  assert(row.pin_code === "411001", "PIN should map to pin_code");
});

Deno.test("PIN and contact validation", () => {
  assert(parseSocietyPinCode("411001").ok, "6-digit PIN should pass");
  assert(!parseSocietyPinCode("41100").ok, "short PIN should fail");
  assert(parseSocietyContactNumber("022-24123456").ok, "landline should pass");
  assert(!parseSocietyContactNumber("123").ok, "short contact should fail");
});

Deno.test("save_profile, update_admin, and set_authorized_admin parse without client society", () => {
  const save = parseAdminManagementAction({ action: "save_profile" });
  assert(save.ok, "save_profile should parse");
  const update = parseAdminManagementAction({ action: "update_admin" });
  assert(update.ok, "update_admin should parse");
  const authorize = parseAdminManagementAction({ action: "set_authorized_admin" });
  assert(authorize.ok, "set_authorized_admin should parse");
  const spoof = parseAdminManagementAction({
    action: "set_authorized_admin",
    society_id: "11111111-1111-1111-1111-111111111102",
  });
  assert(!spoof.ok, "client society_id must be rejected on promotion");
});

Deno.test("generated login ids skip existing values and keep ADMIN2", () => {
  const next = allocateGeneratedAdminLoginId({
    societyLoginIds: ["ADMIN2", "ADMIN"],
    globallyTakenLoginIds: ["ADMIN03"],
  });
  assert(next === "ADMIN04", "next id should skip taken ADMIN03");
  assert(next !== "ADMIN2", "existing ADMIN2 must not be rewritten");
});

Deno.test("admin user id must be a uuid", () => {
  assert(!parseAdminUserId("ADMIN").ok, "login id is not an admin id");
  assert(
    parseAdminUserId("22222222-2222-2222-2222-222222222201").ok,
    "uuid admin id must pass",
  );
});

Deno.test("self-deactivate and last authorized admin are blocked", () => {
  const self = getAdminDeactivateBlockReason({
    actorId: "a",
    targetId: "a",
    targetIsAuthorizedAdmin: true,
    targetStatus: "active",
    newStatus: "disabled",
    activeAuthorizedAdminCount: 3,
  });
  assert(Boolean(self && /own account/i.test(self)), "self deactivate must fail");

  const last = getAdminDeactivateBlockReason({
    actorId: "a",
    targetId: "b",
    targetIsAuthorizedAdmin: true,
    targetStatus: "active",
    newStatus: "disabled",
    activeAuthorizedAdminCount: 1,
  });
  assert(Boolean(last && /last authorized/i.test(last)), "last authorized must fail");
});

Deno.test("promotion and demotion follow last-authorized-admin rules", () => {
  const promoteOk = getAdminPromoteBlockReason({
    targetIsAuthorizedAdmin: false,
    targetStatus: "active",
  });
  assert(promoteOk === null, "active normal admin can be promoted");

  const already = getAdminPromoteBlockReason({
    targetIsAuthorizedAdmin: true,
    targetStatus: "active",
  });
  assert(Boolean(already && /already/i.test(already)), "already authorized cannot be promoted");

  const inactive = getAdminPromoteBlockReason({
    targetIsAuthorizedAdmin: false,
    targetStatus: "disabled",
  });
  assert(Boolean(inactive && /active/i.test(inactive)), "inactive admin cannot be promoted");

  const lastDemote = getAdminDemoteBlockReason({
    targetIsAuthorizedAdmin: true,
    targetStatus: "active",
    activeAuthorizedAdminCount: 1,
  });
  assert(
    Boolean(lastDemote && /last authorized/i.test(lastDemote)),
    "last authorized cannot be demoted",
  );

  const demoteOk = getAdminDemoteBlockReason({
    targetIsAuthorizedAdmin: true,
    targetStatus: "active",
    activeAuthorizedAdminCount: 2,
  });
  assert(demoteOk === null, "demote is allowed when another authorized admin remains");

  assert(parseAuthorizedAdminFlag(true).ok, "boolean true is valid");
  assert(!parseAuthorizedAdminFlag("true").ok, "string true is invalid");
});

Deno.test("admin account mapping never includes a password hash", () => {
  const mapped = mapAdminAccount({
    id: "22222222-2222-2222-2222-222222222201",
    login_id: "ADMIN",
    role: "society_admin",
    status: "active",
    is_authorized_admin: true,
  });
  assert(mapped?.loginId === "ADMIN", "login id should map");
  assert(!("passwordHash" in (mapped ?? {})), "password hash must not be mapped");
  assert(
    mapAdminAccount({
      id: "x",
      login_id: "GUARD01",
      role: "guard",
      status: "active",
      is_authorized_admin: false,
    }) === null,
    "guards must not map as admin accounts",
  );
});

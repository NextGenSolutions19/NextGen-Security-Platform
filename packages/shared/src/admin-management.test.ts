import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAdminDeactivateBlockReason,
  getAdminDemoteBlockReason,
  getAdminPromoteBlockReason,
  allocateGeneratedAdminLoginId,
  formatGeneratedAdminLoginId,
  mapAdminAccount,
  nextAdminLoginSequence,
  parseAdminManagementAction,
  parseAdminMobileNumber,
  parseAdminName,
  parseAdminProfileSave,
  parseAdminUserId,
  parseAuthorizedAdminFlag,
  parseSocietyContactNumber,
  parseSocietyEmail,
  parseSocietyInformationSave,
  parseSocietyName,
  parseSocietyPinCode,
  SOCIETY_INFORMATION_PROTECTED_COLUMNS,
  SOCIETY_INFORMATION_WRITABLE_COLUMNS,
  toAdminProfileUpdateRow,
  toSocietyInformationUpdateRow,
} from "./admin-management.ts";

test("admin management parser rejects client society identifiers", () => {
  const rejected = parseAdminManagementAction({
    action: "get_society",
    society_id: "11111111-1111-1111-1111-111111111102",
  });
  assert.equal(rejected.ok, false);
  const ok = parseAdminManagementAction({ action: "get_profile" });
  assert.equal(ok.ok, true);
  assert.equal(parseAdminManagementAction({ action: "save_profile" }).ok, true);
  assert.equal(parseAdminManagementAction({ action: "update_admin" }).ok, true);
  assert.equal(
    parseAdminManagementAction({ action: "set_authorized_admin" }).ok,
    true,
  );
  assert.equal(
    parseAdminManagementAction({
      action: "set_authorized_admin",
      societyId: "11111111-1111-1111-1111-111111111102",
    }).ok,
    false,
  );
});

test("society name cannot be blank and society code is not a save field", () => {
  assert.equal(parseSocietyName("  ").ok, false);
  assert.equal(parseSocietyName("Demo Residential Society").ok, true);
});

test("society information save allowlist ignores protected identifiers", () => {
  const parsed = parseSocietyInformationSave({
    action: "save_society",
    name: " Green Park Society ",
    address: " 12 MG Road ",
    city: "Pune",
    state: "Maharashtra",
    pinCode: "411001",
    contactNumber: "020-25601234",
    email: "Office@Greenpark.example ",
    society_code: "DEMO2",
    id: "11111111-1111-1111-1111-111111111102",
    status: "disabled",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.name, "Green Park Society");
  assert.equal(parsed.value.email, "office@greenpark.example");
  assert.equal(parsed.value.pinCode, "411001");
  const row = toSocietyInformationUpdateRow(parsed.value);
  assert.deepEqual(Object.keys(row).sort(), [...SOCIETY_INFORMATION_WRITABLE_COLUMNS].sort());
  assert.equal("society_code" in row, false);
  assert.equal("id" in row, false);
  assert.equal("status" in row, false);
  for (const column of SOCIETY_INFORMATION_PROTECTED_COLUMNS) {
    assert.equal(column in row, false);
  }
});

test("PIN, email, and contact validation accept Indian society values", () => {
  assert.equal(parseSocietyPinCode("").ok, true);
  assert.equal(parseSocietyPinCode("41100").ok, false);
  assert.equal(parseSocietyPinCode("411001").ok, true);
  assert.equal(parseSocietyEmail("").ok, true);
  assert.equal(parseSocietyEmail("not-an-email").ok, false);
  assert.equal(parseSocietyContactNumber("9876543210").ok, true);
  assert.equal(parseSocietyContactNumber("022-24123456").ok, true);
  assert.equal(parseSocietyContactNumber("123").ok, false);
  assert.equal(parseSocietyInformationSave({ name: "X", pinCode: "ABCDE1" }).ok, false);
});

test("self-deactivate and last authorized admin are blocked", () => {
  assert.match(
    getAdminDeactivateBlockReason({
      actorId: "a",
      targetId: "a",
      targetIsAuthorizedAdmin: true,
      targetStatus: "active",
      newStatus: "disabled",
      activeAuthorizedAdminCount: 3,
    }) ?? "",
    /own account/i,
  );
  assert.match(
    getAdminDeactivateBlockReason({
      actorId: "a",
      targetId: "b",
      targetIsAuthorizedAdmin: true,
      targetStatus: "active",
      newStatus: "disabled",
      activeAuthorizedAdminCount: 1,
    }) ?? "",
    /last authorized/i,
  );
  assert.equal(
    getAdminDeactivateBlockReason({
      actorId: "a",
      targetId: "b",
      targetIsAuthorizedAdmin: false,
      targetStatus: "active",
      newStatus: "disabled",
      activeAuthorizedAdminCount: 1,
    }),
    null,
  );
});

test("authorized admin promotion and demotion follow last-authorized-admin rules", () => {
  assert.equal(
    getAdminPromoteBlockReason({
      targetIsAuthorizedAdmin: false,
      targetStatus: "active",
    }),
    null,
  );
  assert.match(
    getAdminPromoteBlockReason({
      targetIsAuthorizedAdmin: true,
      targetStatus: "active",
    }) ?? "",
    /already an Authorized Admin/i,
  );
  assert.match(
    getAdminPromoteBlockReason({
      targetIsAuthorizedAdmin: false,
      targetStatus: "disabled",
    }) ?? "",
    /active Admin/i,
  );
  assert.match(
    getAdminDemoteBlockReason({
      targetIsAuthorizedAdmin: true,
      targetStatus: "active",
      activeAuthorizedAdminCount: 1,
    }) ?? "",
    /last authorized/i,
  );
  assert.equal(
    getAdminDemoteBlockReason({
      targetIsAuthorizedAdmin: true,
      targetStatus: "active",
      activeAuthorizedAdminCount: 2,
    }),
    null,
  );
  assert.equal(
    getAdminDemoteBlockReason({
      targetIsAuthorizedAdmin: true,
      targetStatus: "disabled",
      activeAuthorizedAdminCount: 1,
    }),
    null,
  );
  assert.equal(parseAuthorizedAdminFlag(true).ok, true);
  assert.equal(parseAuthorizedAdminFlag("true").ok, false);
});

test("admin user id must be a uuid", () => {
  assert.equal(parseAdminUserId("ADMIN").ok, false);
  assert.equal(parseAdminUserId("22222222-2222-2222-2222-222222222201").ok, true);
});

test("admin profile save requires name and ignores protected identity fields", () => {
  assert.equal(parseAdminName("  ").ok, false);
  assert.equal(parseAdminMobileNumber("").ok, true);
  assert.equal(parseAdminMobileNumber("9876543210").ok, true);
  assert.equal(parseAdminMobileNumber("12345").ok, false);
  const parsed = parseAdminProfileSave({
    adminName: " Priya Shah ",
    mobileNumber: "98765 43210",
    email: "Priya@Example.com",
    loginId: "HACKED",
    login_id: "HACKED",
    role: "guard",
    society_id: "11111111-1111-1111-1111-111111111102",
    status: "disabled",
    isAuthorizedAdmin: true,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.adminName, "Priya Shah");
  assert.equal(parsed.value.mobileNumber, "9876543210");
  assert.equal(parsed.value.email, "priya@example.com");
  const row = toAdminProfileUpdateRow(parsed.value);
  assert.equal("login_id" in row, false);
  assert.equal("role" in row, false);
  assert.equal("society_id" in row, false);
  assert.equal("is_authorized_admin" in row, false);
});

test("generated admin login ids are sequential, padded, and do not rewrite existing ids", () => {
  assert.equal(nextAdminLoginSequence(["ADMIN"]), 1);
  assert.equal(formatGeneratedAdminLoginId(1), "ADMIN01");
  assert.equal(nextAdminLoginSequence(["ADMIN2", "ADMIN"]), 3);
  assert.equal(formatGeneratedAdminLoginId(3), "ADMIN03");
  assert.equal(
    allocateGeneratedAdminLoginId({
      societyLoginIds: ["ADMIN2", "T09QA123"],
      globallyTakenLoginIds: ["ADMIN03"],
    }),
    "ADMIN04",
  );
  assert.equal(
    allocateGeneratedAdminLoginId({
      societyLoginIds: ["ADMIN01", "ADMIN02"],
      globallyTakenLoginIds: [],
    }),
    "ADMIN03",
  );
});

test("admin account mapping never includes a password hash", () => {
  const mapped = mapAdminAccount({
    id: "22222222-2222-2222-2222-222222222201",
    login_id: "ADMIN",
    role: "society_admin",
    status: "active",
    is_authorized_admin: true,
  });
  assert.equal(mapped?.loginId, "ADMIN");
  assert.equal("passwordHash" in (mapped ?? {}), false);
  assert.equal(mapAdminAccount({
    id: "x",
    login_id: "GUARD01",
    role: "guard",
    status: "active",
    is_authorized_admin: false,
  }), null);
});

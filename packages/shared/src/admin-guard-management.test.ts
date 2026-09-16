import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocateGeneratedGuardLoginId,
  formatGeneratedGuardLoginId,
  mapGuardAccount,
  nextGuardLoginSequence,
  parseGuardManagementAction,
  parseGuardProfileSave,
  parseGuardUserId,
  toGuardProfileUpdateRow,
} from "./admin-guard-management.ts";

test("guard management parser rejects client society identifiers", () => {
  const rejected = parseGuardManagementAction({
    action: "list_guards",
    society_id: "11111111-1111-1111-1111-111111111102",
  });
  assert.equal(rejected.ok, false);
  assert.equal(parseGuardManagementAction({ action: "list_guards" }).ok, true);
  assert.equal(parseGuardManagementAction({ action: "create_guard" }).ok, true);
  assert.equal(
    parseGuardManagementAction({
      action: "reset_guard_password",
      societyId: "11111111-1111-1111-1111-111111111101",
    }).ok,
    false,
  );
});

test("generated guard login ids are sequential, padded, globally unique, and keep existing ids", () => {
  assert.equal(nextGuardLoginSequence(["GUARD01"]), 2);
  assert.equal(formatGeneratedGuardLoginId(2), "GUARD02");
  assert.equal(
    allocateGeneratedGuardLoginId({
      societyLoginIds: ["GUARD01"],
      globallyTakenLoginIds: ["GUARD02"],
    }),
    "GUARD03",
  );
  assert.equal(
    allocateGeneratedGuardLoginId({
      societyLoginIds: ["GUARD01", "T09QA"],
      globallyTakenLoginIds: [],
    }),
    "GUARD02",
  );
});

test("guard profile save requires name and writes identity columns only", () => {
  assert.equal(parseGuardProfileSave({ guardName: "  " }).ok, false);
  const parsed = parseGuardProfileSave({
    guardName: " Ravi Guard ",
    mobileNumber: "9876543210",
    loginId: "HACKED",
    role: "society_admin",
    society_id: "11111111-1111-1111-1111-111111111102",
    isAuthorizedAdmin: true,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.guardName, "Ravi Guard");
  const row = toGuardProfileUpdateRow(parsed.value);
  assert.equal(row.admin_name, "Ravi Guard");
  assert.equal(row.mobile_number, "9876543210");
  assert.equal("login_id" in row, false);
  assert.equal("role" in row, false);
  assert.equal("society_id" in row, false);
});

test("guard mapping never includes a password hash and requires guard role", () => {
  const mapped = mapGuardAccount({
    id: "22222222-2222-2222-2222-222222222211",
    login_id: "GUARD01",
    role: "guard",
    status: "active",
    admin_name: "Gate Guard",
  });
  assert.equal(mapped?.loginId, "GUARD01");
  assert.equal(mapped?.guardName, "Gate Guard");
  assert.equal("passwordHash" in (mapped ?? {}), false);
  assert.equal(
    mapGuardAccount({
      id: "x",
      login_id: "ADMIN",
      role: "society_admin",
      status: "active",
    }),
    null,
  );
  assert.equal(parseGuardUserId("GUARD01").ok, false);
  assert.equal(
    parseGuardUserId("22222222-2222-2222-2222-222222222211").ok,
    true,
  );
});

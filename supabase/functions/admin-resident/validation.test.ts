import {
  INDIAN_MOBILE_VALIDATION_MESSAGE,
  validateAdminResidentInput,
} from "../_shared/admin-resident.ts";
import { resolveBuildingAwareSocietyFlat } from "../_shared/resident-flat-identity.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("create ignores client society identifiers and generated resident ids", () => {
  const result = validateAdminResidentInput({
    action: "create",
    flatNumber: " A-101 ",
    residentName: " Rahul Shah ",
    mobile: "+91 9876543210",
    wingBuilding: " A ",
    residentType: "Owner",
    society_id: "11111111-1111-1111-1111-111111111102",
    societyId: "should-be-ignored",
    society_code: "DEMO2",
    residentId: "22222222-2222-2222-2222-222222222201",
  });

  assert(result.ok, "expected create to succeed");
  if (!result.ok) {
    return;
  }

  assert(result.value.action === "create", "expected create action");
  if (result.value.action !== "create") {
    return;
  }

  assert(result.value.form.flatNumber === "A-101", "flat should trim");
  assert(result.value.form.residentName === "Rahul Shah", "name should trim");
  assert(result.value.form.mobile === "9876543210", "mobile should normalize");
  assert(result.value.form.wingBuilding === "A", "wing should trim");
  assert(result.value.form.residentType === "Owner", "type should keep");
  assert(!("society_id" in result.value), "society_id must not be copied");
  assert(!("residentId" in result.value), "create must ignore client residentId");
});

Deno.test("rejects oversized Indian mobile numbers without truncating", () => {
  const result = validateAdminResidentInput({
    action: "create",
    flatNumber: "A-101",
    residentName: "Rahul Shah",
    mobile: "98765432101234",
  });

  assert(!result.ok, "expected oversized mobile to fail");
  if (!result.ok) {
    assert(result.message === INDIAN_MOBILE_VALIDATION_MESSAGE, "mobile message");
  }
});

Deno.test("rejects invalid Indian mobile numbers", () => {
  const result = validateAdminResidentInput({
    action: "create",
    flatNumber: "A-101",
    residentName: "Rahul Shah",
    mobile: "12345",
  });

  assert(!result.ok, "expected invalid mobile to fail");
  if (!result.ok) {
    assert(result.message === INDIAN_MOBILE_VALIDATION_MESSAGE, "mobile message");
  }
});

Deno.test("update requires resident identifiers and still ignores society_id", () => {
  const result = validateAdminResidentInput({
    action: "update",
    residentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    residentFlatId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    flatNumber: "B-202",
    residentName: "Meera Shah",
    mobile: "9123456789",
    residentType: "Tenant",
    society_id: "should-be-ignored",
  });

  assert(result.ok, "expected update to succeed");
  if (!result.ok || result.value.action !== "update") {
    return;
  }

  assert(result.value.residentId.startsWith("aaaaaaaa"), "resident id kept");
  assert(!("society_id" in result.value), "society_id must not be copied");
});

Deno.test("building-aware lookup never rewrites A/201 to B/201", () => {
  const existing = [{ id: "flat-a", flatNumber: "201", wingBuilding: "A" }];
  const match = resolveBuildingAwareSocietyFlat(existing, {
    wingBuilding: "A",
    flatNumber: "201",
  });
  assert(match.kind === "match", "A/201 should match A/201");
  if (match.kind === "match") {
    assert(match.flat.id === "flat-a", "matched existing A/201");
  }

  const distinct = resolveBuildingAwareSocietyFlat(existing, {
    wingBuilding: "B",
    flatNumber: "201",
  });
  assert(distinct.kind === "create", "B/201 must create a distinct flat");
  if (match.kind === "match") {
    assert(match.flat.id === "flat-a", "A/201 is never rewritten to B");
  }
});

Deno.test("archive and reactivate only keep residentId", () => {
  const archive = validateAdminResidentInput({
    action: "archive",
    residentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    society_id: "ignored",
  });
  assert(archive.ok && archive.value.action === "archive", "archive");

  const reactivate = validateAdminResidentInput({
    action: "reactivate",
    residentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert(reactivate.ok && reactivate.value.action === "reactivate", "reactivate");
});

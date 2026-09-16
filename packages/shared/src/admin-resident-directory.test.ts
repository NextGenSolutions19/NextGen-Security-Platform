import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARCHIVE_RESIDENT_EXPLANATION,
  ARCHIVE_RESIDENT_TITLE,
  buildCreateResidentRequest,
  buildUpdateResidentRequest,
  filterAdminResidentsByStatus,
  formatResidentStatus,
  formatResidentType,
  formatWingBuilding,
  INDIAN_MOBILE_VALIDATION_MESSAGE,
  validateAdminResidentForm,
  type AdminResidentDirectoryItem,
} from "./admin-resident-directory.ts";
import { filterResidentDirectoryItems } from "./resident-directory.ts";

const residents: AdminResidentDirectoryItem[] = [
  {
    id: "link-1",
    residentId: "res-1",
    flatId: "flat-1",
    societyId: "society-demo",
    flatNumber: "A-101",
    residentName: "Rahul Shah",
    mobile: "9876543210",
    residentType: "Owner",
    wingBuilding: "A",
    status: "active",
  },
  {
    id: "link-2",
    residentId: "res-2",
    flatId: "flat-2",
    societyId: "society-demo",
    flatNumber: "B-204",
    residentName: "Meera Shah",
    mobile: "9123456789",
    residentType: null,
    wingBuilding: null,
    status: "disabled",
  },
];

function filterItems(
  items: AdminResidentDirectoryItem[],
  query: string,
  statusFilter: "all" | "active" | "archived",
) {
  return filterResidentDirectoryItems(
    filterAdminResidentsByStatus(items, statusFilter),
    query,
  );
}

test("empty search keeps active and archived residents", () => {
  const matches = filterItems(residents, "  ", "all");
  assert.equal(matches.length, 2);
  assert.equal(matches[1]?.status, "disabled");
});

test("search matches name, flat number, and mobile for admin items", () => {
  assert.equal(filterItems(residents, "meera", "all")[0]?.id, "link-2");
  assert.equal(filterItems(residents, "a101", "all")[0]?.id, "link-1");
  assert.equal(filterItems(residents, "912345", "all")[0]?.id, "link-2");
});

test("status filter hides archived residents from Active", () => {
  assert.deepEqual(
    filterItems(residents, "", "active").map((item) => item.id),
    ["link-1"],
  );
});

test("status filter shows only archived residents", () => {
  assert.deepEqual(
    filterItems(residents, "", "archived").map((item) => item.id),
    ["link-2"],
  );
});

test("missing resident type and wing are displayed as a dash", () => {
  assert.equal(formatResidentType(null), "—");
  assert.equal(formatResidentType("  "), "—");
  assert.equal(formatResidentType("Owner"), "Owner");
  assert.equal(formatWingBuilding(null), "—");
  assert.equal(formatWingBuilding("A"), "A");
});

test("resident status labels are Active or Archived", () => {
  assert.equal(formatResidentStatus("active"), "Active");
  assert.equal(formatResidentStatus("disabled"), "Archived");
});

test("create payload never includes society_id or resident ids", () => {
  const parsed = validateAdminResidentForm({
    flatNumber: "  C-301  ",
    residentName: "  Anita Desai  ",
    mobile: "+91 9876543210",
    wingBuilding: " C ",
    residentType: "Owner",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }

  const request = buildCreateResidentRequest(parsed.value);
  assert.equal(request.action, "create");
  assert.equal(request.flatNumber, "C-301");
  assert.equal(request.residentName, "Anita Desai");
  assert.equal(request.mobile, "9876543210");
  assert.equal(request.wingBuilding, "C");
  assert.equal(request.residentType, "Owner");
  assert.equal("society_id" in request, false);
  assert.equal("societyId" in request, false);
  assert.equal("residentId" in request, false);
});

test("update payload uses resident identifiers but never society_id", () => {
  const parsed = validateAdminResidentForm({
    flatNumber: "A-101",
    residentName: "Rahul Shah",
    mobile: "9876543210",
    residentType: "Tenant",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }

  const request = buildUpdateResidentRequest("res-1", "link-1", parsed.value);
  assert.equal(request.residentId, "res-1");
  assert.equal(request.residentFlatId, "link-1");
  assert.equal("society_id" in request, false);
  assert.equal("societyId" in request, false);
});

test("rejects missing required fields and invalid Indian mobile numbers", () => {
  const missing = validateAdminResidentForm({
    flatNumber: " ",
    residentName: " ",
    mobile: " ",
  });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }
  assert.equal(missing.errors.flatNumber, "Enter a flat number.");
  assert.equal(missing.errors.residentName, "Enter a resident name.");
  assert.equal(missing.errors.mobile, "Enter a mobile number.");

  const invalidMobile = validateAdminResidentForm({
    flatNumber: "A-101",
    residentName: "Rahul",
    mobile: "12345",
  });
  assert.equal(invalidMobile.ok, false);
  if (invalidMobile.ok) {
    return;
  }
  assert.equal(invalidMobile.errors.mobile, INDIAN_MOBILE_VALIDATION_MESSAGE);
});

test("rejects oversized or letter-containing resident mobile numbers without truncating", () => {
  const oversized = validateAdminResidentForm({
    flatNumber: "A-101",
    residentName: "Rahul",
    mobile: "98765432101234",
  });
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.errors.mobile, INDIAN_MOBILE_VALIDATION_MESSAGE);
  }

  const letters = validateAdminResidentForm({
    flatNumber: "A-101",
    residentName: "Rahul",
    mobile: "98765ABC10",
  });
  assert.equal(letters.ok, false);
  if (!letters.ok) {
    assert.equal(letters.errors.mobile, INDIAN_MOBILE_VALIDATION_MESSAGE);
  }
});

test("archive confirmation copy is preserved", () => {
  assert.equal(ARCHIVE_RESIDENT_TITLE, "Archive this resident?");
  assert.match(ARCHIVE_RESIDENT_EXPLANATION, /historical records will be preserved/i);
});

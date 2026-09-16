import assert from "node:assert/strict";
import { test } from "node:test";
import { filterVisitorListItems, type VisitorListItem } from "./visitor.ts";

function item(
  overrides: Partial<VisitorListItem> & Pick<VisitorListItem, "id">,
): VisitorListItem {
  return {
    societyId: "society-demo2",
    flatId: "flat-1",
    destinationText: null,
    residentId: "res-1",
    visitorName: "Ravi Patel",
    visitorMobile: "9876543210",
    purpose: "Delivery",
    purposeCode: "delivery",
    purposeLabel: "Delivery",
    customPurposeText: null,
    registrationMode: "register_without_otp",
    verificationMethod: "OTP_NOT_PERFORMED",
    vehicleNumber: null,
    vehicleVisuallyChecked: false,
    visitorPhotoUploadId: null,
    idType: null,
    idNumber: null,
    notes: null,
    entryType: "single",
    visitorCount: 1,
    status: "checked_out",
    checkInAt: "2026-08-26T06:30:00.000Z",
    checkOutAt: "2026-08-26T10:00:00.000Z",
    createdByAppUserId: "guard-1",
    createdAt: "2026-08-26T08:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    flatNumber: "201",
    residentName: "Building A Family Member",
    wingBuilding: "A",
    ...overrides,
  };
}

const history: VisitorListItem[] = [
  item({
    id: "wing-a",
    visitorName: "Anita Shah",
    visitorMobile: "9111111111",
    purposeLabel: "Guest",
    purpose: "Guest",
    vehicleNumber: "MH01AA1111",
    flatNumber: "201",
    wingBuilding: "A",
    residentName: "Building A Family Member",
  }),
  item({
    id: "wing-b",
    visitorName: "Suresh Nair",
    visitorMobile: "9222222222",
    purposeLabel: "Delivery",
    purpose: "Delivery",
    vehicleNumber: "MH02BB2222",
    flatNumber: "201",
    wingBuilding: "B",
    residentName: "Building B Test Resident",
  }),
  item({
    id: "group-out",
    visitorName: "Party Visitor",
    visitorMobile: "9333333333",
    flatNumber: "305",
    wingBuilding: "C",
    residentName: "Meera Shah",
    entryType: "group",
    visitorCount: 4,
  }),
];

function idsFor(query: string): string[] {
  return filterVisitorListItems(history, query).map((row) => row.id);
}

test("empty Guard Visitor History search returns all records", () => {
  assert.deepEqual(idsFor("   "), ["wing-a", "wing-b", "group-out"]);
});

test("Guard Visitor History matches equivalent B · 201 destination forms", () => {
  for (const query of ["B 201", "B-201", "B · 201", "B/201"]) {
    assert.deepEqual(idsFor(query), ["wing-b"], query);
  }
});

test("Guard Visitor History matches equivalent A · 201 destination forms", () => {
  for (const query of ["A 201", "A-201", "A · 201", "A/201"]) {
    assert.deepEqual(idsFor(query), ["wing-a"], query);
  }
});

test("Guard Visitor History flat number 201 matches both A and B destinations", () => {
  assert.deepEqual(idsFor("201"), ["wing-a", "wing-b"]);
});

test("Guard Visitor History matches building and resident name phrases", () => {
  assert.deepEqual(idsFor("BUILDING"), ["wing-a", "wing-b"]);
  assert.deepEqual(idsFor("BUILDING B"), ["wing-b"]);
  assert.deepEqual(idsFor("Building B Test Resident"), ["wing-b"]);
  assert.deepEqual(idsFor("BUILDING A"), ["wing-a"]);
  assert.deepEqual(idsFor("Building A Family Member"), ["wing-a"]);
});

test("standalone B matches wing B and not Building A text", () => {
  assert.deepEqual(idsFor("B"), ["wing-b"]);
});

test("standalone A matches wing A and not Building B text", () => {
  assert.deepEqual(idsFor("A"), ["wing-a"]);
});

test("Guard Visitor History still matches visitor name, mobile, purpose, and vehicle", () => {
  assert.deepEqual(idsFor("anita"), ["wing-a"]);
  assert.deepEqual(idsFor("922222"), ["wing-b"]);
  assert.deepEqual(idsFor("guest"), ["wing-a"]);
  assert.deepEqual(idsFor("MH02BB"), ["wing-b"]);
});

test("unmatched Guard Visitor History search returns no records", () => {
  assert.deepEqual(idsFor("Z-999"), []);
});

test("Guard Visitor History keeps group visitor records searchable", () => {
  assert.deepEqual(idsFor("group visitor"), ["group-out"]);
  assert.deepEqual(idsFor("933333"), ["group-out"]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterResidentDirectoryItems,
  formatResidentMobile,
  type ResidentDirectoryItem,
} from "./resident-directory.ts";

const residents: ResidentDirectoryItem[] = [
  {
    id: "link-1",
    residentId: "res-1",
    flatId: "flat-1",
    flatNumber: "A-101",
    residentName: "Rahul Shah",
    mobile: "9876543210",
  },
  {
    id: "link-2",
    residentId: "res-2",
    flatId: "flat-1",
    flatNumber: "A-101",
    residentName: "Meera Shah",
    mobile: "9123456789",
  },
  {
    id: "link-4",
    residentId: "res-4",
    flatId: "flat-4",
    flatNumber: "201",
    residentName: "Suresh Nair",
    mobile: "9000000001",
    wingBuilding: "B",
  },
  {
    id: "link-5",
    residentId: "res-5",
    flatId: "flat-5",
    flatNumber: "201",
    residentName: "Kavita Rao",
    mobile: "9000000002",
    wingBuilding: "Building A",
  },
];

test("empty search returns all residents", () => {
  assert.equal(filterResidentDirectoryItems(residents, "   ").length, 4);
});

test("search matches flat number including compact form", () => {
  const matches = filterResidentDirectoryItems(residents, "a101");
  assert.deepEqual(
    matches.map((item) => item.id),
    ["link-1", "link-2"],
  );
});

test("search matches resident name", () => {
  const matches = filterResidentDirectoryItems(residents, "meera");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.residentName, "Meera Shah");
});

test("search matches mobile number", () => {
  const matches = filterResidentDirectoryItems(residents, "912345");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.residentName, "Meera Shah");
});

test("unmatched search returns an empty list", () => {
  assert.equal(filterResidentDirectoryItems(residents, "Z-999").length, 0);
});

test("search matches equivalent flat representations for B · 201", () => {
  for (const query of ["B 201", "B-201", "B · 201", "B/201"]) {
    const matches = filterResidentDirectoryItems(residents, query);
    assert.deepEqual(
      matches.map((item) => item.id),
      ["link-4"],
      query,
    );
  }
});

test("searching only B does not match Building A records", () => {
  const matches = filterResidentDirectoryItems(residents, "B");
  assert.equal(
    matches.some((item) => item.id === "link-5"),
    false,
  );
  assert.equal(
    matches.some((item) => item.id === "link-4"),
    true,
  );
});

test("BUILDING A and 201 searches still succeed", () => {
  const building = filterResidentDirectoryItems(residents, "BUILDING A");
  assert.deepEqual(
    building.map((item) => item.id),
    ["link-5"],
  );
  const byFlat = filterResidentDirectoryItems(residents, "201");
  assert.deepEqual(
    byFlat.map((item) => item.id),
    ["link-4", "link-5"],
  );
});

test("missing mobile is displayed as a dash", () => {
  assert.equal(formatResidentMobile(null), "—");
  assert.equal(formatResidentMobile("  "), "—");
  assert.equal(formatResidentMobile("9876543210"), "9876543210");
});

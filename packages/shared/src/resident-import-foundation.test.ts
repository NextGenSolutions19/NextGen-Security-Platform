import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RESIDENT_IMPORT_ROW_STATUSES,
  SOCIETY_RESIDENT_FIELD_TYPES,
  buildFlatIdentityKey,
  isCanonicalNoBuilding,
  normalizeResidentCompareKey,
  sameFlatIdentity,
} from "./resident-import-foundation.ts";
import { normalizeIndianMobileNumber } from "./admin-resident-directory.ts";

test("building/wing comparison trims, collapses spaces, and ignores case", () => {
  assert.equal(normalizeResidentCompareKey("A"), "a");
  assert.equal(normalizeResidentCompareKey("a"), "a");
  assert.equal(normalizeResidentCompareKey(" Tower A "), "tower a");
  assert.equal(normalizeResidentCompareKey("tower a"), "tower a");
  assert.equal(normalizeResidentCompareKey("Tower  A"), "tower a");
  assert.equal(normalizeResidentCompareKey("Emerald"), "emerald");
  assert.equal(normalizeResidentCompareKey("Phase 2"), "phase 2");
});

test("blank, null, and whitespace-only building share one canonical no-building key", () => {
  assert.equal(normalizeResidentCompareKey(null), "");
  assert.equal(normalizeResidentCompareKey(undefined), "");
  assert.equal(normalizeResidentCompareKey(""), "");
  assert.equal(normalizeResidentCompareKey("   "), "");
  assert.equal(isCanonicalNoBuilding(null), true);
  assert.equal(isCanonicalNoBuilding("A"), false);
});

test("flat number comparison preserves hyphens and does not strip punctuation", () => {
  assert.equal(normalizeResidentCompareKey("A-101"), "a-101");
  assert.equal(normalizeResidentCompareKey(" a-101 "), "a-101");
  assert.notEqual(normalizeResidentCompareKey("A-101"), normalizeResidentCompareKey("A101"));
});

test("display values are not rewritten by the comparison helper", () => {
  const display = "Tower A";
  assert.equal(normalizeResidentCompareKey(display), "tower a");
  assert.equal(display, "Tower A");
});

test("Building A + 101 and Building B + 101 are different flats in the same society", () => {
  const societyId = "society-demo";
  const a101 = buildFlatIdentityKey(societyId, "A", "101");
  const b101 = buildFlatIdentityKey(societyId, "B", "101");
  const a101Lower = buildFlatIdentityKey(societyId, "a", "101");

  assert.notEqual(a101, b101);
  assert.equal(a101, a101Lower);
  assert.equal(
    sameFlatIdentity(
      { societyId, wingBuilding: " Tower A ", flatNumber: "101" },
      { societyId, wingBuilding: "tower a", flatNumber: " 101 " },
    ),
    true,
  );
});

test("blank building + A-101 is not the same flat as building A + 101", () => {
  const societyId = "society-demo";
  assert.equal(
    sameFlatIdentity(
      { societyId, wingBuilding: null, flatNumber: "A-101" },
      { societyId, wingBuilding: "A", flatNumber: "101" },
    ),
    false,
  );
});

test("no-building flats with the same number match each other", () => {
  const societyId = "society-demo";
  assert.equal(
    sameFlatIdentity(
      { societyId, wingBuilding: null, flatNumber: "101" },
      { societyId, wingBuilding: "  ", flatNumber: "101" },
    ),
    true,
  );
});

test("different societies never share a flat identity key", () => {
  assert.notEqual(
    buildFlatIdentityKey("society-a", "A", "101"),
    buildFlatIdentityKey("society-b", "A", "101"),
  );
});

test("shared family mobiles normalize to the same digits without implying one person", () => {
  assert.equal(normalizeIndianMobileNumber("9876543210"), "9876543210");
  assert.equal(normalizeIndianMobileNumber("+91 98765 43210"), "9876543210");
  assert.equal(
    normalizeIndianMobileNumber("9876543210") ===
      normalizeIndianMobileNumber("9876543210"),
    true,
  );
});

test("import row statuses exclude silent update/merge/overwrite", () => {
  assert.deepEqual(RESIDENT_IMPORT_ROW_STATUSES, [
    "INVALID",
    "VALID_NEW",
    "EXACT_DUPLICATE",
    "INTRA_FILE_DUPLICATE",
    "POSSIBLE_CONFLICT",
    "SKIPPED",
    "IMPORTED",
    "FAILED",
  ]);
  assert.equal(RESIDENT_IMPORT_ROW_STATUSES.includes("UPDATED" as never), false);
  assert.equal(RESIDENT_IMPORT_ROW_STATUSES.includes("MERGED" as never), false);
  assert.equal(RESIDENT_IMPORT_ROW_STATUSES.includes("OVERWRITTEN" as never), false);
});

test("custom field types match the planned catalog", () => {
  assert.deepEqual(SOCIETY_RESIDENT_FIELD_TYPES, [
    "text",
    "number",
    "phone",
    "date",
    "dropdown",
    "yes_no",
    "multi_select",
  ]);
});

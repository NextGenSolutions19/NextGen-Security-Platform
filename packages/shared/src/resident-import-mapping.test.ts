import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  addCustomFieldOption,
  applyResidentImportColumnTarget,
  createDefaultCustomFieldConfig,
  createResidentImportMappingSnapshot,
  duplicateResidentImportHeaders,
  excelColumnLetter,
  formatResidentImportColumnLabel,
  mergeCustomFieldOptions,
  parseResidentImportMappingSnapshot,
  removeCustomFieldOption,
  resetResidentImportMappingSnapshot,
  serializeResidentImportMappingSnapshot,
  suggestCustomFieldOptionsFromValues,
  suggestResidentImportMappingTarget,
  summarizeResidentImportMapping,
  updateResidentImportCustomField,
  type ResidentImportMappingSnapshot,
  type ResidentImportMappingSourceWorkbook,
} from "./resident-import-mapping.ts";
import { parseResidentImportWorkbook } from "./resident-import-parse.ts";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/testing/fixtures/m03-resident-import/M03_Resident_Import_Testing.xlsx",
);

function workbook(headers: string[], rows: string[][]): ResidentImportMappingSourceWorkbook {
  return {
    fileName: "sample.xlsx",
    selectedSheet: "Sheet1",
    columns: headers.map((header, index) => ({ index, header })),
    rows: rows.map((displayValues, index) => ({
      rowNumber: index + 2,
      cells: displayValues.map(() => null),
      displayValues,
    })),
  };
}

test("excel column letters stay stable for duplicate headers", () => {
  assert.equal(excelColumnLetter(0), "A");
  assert.equal(excelColumnLetter(6), "G");
  assert.equal(excelColumnLetter(7), "H");
  assert.equal(excelColumnLetter(25), "Z");
  assert.equal(excelColumnLetter(26), "AA");
  assert.equal(
    formatResidentImportColumnLabel("Mobile", "G", { duplicate: true }),
    "Mobile (Column G)",
  );
  assert.equal(
    formatResidentImportColumnLabel("Mobile", "H", { duplicate: true }),
    "Mobile (Column H)",
  );
});

test("safe header aliases suggest system targets", () => {
  assert.equal(suggestResidentImportMappingTarget("Flat No").target, "FLAT_NUMBER");
  assert.equal(suggestResidentImportMappingTarget("Flat Number").target, "FLAT_NUMBER");
  assert.equal(suggestResidentImportMappingTarget("Unit").target, "FLAT_NUMBER");
  assert.equal(suggestResidentImportMappingTarget("Apartment No").target, "FLAT_NUMBER");
  assert.equal(suggestResidentImportMappingTarget("Resident Name").target, "RESIDENT_NAME");
  assert.equal(suggestResidentImportMappingTarget("Member Name").target, "RESIDENT_NAME");
  assert.equal(suggestResidentImportMappingTarget("Name").target, "RESIDENT_NAME");
  assert.equal(suggestResidentImportMappingTarget("Mobile").target, "PRIMARY_MOBILE");
  assert.equal(suggestResidentImportMappingTarget("Phone Number").target, "PRIMARY_MOBILE");
  assert.equal(suggestResidentImportMappingTarget("Contact").target, "PRIMARY_MOBILE");
  assert.equal(suggestResidentImportMappingTarget("Mobile 2").target, "ADDITIONAL_MOBILE");
  assert.equal(suggestResidentImportMappingTarget("Alternate Mobile").target, "ADDITIONAL_MOBILE");
  assert.equal(suggestResidentImportMappingTarget("Building").target, "BUILDING");
  assert.equal(suggestResidentImportMappingTarget("Tower Name").target, "BUILDING");
  assert.equal(suggestResidentImportMappingTarget("Wing").target, "WING");
  assert.equal(suggestResidentImportMappingTarget("Resident Type").target, "RESIDENT_TYPE");
  assert.equal(suggestResidentImportMappingTarget("Occupancy Type").target, "RESIDENT_TYPE");
});

test("weak or unknown headers are ignored instead of guessed as system fields", () => {
  assert.equal(suggestResidentImportMappingTarget("").target, "IGNORE");
  assert.equal(suggestResidentImportMappingTarget("   ").target, "IGNORE");
  assert.equal(suggestResidentImportMappingTarget("???").target, "IGNORE");
  assert.equal(suggestResidentImportMappingTarget("QA Case").target, "IGNORE");
  assert.equal(suggestResidentImportMappingTarget("Contact Person").target, "CUSTOM_FIELD");
  assert.equal(suggestResidentImportMappingTarget("Emergency Contact").target, "CUSTOM_FIELD");
  assert.notEqual(suggestResidentImportMappingTarget("Blood Group").target, "PRIMARY_MOBILE");
  assert.equal(suggestResidentImportMappingTarget("Blood Group").target, "CUSTOM_FIELD");
});

test("testing workbook suggestions match the QA mapping table", () => {
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const outcome = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const snapshot = createResidentImportMappingSnapshot(outcome.result);
  const byHeader = new Map(
    snapshot.columns.map((column) => [column.header, column.target]),
  );

  assert.equal(byHeader.get("QA Case"), "IGNORE");
  assert.equal(byHeader.get("Building"), "BUILDING");
  assert.equal(byHeader.get("Wing"), "WING");
  assert.equal(byHeader.get("Flat No"), "FLAT_NUMBER");
  assert.equal(byHeader.get("Resident Name"), "RESIDENT_NAME");
  assert.equal(byHeader.get("Resident Type"), "RESIDENT_TYPE");
  assert.equal(byHeader.get("Mobile 1"), "PRIMARY_MOBILE");
  assert.equal(byHeader.get("Mobile 2"), "ADDITIONAL_MOBILE");
  assert.equal(byHeader.get("Parking Slot"), "CUSTOM_FIELD");
  assert.equal(byHeader.get("Intercom"), "CUSTOM_FIELD");
  assert.equal(byHeader.get("Move-in Date"), "CUSTOM_FIELD");
  assert.equal(byHeader.get("Vehicle Sticker"), "CUSTOM_FIELD");
  assert.equal(byHeader.get("Emergency Contact"), "CUSTOM_FIELD");
  assert.equal(byHeader.get("Notes"), "CUSTOM_FIELD");

  const summary = summarizeResidentImportMapping(snapshot);
  assert.equal(summary.columnCount, 14);
  assert.equal(summary.requiredComplete, true);
  assert.equal(summary.required.every((item) => item.mapped), true);
});

test("unique mapping targets cannot be assigned to a second column", () => {
  const snapshot = createResidentImportMappingSnapshot(
    workbook(["Unit", "Flat No", "Name"], [["101", "102", "Asha"]]),
  );
  assert.equal(snapshot.columns[0]?.target, "FLAT_NUMBER");
  assert.equal(snapshot.columns[1]?.target, "IGNORE");
  assert.equal(snapshot.columns[1]?.suggestedTarget, "FLAT_NUMBER");

  const duplicate = applyResidentImportColumnTarget(snapshot, 1, "FLAT_NUMBER");
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    return;
  }
  assert.equal(duplicate.code, "duplicate_unique_target");
  assert.equal(duplicate.snapshot.columns[1]?.target, snapshot.columns[1]?.target);
  assert.match(duplicate.message, /Flat Number/);
});

test("Additional Mobile and Custom Field may repeat", () => {
  let snapshot = createResidentImportMappingSnapshot(
    workbook(
      ["Mobile 1", "Mobile 2", "Mobile 3", "Parking", "Blood Group"],
      [["9876500001", "9876500002", "9876500003", "Covered", "B+"]],
    ),
  );

  const mobile3 = applyResidentImportColumnTarget(snapshot, 2, "ADDITIONAL_MOBILE");
  assert.equal(mobile3.ok, true);
  if (mobile3.ok) {
    snapshot = mobile3.snapshot;
  }

  assert.equal(snapshot.columns[1]?.target, "ADDITIONAL_MOBILE");
  assert.equal(snapshot.columns[2]?.target, "ADDITIONAL_MOBILE");
  assert.equal(snapshot.columns[3]?.target, "CUSTOM_FIELD");
  assert.equal(snapshot.columns[4]?.target, "CUSTOM_FIELD");
});

test("duplicate Excel headers remain independently identifiable", () => {
  const snapshot = createResidentImportMappingSnapshot(
    workbook(["Mobile", "Mobile"], [["9876500001", "9876500002"]]),
  );

  assert.equal(snapshot.columns[0]?.columnIndex, 0);
  assert.equal(snapshot.columns[1]?.columnIndex, 1);
  assert.equal(snapshot.columns[0]?.excelAddress, "A");
  assert.equal(snapshot.columns[1]?.excelAddress, "B");
  assert.equal(snapshot.columns[0]?.header, "Mobile");
  assert.equal(snapshot.columns[1]?.header, "Mobile");
  assert.equal(snapshot.columns[0]?.target, "PRIMARY_MOBILE");

  const second = applyResidentImportColumnTarget(snapshot, 1, "ADDITIONAL_MOBILE");
  assert.equal(second.ok, true);
  if (!second.ok) {
    return;
  }
  assert.equal(second.snapshot.columns[0]?.target, "PRIMARY_MOBILE");
  assert.equal(second.snapshot.columns[1]?.target, "ADDITIONAL_MOBILE");
  assert.deepEqual([...duplicateResidentImportHeaders(snapshot)], ["Mobile"]);
});

test("custom field defaults to the source header and Text / not required", () => {
  const created = createDefaultCustomFieldConfig("Parking Slot", "I");
  assert.equal(created.name, "Parking Slot");
  assert.equal(created.fieldType, "text");
  assert.equal(created.required, false);
  assert.deepEqual(created.options, []);

  const snapshot = createResidentImportMappingSnapshot(
    workbook(["Parking Slot"], [["P-101"]]),
  );
  const configured = updateResidentImportCustomField(snapshot, 0, {
    fieldType: "dropdown",
    required: true,
    options: ["Covered", "Open"],
  });
  assert.equal(configured.columns[0]?.customField?.fieldType, "dropdown");
  assert.equal(configured.columns[0]?.customField?.required, true);
  assert.deepEqual(configured.columns[0]?.customField?.options, ["Covered", "Open"]);
});

test("dropdown option suggestion uses distinct non-empty Excel values", () => {
  const options = suggestCustomFieldOptionsFromValues([
    "Covered",
    "Open",
    "",
    "Visitor",
    "Covered",
    "   ",
    "Open",
  ]);
  assert.deepEqual(options, ["Covered", "Open", "Visitor"]);
});

test("manual custom field options reject empty and whitespace-only input", () => {
  const current = ["Covered", "Open"];
  assert.deepEqual(addCustomFieldOption(current, "").ok, false);
  if (!addCustomFieldOption(current, "").ok) {
    assert.equal(addCustomFieldOption(current, "").reason, "empty");
  }
  const whitespace = addCustomFieldOption(current, "   ");
  assert.equal(whitespace.ok, false);
  if (!whitespace.ok) {
    assert.equal(whitespace.reason, "empty");
  }
  assert.deepEqual(current, ["Covered", "Open"]);
});

test("manual custom field option is trimmed, added, and removable", () => {
  const suggested = suggestCustomFieldOptionsFromValues([
    "Covered",
    "Open",
    "Visitor",
  ]);
  const added = addCustomFieldOption(suggested, "  Visitor Parking  ");
  assert.equal(added.ok, true);
  if (!added.ok) {
    return;
  }
  assert.equal(added.added, "Visitor Parking");
  assert.deepEqual(added.options, [
    "Covered",
    "Open",
    "Visitor",
    "Visitor Parking",
  ]);

  const duplicate = addCustomFieldOption(added.options, "Visitor Parking");
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.reason, "duplicate");
  }

  const duplicateUntrimmed = addCustomFieldOption(
    added.options,
    "  Covered  ",
  );
  assert.equal(duplicateUntrimmed.ok, false);

  const removed = removeCustomFieldOption(added.options, "Visitor Parking");
  assert.deepEqual(removed, ["Covered", "Open", "Visitor"]);
});

test("suggesting Excel options still merges with manual options", () => {
  const suggested = suggestCustomFieldOptionsFromValues(["Covered", "Open"]);
  const withManual = addCustomFieldOption(suggested, "Visitor Parking");
  assert.equal(withManual.ok, true);
  if (!withManual.ok) {
    return;
  }
  const merged = mergeCustomFieldOptions(withManual.options, ["Visitor", "Open"]);
  assert.deepEqual(merged, ["Covered", "Open", "Visitor Parking", "Visitor"]);
});

test("required mapping completeness depends on Flat Number and Resident Name only", () => {
  const snapshot = createResidentImportMappingSnapshot(
    workbook(["Building", "Notes"], [["A", "hello"]]),
  );
  const summary = summarizeResidentImportMapping(snapshot);
  assert.equal(summary.requiredComplete, false);
  assert.equal(
    summary.required.find((item) => item.target === "FLAT_NUMBER")?.mapped,
    false,
  );
  assert.equal(
    summary.required.find((item) => item.target === "RESIDENT_NAME")?.mapped,
    false,
  );

  let next = snapshot;
  const flat = applyResidentImportColumnTarget(next, 0, "FLAT_NUMBER");
  assert.equal(flat.ok, true);
  if (flat.ok) {
    next = flat.snapshot;
  }
  const name = applyResidentImportColumnTarget(next, 1, "RESIDENT_NAME");
  assert.equal(name.ok, true);
  if (name.ok) {
    next = name.snapshot;
  }
  assert.equal(summarizeResidentImportMapping(next).requiredComplete, true);
});

test("mapping snapshot is JSON serializable", () => {
  const snapshot = createResidentImportMappingSnapshot(
    workbook(["Unit", "Member", "Parking"], [["101", "Asha", "P-1"]]),
  );
  const raw = serializeResidentImportMappingSnapshot(snapshot);
  const roundTrip = parseResidentImportMappingSnapshot(raw);
  assert.deepEqual(roundTrip, snapshot);
  assert.equal(raw.includes("FLAT_NUMBER"), true);
});

test("a new workbook snapshot does not keep the previous mapping state", () => {
  const first = createResidentImportMappingSnapshot(
    workbook(["Unit", "Name"], [["101", "Asha"]]),
  );
  const remapped = applyResidentImportColumnTarget(first, 0, "IGNORE");
  assert.equal(remapped.ok, true);
  const previous: ResidentImportMappingSnapshot = remapped.ok
    ? remapped.snapshot
    : first;

  const secondWorkbook = workbook(["Blood Group", "Contact", "Parking"], [
    ["B+", "9876500001", "Open"],
  ]);
  const second = createResidentImportMappingSnapshot(secondWorkbook);
  const reset = resetResidentImportMappingSnapshot(secondWorkbook);

  assert.notEqual(second.columns[0]?.target, previous.columns[0]?.target);
  assert.equal(second.columns[0]?.target, "CUSTOM_FIELD");
  assert.equal(second.columns[1]?.target, "PRIMARY_MOBILE");
  assert.equal(second.sheetName, "Sheet1");
  assert.deepEqual(reset, second);
  assert.equal(previous.columns.some((column) => column.target === "IGNORE"), true);
  assert.equal(second.columns.some((column) => column.target === "IGNORE"), false);
});

test("arbitrary society headers are mapped by name, not column position", () => {
  const snapshot = createResidentImportMappingSnapshot(
    workbook(
      ["Member", "Unit", "Blood Group", "Contact", "Parking"],
      [["Asha", "101", "B+", "9876500001", "Covered"]],
    ),
  );
  assert.equal(snapshot.columns[0]?.target, "RESIDENT_NAME");
  assert.equal(snapshot.columns[1]?.target, "FLAT_NUMBER");
  assert.equal(snapshot.columns[2]?.target, "CUSTOM_FIELD");
  assert.equal(snapshot.columns[3]?.target, "PRIMARY_MOBILE");
  assert.equal(snapshot.columns[4]?.target, "CUSTOM_FIELD");
  assert.equal(snapshot.columns[2]?.customField?.name, "Blood Group");
});

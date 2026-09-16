import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import {
  DUPLICATE_HEADER_WARNING,
  MAX_RESIDENT_IMPORT_FILE_BYTES,
  RESIDENT_IMPORT_ALLOWED_EXTENSIONS,
  RESIDENT_IMPORT_LIMITS,
  formatResidentImportMaxFileSize,
  getResidentImportAdminMessage,
  parseResidentImportWorkbook,
  type WorkbookParseResult,
} from "./resident-import-parse.ts";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/testing/fixtures/m03-resident-import/M03_Resident_Import_Testing.xlsx",
);

function workbookBytes(sheetName: string, rows: unknown[][]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

test("V1 import file limit is 100 MB from one constant", () => {
  assert.equal(MAX_RESIDENT_IMPORT_FILE_BYTES, 100 * 1024 * 1024);
  assert.equal(RESIDENT_IMPORT_LIMITS.maxFileBytes, MAX_RESIDENT_IMPORT_FILE_BYTES);
  assert.equal(formatResidentImportMaxFileSize(), "100 MB");
  assert.deepEqual(RESIDENT_IMPORT_ALLOWED_EXTENSIONS, [".xlsx"]);
  assert.equal(RESIDENT_IMPORT_LIMITS.previewRowCount, 50);
  assert.ok(RESIDENT_IMPORT_LIMITS.maxParserRowCount >= 100_000);
});

test("parse result contract does not include mapping or validation decisions", () => {
  const sample: WorkbookParseResult = {
    fileName: "M03_Resident_Import_Testing.xlsx",
    fileBytes: 1,
    sheetNames: ["Resident Import Test Data"],
    hiddenSheetNames: ["_parser_ignore"],
    visibleSheetNames: ["Resident Import Test Data"],
    selectedSheet: "Resident Import Test Data",
    columns: [{ index: 0, header: "Flat No" }],
    headers: ["Flat No"],
    duplicateHeaders: [],
    rows: [],
    totalDataRowCount: 0,
    warnings: [],
  };

  assert.equal("columnMapping" in sample, false);
  assert.equal("rowStatus" in sample, false);
});

test("testing workbook parses with hidden sheet ignored by default", () => {
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const outcome = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const { result } = outcome;
  assert.equal(result.selectedSheet, "Resident Import Test Data");
  assert.deepEqual(result.visibleSheetNames, ["Resident Import Test Data"]);
  assert.deepEqual(result.hiddenSheetNames, ["_parser_ignore"]);
  assert.ok(result.sheetNames.includes("_parser_ignore"));
  assert.equal(result.totalDataRowCount, 28);
  assert.equal(result.rows.length, 28);
  assert.equal(result.rows[0]?.rowNumber, 2);
  assert.equal(result.rows[26]?.rowNumber, 28);
  assert.equal(result.rows[26]?.displayValues[0], "TEST-DB1");
  assert.equal(result.rows[27]?.rowNumber, 29);
  assert.equal(result.rows[27]?.displayValues[0], "TEST-DB2");
  assert.deepEqual(result.headers, [
    "QA Case",
    "Building",
    "Wing",
    "Flat No",
    "Resident Name",
    "Resident Type",
    "Mobile 1",
    "Mobile 2",
    "Parking Slot",
    "Intercom",
    "Move-in Date",
    "Vehicle Sticker",
    "Emergency Contact",
    "Notes",
  ]);
  assert.equal(
    result.warnings.some((warning) => warning.code === "hidden_sheet"),
    true,
  );
});

test("testing workbook used range includes QA rows 28-29 and parser is not limited by AutoFilter", () => {
  const workbook = XLSX.read(readFileSync(FIXTURE_PATH), {
    type: "buffer",
    cellDates: false,
  });
  const sheet = workbook.Sheets["Resident Import Test Data"];
  assert.equal(sheet?.["!ref"], "A1:N29");
  assert.equal(sheet?.["!autofilter"]?.ref, "A1:N27");
  assert.equal(XLSX.utils.sheet_to_json(sheet).length, 28);

  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const outcome = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.result.rows.some((row) => row.rowNumber === 28), true);
  assert.equal(outcome.result.rows.some((row) => row.rowNumber === 29), true);
});

test("testing workbook preserves whitespace and invalid business values", () => {
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const outcome = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const byCase = new Map(
    outcome.result.rows.map((row) => [row.displayValues[0], row]),
  );

  const messy = byCase.get("TEST-N1");
  assert.equal(messy?.displayValues[1], " Tower A ");
  assert.equal(messy?.displayValues[3], " 701 ");
  assert.equal(messy?.displayValues[4], " Tara Menon ");

  const chairman = byCase.get("TEST-M");
  assert.equal(chairman?.displayValues[5], "Chairman");

  const shortMobile = byCase.get("TEST-K1");
  assert.equal(shortMobile?.displayValues[6], "12345");

  const duplicate = byCase.get("TEST-G");
  assert.equal(duplicate?.displayValues[4], "Amit Patel");
  assert.equal(duplicate?.displayValues[6], "9876500001");
});

test("testing workbook handles Excel date cells", () => {
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const outcome = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const first = outcome.result.rows[0];
  const dateCell = first?.cells[10];
  assert.ok(dateCell);
  assert.equal(dateCell?.kind, "date");
  assert.equal(String(dateCell?.value ?? ""), "2023-04-12");
  assert.equal(String(first?.displayValues[10] ?? ""), "2023-04-12");
});

test("formula cells use the cached value and surface a warning", () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Total"],
    ["Asha", 1],
  ]);
  sheet.B2 = { t: "n", v: 2, f: "1+1" };
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const bytes = new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
  );

  const outcome = parseResidentImportWorkbook({
    fileName: "formulas.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.result.rows[0]?.displayValues[1], "2");
  assert.equal(
    outcome.result.warnings.some((warning) => warning.code === "formula_cell"),
    true,
  );
});

test("hidden sheets cannot be selected explicitly", () => {
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const outcome = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
    selectedSheet: "_parser_ignore",
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }
  assert.equal(outcome.code, "sheet_unavailable");
});

test("duplicate headers stay distinguishable by column index", () => {
  const bytes = workbookBytes("Sheet1", [
    ["Mobile", "Mobile"],
    ["9876500001", "9876500002"],
  ]);
  const outcome = parseResidentImportWorkbook({
    fileName: "duplicates.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.deepEqual(outcome.result.headers, ["Mobile", "Mobile"]);
  assert.deepEqual(outcome.result.duplicateHeaders, ["Mobile"]);
  assert.equal(outcome.result.columns[0]?.index, 0);
  assert.equal(outcome.result.columns[1]?.index, 1);
  assert.equal(outcome.result.rows[0]?.displayValues[0], "9876500001");
  assert.equal(outcome.result.rows[0]?.displayValues[1], "9876500002");
  assert.equal(
    outcome.result.warnings.some((warning) => warning.message === DUPLICATE_HEADER_WARNING),
    true,
  );
});

test("rejects a sheet with no header row", () => {
  const bytes = workbookBytes("Empty", [[], []]);
  const outcome = parseResidentImportWorkbook({
    fileName: "empty-sheet.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, "missing_header_row");
  }
});

test("rejects non-xlsx, empty, oversized, and corrupt workbooks", () => {
  const csv = parseResidentImportWorkbook({
    fileName: "residents.csv",
    bytes: new Uint8Array([1, 2, 3]),
  });
  assert.equal(csv.ok, false);
  if (!csv.ok) {
    assert.equal(csv.code, "unsupported_extension");
    assert.equal(csv.message, getResidentImportAdminMessage("unsupported_extension"));
  }

  const empty = parseResidentImportWorkbook({
    fileName: "empty.xlsx",
    bytes: new Uint8Array(),
  });
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.code, "empty_file");
  }

  const tooLarge = parseResidentImportWorkbook({
    fileName: "huge.xlsx",
    bytes: { byteLength: MAX_RESIDENT_IMPORT_FILE_BYTES + 1 } as Uint8Array,
  });
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) {
    assert.equal(tooLarge.code, "file_too_large");
    assert.match(tooLarge.message, /100 MB/);
  }

  const corrupt = parseResidentImportWorkbook({
    fileName: "broken.xlsx",
    bytes: new Uint8Array([1, 2, 3, 4, 5]),
  });
  assert.equal(corrupt.ok, false);
  if (!corrupt.ok) {
    assert.equal(corrupt.code, "corrupt_workbook");
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isValidIndianMobileNumber, normalizeIndianMobileNumber } from "./admin-resident-directory.ts";
import { normalizeResidentCompareKey } from "./resident-import-foundation.ts";
import {
  applyResidentImportColumnTarget,
  createResidentImportMappingSnapshot,
  updateResidentImportCustomField,
  type ResidentImportMappingSnapshot,
} from "./resident-import-mapping.ts";
import { parseResidentImportWorkbook, type WorkbookParseResult } from "./resident-import-parse.ts";
import {
  filterResidentImportValidatedRows,
  isValidResidentImportMobile,
  normalizeResidentImportMobile,
  residentImportCompareKey,
  summarizeResidentImportValidation,
  validateResidentImportWorkbook,
} from "./resident-import-validate.ts";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/testing/fixtures/m03-resident-import/M03_Resident_Import_Testing.xlsx",
);

function parseResult(
  headers: string[],
  rows: string[][],
  kinds?: Array<Array<"string" | "date" | "number">>,
): WorkbookParseResult {
  return {
    fileName: "sample.xlsx",
    fileBytes: 1,
    sheetNames: ["Sheet1"],
    hiddenSheetNames: [],
    visibleSheetNames: ["Sheet1"],
    selectedSheet: "Sheet1",
    columns: headers.map((header, index) => ({ index, header })),
    headers,
    duplicateHeaders: [],
    rows: rows.map((displayValues, index) => ({
      rowNumber: index + 2,
      displayValues,
      cells: displayValues.map((value, columnIndex) => {
        const kind = kinds?.[index]?.[columnIndex] ?? "string";
        return {
          address: `${columnIndex}:${index}`,
          kind,
          value: kind === "number" ? Number(value) : value,
          formula: null,
          numberFormat: kind === "date" ? "yyyy-mm-dd" : null,
        };
      }),
    })),
    totalDataRowCount: rows.length,
    warnings: [],
  };
}

function mappingFor(workbook: WorkbookParseResult): ResidentImportMappingSnapshot {
  return createResidentImportMappingSnapshot(workbook);
}

function loadFixture() {
  const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const outcome = parseResidentImportWorkbook({
    fileName: "M03_Resident_Import_Testing.xlsx",
    bytes,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    throw new Error("fixture parse failed");
  }
  const mapping = createResidentImportMappingSnapshot(outcome.result);
  const validation = validateResidentImportWorkbook({
    workbook: outcome.result,
    mapping,
  });
  assert.equal(validation.ok, true);
  if (!validation.ok) {
    throw new Error("fixture validation failed");
  }
  const byCase = new Map(
    validation.rows.map((row, index) => [
      outcome.result.rows[index]?.displayValues[0] ?? "",
      row,
    ]),
  );
  return { workbook: outcome.result, mapping, validation, byCase };
}

test("validation compare keys and mobiles stay aligned with Phase 1B helpers", () => {
  assert.equal(residentImportCompareKey(" Tower A "), normalizeResidentCompareKey(" Tower A "));
  assert.equal(residentImportCompareKey("A-101"), normalizeResidentCompareKey("A-101"));
  assert.equal(residentImportCompareKey(""), normalizeResidentCompareKey("   "));
  assert.equal(
    normalizeResidentImportMobile("+91 98765-00001"),
    normalizeIndianMobileNumber("+91 98765-00001"),
  );
  assert.equal(
    isValidResidentImportMobile("9876500001"),
    isValidIndianMobileNumber("9876500001"),
  );
  assert.equal(isValidResidentImportMobile("12345"), isValidIndianMobileNumber("12345"));
  assert.equal(
    isValidResidentImportMobile("5123456789"),
    isValidIndianMobileNumber("5123456789"),
  );
  assert.equal(isValidResidentImportMobile("98765432101234"), false);
  assert.equal(isValidIndianMobileNumber("98765432101234"), false);
});

test("missing required mapped values are INVALID and preserve raw display", () => {
  const workbook = parseResult(
    ["Flat No", "Resident Name"],
    [
      ["", "Asha"],
      [" 101 ", ""],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "INVALID");
  assert.equal(outcome.rows[0]?.errors[0]?.code, "MISSING_FLAT_NUMBER");
  assert.equal(outcome.rows[1]?.status, "INVALID");
  assert.equal(outcome.rows[1]?.errors[0]?.code, "MISSING_RESIDENT_NAME");
  assert.equal(outcome.rows[1]?.display.flatNumber, " 101 ");
});

test("valid, invalid, and blank optional mobiles", () => {
  const workbook = parseResult(
    ["Unit", "Name", "Mobile"],
    [
      ["101", "Asha", "9876500001"],
      ["102", "Ritu", "12345"],
      ["103", "Kabir", "5123456789"],
      ["104", "Neha", ""],
      ["105", "Omar", " 98765-00002 "],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "VALID_NEW");
  assert.equal(outcome.rows[1]?.status, "INVALID");
  assert.equal(outcome.rows[1]?.errors[0]?.code, "INVALID_MOBILE");
  assert.equal(outcome.rows[2]?.status, "INVALID");
  assert.equal(outcome.rows[3]?.status, "VALID_NEW");
  assert.equal(outcome.rows[3]?.display.primaryMobile, "");
  assert.equal(outcome.rows[4]?.status, "VALID_NEW");
  assert.equal(outcome.rows[4]?.display.primaryMobile, " 98765-00002 ");
});

test("invalid Resident Type Chairman is not rewritten", () => {
  const workbook = parseResult(
    ["Unit", "Name", "Resident Type"],
    [["601", "Nisha Bhatt", "Chairman"]],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "INVALID");
  assert.equal(outcome.rows[0]?.errors[0]?.code, "INVALID_RESIDENT_TYPE");
  assert.equal(outcome.rows[0]?.display.residentType, "Chairman");
});

test("blank building is allowed and family same-flat different mobiles stay VALID_NEW", () => {
  const workbook = parseResult(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["", "801", "Gita Pillai", "9876500801"],
      ["A", "102", "Rajesh Sharma", "9876500102"],
      ["A", "102", "Aarav Sharma", "9876500103"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "VALID_NEW");
  assert.equal(outcome.rows[0]?.display.building, "");
  assert.equal(outcome.rows[1]?.status, "VALID_NEW");
  assert.equal(outcome.rows[2]?.status, "VALID_NEW");
});

test("intra-file duplicate keeps the first row as the candidate", () => {
  const workbook = parseResult(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "101", "Amit Patel", "9876500001"],
      ["A", "101", "Amit Patel", "9876500001"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "VALID_NEW");
  assert.equal(outcome.rows[1]?.status, "INTRA_FILE_DUPLICATE");
  assert.equal(outcome.rows[1]?.warnings[0]?.code, "INTRA_FILE_DUPLICATE");
  assert.match(outcome.rows[1]?.warnings[0]?.message ?? "", /Excel row 2/);
});

test("same flat and name with different mobiles is a possible conflict", () => {
  const workbook = parseResult(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "101", "Amit Patel", "9876500001"],
      ["A", "101", "Amit Patel", "9876500099"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "VALID_NEW");
  assert.equal(outcome.rows[1]?.status, "POSSIBLE_CONFLICT");
  assert.equal(
    outcome.rows[1]?.warnings.some(
      (issue) => issue.code === "POSSIBLE_CONFLICT_FLAT_NAME_MOBILE",
    ),
    true,
  );
});

test("same flat, different name, shared mobile is a possible conflict", () => {
  const workbook = parseResult(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "102", "Rajesh Sharma", "9876500102"],
      ["A", "102", "Priya Sharma", "9876500102"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "VALID_NEW");
  assert.equal(outcome.rows[1]?.status, "POSSIBLE_CONFLICT");
  assert.equal(
    outcome.rows[1]?.warnings.some((issue) => issue.code === "POSSIBLE_SHARED_MOBILE"),
    true,
  );
});

test("same mobile on a different flat is a possible conflict", () => {
  const workbook = parseResult(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "101", "Amit Patel", "9876500001"],
      ["A", "105", "Sunita Rao", "9876500001"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[1]?.status, "POSSIBLE_CONFLICT");
  assert.equal(
    outcome.rows[1]?.warnings.some(
      (issue) => issue.code === "POSSIBLE_CONFLICT_MOBILE_FLAT",
    ),
    true,
  );
});

test("same resident name on a different flat is a possible conflict", () => {
  const workbook = parseResult(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "101", "Amit Patel", "9876500001"],
      ["B", "202", "Amit Patel", "9876500202"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[1]?.status, "POSSIBLE_CONFLICT");
  assert.equal(
    outcome.rows[1]?.warnings.some((issue) => issue.code === "POSSIBLE_CONFLICT_NAME_FLAT"),
    true,
  );
});

test("Building A/201 vs Building B/201 are valid distinct flats", () => {
  const workbook = parseResult(
    ["Building", "Flat No", "Resident Name", "Mobile"],
    [
      ["A", "201", "Kiran Mehta", "9876500301"],
      ["B", "201", "Farhan Qureshi", "9876500302"],
    ],
  );
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }
  assert.equal(outcome.rows[0]?.status, "VALID_NEW");
  assert.equal(outcome.rows[1]?.status, "VALID_NEW");
  assert.equal(
    outcome.rows[0]?.warnings.some(
      (issue) => issue.code === "FLAT_IDENTITY_BACKEND_LIMITATION",
    ),
    false,
  );
  assert.equal(
    outcome.rows[1]?.warnings.some(
      (issue) => issue.code === "FLAT_IDENTITY_BACKEND_LIMITATION",
    ),
    false,
  );
  assert.equal(
    outcome.rows[0]?.warnings.some((issue) =>
      issue.code.startsWith("POSSIBLE_CONFLICT_FLAT"),
    ),
    false,
  );
});

test("custom field types validate without rewriting display values", () => {
  const workbook = parseResult(
    ["Unit", "Name", "Notes", "Count", "Phone", "Move-in", "Kind", "Flag", "Tags"],
    [
      [
        "101",
        "Asha",
        "hello",
        "12",
        "9876500001",
        "2023-04-12",
        "Covered",
        "Yes",
        "A, B",
      ],
    ],
    [[
      "string",
      "string",
      "string",
      "number",
      "string",
      "date",
      "string",
      "string",
      "string",
    ]],
  );
  let mapping = mappingFor(workbook);
  const typeByHeader = new Map(
    [
      ["Notes", "text"],
      ["Count", "number"],
      ["Phone", "phone"],
      ["Move-in", "date"],
      ["Kind", "dropdown"],
      ["Flag", "yes_no"],
      ["Tags", "multi_select"],
    ] as const,
  );
  for (const column of mapping.columns) {
    const fieldType = typeByHeader.get(column.header as never);
    if (!fieldType || column.target !== "CUSTOM_FIELD") {
      continue;
    }
    mapping = updateResidentImportCustomField(mapping, column.columnIndex, {
      fieldType,
      options:
        fieldType === "dropdown" || fieldType === "multi_select"
          ? ["Covered", "Open", "A", "B"]
          : [],
    });
  }

  const valid = validateResidentImportWorkbook({ workbook, mapping });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.rows[0]?.status, "VALID_NEW");
    assert.equal(valid.rows[0]?.display.residentName, "Asha");
  }

  const badWorkbook = parseResult(
    ["Unit", "Name", "Count", "Phone", "Move-in", "Kind", "Flag", "Tags", "Need"],
    [[
      "101",
      "Asha",
      "twelve",
      "123",
      "not-a-date",
      "Underground",
      "Maybe",
      "Z",
      "",
    ]],
  );
  let badMapping = mappingFor(badWorkbook);
  const applyType = (
    header: string,
    fieldType: "number" | "phone" | "date" | "dropdown" | "yes_no" | "multi_select" | "text",
    required = false,
  ) => {
    const column = badMapping.columns.find((item) => item.header === header);
    if (!column) {
      return;
    }
    if (column.target !== "CUSTOM_FIELD") {
      const applied = applyResidentImportColumnTarget(
        badMapping,
        column.columnIndex,
        "CUSTOM_FIELD",
      );
      if (applied.ok) {
        badMapping = applied.snapshot;
      }
    }
    badMapping = updateResidentImportCustomField(badMapping, column.columnIndex, {
      fieldType,
      required,
      options:
        fieldType === "dropdown" || fieldType === "multi_select"
          ? ["Covered", "A"]
          : [],
    });
  };
  applyType("Count", "number");
  applyType("Phone", "phone");
  applyType("Move-in", "date");
  applyType("Kind", "dropdown");
  applyType("Flag", "yes_no");
  applyType("Tags", "multi_select");
  applyType("Need", "text", true);

  const invalid = validateResidentImportWorkbook({
    workbook: badWorkbook,
    mapping: badMapping,
  });
  assert.equal(invalid.ok, true);
  if (!invalid.ok) {
    return;
  }
  const codes = invalid.rows[0]?.errors.map((issue) => issue.code) ?? [];
  assert.equal(codes.includes("INVALID_CUSTOM_NUMBER"), true);
  assert.equal(codes.includes("INVALID_CUSTOM_PHONE"), true);
  assert.equal(codes.includes("INVALID_CUSTOM_DATE"), true);
  assert.equal(codes.includes("INVALID_CUSTOM_DROPDOWN"), true);
  assert.equal(codes.includes("INVALID_CUSTOM_YES_NO"), true);
  assert.equal(codes.includes("INVALID_CUSTOM_MULTI_SELECT"), true);
  assert.equal(codes.includes("REQUIRED_CUSTOM_FIELD"), true);
});

test("testing workbook classifies the QA cases without importing", () => {
  const { validation, byCase } = loadFixture();
  assert.equal(validation.summary.totalRows, 28);
  assert.equal(byCase.get("TEST-N1")?.display.building, " Tower A ");
  assert.equal(byCase.get("TEST-N1")?.display.flatNumber, " 701 ");
  assert.equal(byCase.get("TEST-N1")?.display.residentName, " Tara Menon ");

  assert.equal(byCase.get("TEST-A")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-B1")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-B2")?.status, "POSSIBLE_CONFLICT");
  assert.equal(byCase.get("TEST-B3")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-C")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-D1")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-D2")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-E1")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-G")?.status, "INTRA_FILE_DUPLICATE");
  assert.equal(byCase.get("TEST-H")?.status, "POSSIBLE_CONFLICT");
  assert.equal(byCase.get("TEST-J")?.status, "POSSIBLE_CONFLICT");
  assert.equal(byCase.get("TEST-K1")?.status, "INVALID");
  assert.equal(byCase.get("TEST-K2")?.status, "INVALID");
  assert.equal(byCase.get("TEST-L1")?.status, "INVALID");
  assert.equal(byCase.get("TEST-L2")?.status, "INVALID");
  assert.equal(byCase.get("TEST-M")?.status, "INVALID");
  assert.equal(byCase.get("TEST-N1")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-N2")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-O")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-P1")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-P2")?.status, "POSSIBLE_CONFLICT");
  assert.equal(byCase.get("TEST-P3")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-P4")?.status, "POSSIBLE_CONFLICT");
  assert.equal(byCase.get("TEST-DB1")?.status, "VALID_NEW");
  assert.equal(byCase.get("TEST-DB1")?.rowNumber, 28);
  assert.equal(byCase.get("TEST-DB2")?.status, "POSSIBLE_CONFLICT");
  assert.equal(byCase.get("TEST-DB2")?.rowNumber, 29);

  assert.equal(
    byCase.get("TEST-G")?.warnings.some((issue) => issue.code === "INTRA_FILE_DUPLICATE"),
    true,
  );
  assert.equal(
    byCase.get("TEST-D1")?.warnings.some(
      (issue) => issue.code === "FLAT_IDENTITY_BACKEND_LIMITATION",
    ),
    false,
  );
  assert.equal(byCase.get("TEST-K1")?.errors[0]?.code, "INVALID_MOBILE");
  assert.equal(byCase.get("TEST-L1")?.errors[0]?.code, "MISSING_RESIDENT_NAME");
  assert.equal(byCase.get("TEST-L2")?.errors[0]?.code, "MISSING_FLAT_NUMBER");
  assert.equal(byCase.get("TEST-M")?.errors[0]?.code, "INVALID_RESIDENT_TYPE");
  assert.equal(byCase.get("TEST-M")?.display.residentType, "Chairman");

  const summary = summarizeResidentImportValidation(validation.rows);
  assert.deepEqual(summary, validation.summary);
  assert.equal(summary.validNew, 16);
  assert.equal(summary.possibleConflicts, 6);
  assert.equal(summary.duplicates, 1);
  assert.equal(summary.invalid, 5);

  assert.equal(filterResidentImportValidatedRows(validation.rows, "valid").length, 16);
  assert.equal(filterResidentImportValidatedRows(validation.rows, "conflicts").length, 6);
  assert.equal(filterResidentImportValidatedRows(validation.rows, "duplicates").length, 1);
  assert.equal(filterResidentImportValidatedRows(validation.rows, "invalid").length, 5);
  assert.equal(filterResidentImportValidatedRows(validation.rows, "all").length, 28);
});

test("incomplete mapping does not validate rows", () => {
  const workbook = parseResult(["Notes"], [["hello"]]);
  const outcome = validateResidentImportWorkbook({
    workbook,
    mapping: mappingFor(workbook),
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, "INCOMPLETE_MAPPING");
  }
});

/**
 * M03-T03 resident import row validation (Phase 3B).
 *
 * Mapping completeness -> field validation -> intra-file comparison.
 * Database-aware duplicate matching is deferred (Phase 3D).
 * Display values are never rewritten; comparison uses Phase 1B keys.
 *
 * Compare-key and Indian-mobile rules are copied from
 * resident-import-foundation / admin-resident-directory so this module stays
 * loadable by the Node test runner (extensionless sibling imports fail there).
 * Tests assert they stay aligned.
 */

import type { WorkbookParseResult, WorkbookParsedRow, WorkbookRawCell } from "./resident-import-parse";
import type {
  ResidentImportColumnMapping,
  ResidentImportMappingSnapshot,
} from "./resident-import-mapping";

export const RESIDENT_IMPORT_VALIDATION_STATUSES = [
  "INVALID",
  "VALID_NEW",
  "INTRA_FILE_DUPLICATE",
  "POSSIBLE_CONFLICT",
] as const;

export type ResidentImportValidationStatus =
  (typeof RESIDENT_IMPORT_VALIDATION_STATUSES)[number];

export const RESIDENT_IMPORT_VALIDATION_FILTERS = [
  "all",
  "valid",
  "conflicts",
  "duplicates",
  "invalid",
] as const;

export type ResidentImportValidationFilter =
  (typeof RESIDENT_IMPORT_VALIDATION_FILTERS)[number];

export const RESIDENT_IMPORT_CANONICAL_TYPES = [
  "Owner",
  "Tenant",
  "Family Member",
  "Other",
] as const;

const INDIAN_MOBILE_NUMBER_PATTERN = /^[6-9][0-9]{9}$/;

const YES_NO_TRUE = new Set(["yes", "y", "true"]);
const YES_NO_FALSE = new Set(["no", "n", "false"]);

export const IMPORT_CONFIRMATION_UNAVAILABLE_MESSAGE =
  "Import confirmation will be available after conflicts are resolved.";

export const FLAT_IDENTITY_BACKEND_LIMITATION_MESSAGE =
  "Valid resident data, but this flat requires building-aware database support before it can be imported.";

export type ResidentImportIssueCode =
  | "INCOMPLETE_MAPPING"
  | "MISSING_FLAT_NUMBER"
  | "MISSING_RESIDENT_NAME"
  | "INVALID_MOBILE"
  | "INVALID_RESIDENT_TYPE"
  | "REQUIRED_CUSTOM_FIELD"
  | "INVALID_CUSTOM_NUMBER"
  | "INVALID_CUSTOM_PHONE"
  | "INVALID_CUSTOM_DATE"
  | "INVALID_CUSTOM_DROPDOWN"
  | "INVALID_CUSTOM_YES_NO"
  | "INVALID_CUSTOM_MULTI_SELECT"
  | "INTRA_FILE_DUPLICATE"
  | "POSSIBLE_SHARED_MOBILE"
  | "POSSIBLE_CONFLICT_FLAT_NAME_MOBILE"
  | "POSSIBLE_CONFLICT_FLAT_SHARED_MOBILE"
  | "POSSIBLE_CONFLICT_MOBILE_FLAT"
  | "POSSIBLE_CONFLICT_NAME_FLAT"
  | "POSSIBLE_CONFLICT_BLANK_BUILDING"
  | "POSSIBLE_CONFLICT_SPLIT_IDENTITY"
  | "FLAT_IDENTITY_BACKEND_LIMITATION";

export type ResidentImportIssue = {
  code: ResidentImportIssueCode;
  message: string;
  field?: string;
  header?: string;
  columnIndex?: number;
  relatedRowNumbers?: number[];
};

export type ResidentImportRowDisplay = {
  building: string;
  wing: string;
  flatNumber: string;
  residentName: string;
  residentType: string;
  primaryMobile: string;
  additionalMobiles: string[];
};

export type ResidentImportValidatedRow = {
  rowNumber: number;
  status: ResidentImportValidationStatus;
  display: ResidentImportRowDisplay;
  errors: ResidentImportIssue[];
  warnings: ResidentImportIssue[];
  relatedRowNumbers: number[];
};

export type ResidentImportValidationSummary = {
  totalRows: number;
  validNew: number;
  possibleConflicts: number;
  duplicates: number;
  invalid: number;
};

export type ResidentImportValidationSuccess = {
  ok: true;
  rows: ResidentImportValidatedRow[];
  summary: ResidentImportValidationSummary;
};

export type ResidentImportValidationFailure = {
  ok: false;
  code: "INCOMPLETE_MAPPING";
  message: string;
};

export type ResidentImportValidationOutcome =
  | ResidentImportValidationSuccess
  | ResidentImportValidationFailure;

type PreparedRow = {
  rowNumber: number;
  display: ResidentImportRowDisplay;
  buildingKey: string;
  wingKey: string;
  buildingIdentityKey: string;
  wingBuildingKey: string;
  flatKey: string;
  nameKey: string;
  typeKey: string;
  validMobiles: string[];
  errors: ResidentImportIssue[];
  warnings: ResidentImportIssue[];
};

/** Must stay aligned with normalizeResidentCompareKey. */
export function residentImportCompareKey(
  value: string | null | undefined,
): string {
  if (value == null) {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Must stay aligned with normalizeIndianMobileNumber. */
export function normalizeResidentImportMobile(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits.slice(0, 10);
}

/** Must stay aligned with isValidIndianMobileNumber. */
export function isValidResidentImportMobile(value: string): boolean {
  if (/[a-zA-Z]/.test(value)) {
    return false;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return INDIAN_MOBILE_NUMBER_PATTERN.test(digits);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return INDIAN_MOBILE_NUMBER_PATTERN.test(digits.slice(2));
  }
  return false;
}

export function summarizeResidentImportValidation(
  rows: readonly ResidentImportValidatedRow[],
): ResidentImportValidationSummary {
  return {
    totalRows: rows.length,
    validNew: rows.filter((row) => row.status === "VALID_NEW").length,
    possibleConflicts: rows.filter((row) => row.status === "POSSIBLE_CONFLICT")
      .length,
    duplicates: rows.filter((row) => row.status === "INTRA_FILE_DUPLICATE")
      .length,
    invalid: rows.filter((row) => row.status === "INVALID").length,
  };
}

export function filterResidentImportValidatedRows(
  rows: readonly ResidentImportValidatedRow[],
  filter: ResidentImportValidationFilter,
): ResidentImportValidatedRow[] {
  if (filter === "valid") {
    return rows.filter((row) => row.status === "VALID_NEW");
  }
  if (filter === "conflicts") {
    return rows.filter((row) => row.status === "POSSIBLE_CONFLICT");
  }
  if (filter === "duplicates") {
    return rows.filter((row) => row.status === "INTRA_FILE_DUPLICATE");
  }
  if (filter === "invalid") {
    return rows.filter((row) => row.status === "INVALID");
  }
  return [...rows];
}

export function formatResidentImportValidationStatus(
  status: ResidentImportValidationStatus,
): string {
  switch (status) {
    case "VALID_NEW":
      return "Valid";
    case "POSSIBLE_CONFLICT":
      return "Conflict";
    case "INTRA_FILE_DUPLICATE":
      return "Duplicate";
    case "INVALID":
      return "Invalid";
  }
}

function columnForTarget(
  mapping: ResidentImportMappingSnapshot,
  target: ResidentImportColumnMapping["target"],
): ResidentImportColumnMapping | undefined {
  return mapping.columns.find((column) => column.target === target);
}

function columnsForTarget(
  mapping: ResidentImportMappingSnapshot,
  target: ResidentImportColumnMapping["target"],
): ResidentImportColumnMapping[] {
  return mapping.columns.filter((column) => column.target === target);
}

function displayAt(row: WorkbookParsedRow, columnIndex: number | undefined): string {
  if (columnIndex == null) {
    return "";
  }
  return row.displayValues[columnIndex] ?? "";
}

function cellAt(
  row: WorkbookParsedRow,
  columnIndex: number | undefined,
): WorkbookRawCell | null {
  if (columnIndex == null) {
    return null;
  }
  return row.cells[columnIndex] ?? null;
}

function buildingIdentityKey(buildingKey: string, wingKey: string): string {
  return [buildingKey, wingKey].filter((part) => part.length > 0).join(" ");
}

function isCanonicalType(value: string): boolean {
  const key = residentImportCompareKey(value);
  return RESIDENT_IMPORT_CANONICAL_TYPES.some(
    (type) => residentImportCompareKey(type) === key,
  );
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isIndianDisplayDate(value: string): boolean {
  const match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value.trim());
  if (!match) {
    return false;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidImportDate(
  display: string,
  cell: WorkbookRawCell | null,
): boolean {
  if (cell?.kind === "date" && typeof cell.value === "string" && isIsoDate(cell.value)) {
    return true;
  }
  if (typeof cell?.value === "string" && isIsoDate(cell.value)) {
    return true;
  }
  return isIsoDate(display) || isIndianDisplayDate(display);
}

function isNumericValue(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function isYesNoValue(value: string): boolean {
  const key = value.trim().toLowerCase();
  return YES_NO_TRUE.has(key) || YES_NO_FALSE.has(key);
}

function optionMatches(value: string, options: readonly string[]): boolean {
  const key = residentImportCompareKey(value);
  return options.some((option) => residentImportCompareKey(option) === key);
}

function splitMultiSelect(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function mobileIssue(
  header: string,
  columnIndex: number,
): ResidentImportIssue {
  return {
    code: "INVALID_MOBILE",
    message: `${header} must contain a valid 10-digit Indian mobile number.`,
    field: header,
    header,
    columnIndex,
  };
}

function collectMobiles(
  rawValues: Array<{ value: string; header: string; columnIndex: number }>,
  errors: ResidentImportIssue[],
): string[] {
  const valid: string[] = [];
  for (const entry of rawValues) {
    if (entry.value.trim() === "") {
      continue;
    }
    if (!isValidResidentImportMobile(entry.value)) {
      errors.push(mobileIssue(entry.header, entry.columnIndex));
      continue;
    }
    valid.push(normalizeResidentImportMobile(entry.value));
  }
  return valid;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function validateCustomFields(
  row: WorkbookParsedRow,
  mapping: ResidentImportMappingSnapshot,
): ResidentImportIssue[] {
  const issues: ResidentImportIssue[] = [];
  for (const column of columnsForTarget(mapping, "CUSTOM_FIELD")) {
    const config = column.customField;
    if (!config) {
      continue;
    }
    const display = displayAt(row, column.columnIndex);
    const trimmed = display.trim();
    const name = config.name.trim() || column.header || `Column ${column.excelAddress}`;
    const base = {
      field: name,
      header: column.header,
      columnIndex: column.columnIndex,
    };

    if (!trimmed) {
      if (config.required) {
        issues.push({
          ...base,
          code: "REQUIRED_CUSTOM_FIELD",
          message: `${name} is required.`,
        });
      }
      continue;
    }

    switch (config.fieldType) {
      case "text":
        break;
      case "number":
        if (!isNumericValue(display)) {
          issues.push({
            ...base,
            code: "INVALID_CUSTOM_NUMBER",
            message: `${name} must be a number.`,
          });
        }
        break;
      case "phone":
        if (!isValidResidentImportMobile(display)) {
          issues.push({
            ...base,
            code: "INVALID_CUSTOM_PHONE",
            message: `${name} must contain a valid 10-digit Indian mobile number.`,
          });
        }
        break;
      case "date":
        if (!isValidImportDate(display, cellAt(row, column.columnIndex))) {
          issues.push({
            ...base,
            code: "INVALID_CUSTOM_DATE",
            message: `${name} must be a valid date.`,
          });
        }
        break;
      case "dropdown":
        if (!optionMatches(display, config.options)) {
          issues.push({
            ...base,
            code: "INVALID_CUSTOM_DROPDOWN",
            message: `${name} must be one of the configured options.`,
          });
        }
        break;
      case "yes_no":
        if (!isYesNoValue(display)) {
          issues.push({
            ...base,
            code: "INVALID_CUSTOM_YES_NO",
            message: `${name} must be Yes or No.`,
          });
        }
        break;
      case "multi_select": {
        const tokens = splitMultiSelect(display);
        if (
          tokens.length === 0 ||
          tokens.some((token) => !optionMatches(token, config.options))
        ) {
          issues.push({
            ...base,
            code: "INVALID_CUSTOM_MULTI_SELECT",
            message: `${name} contains a value that is not in the configured options.`,
          });
        }
        break;
      }
    }
  }
  return issues;
}

function prepareRow(
  row: WorkbookParsedRow,
  mapping: ResidentImportMappingSnapshot,
): PreparedRow {
  const buildingCol = columnForTarget(mapping, "BUILDING");
  const wingCol = columnForTarget(mapping, "WING");
  const flatCol = columnForTarget(mapping, "FLAT_NUMBER");
  const nameCol = columnForTarget(mapping, "RESIDENT_NAME");
  const typeCol = columnForTarget(mapping, "RESIDENT_TYPE");
  const primaryCol = columnForTarget(mapping, "PRIMARY_MOBILE");
  const additionalCols = columnsForTarget(mapping, "ADDITIONAL_MOBILE");

  const display: ResidentImportRowDisplay = {
    building: displayAt(row, buildingCol?.columnIndex),
    wing: displayAt(row, wingCol?.columnIndex),
    flatNumber: displayAt(row, flatCol?.columnIndex),
    residentName: displayAt(row, nameCol?.columnIndex),
    residentType: displayAt(row, typeCol?.columnIndex),
    primaryMobile: displayAt(row, primaryCol?.columnIndex),
    additionalMobiles: additionalCols.map((column) =>
      displayAt(row, column.columnIndex),
    ),
  };

  const errors: ResidentImportIssue[] = [];
  if (display.flatNumber.trim() === "") {
    errors.push({
      code: "MISSING_FLAT_NUMBER",
      message: "Flat Number is required.",
      field: "Flat Number",
      header: flatCol?.header,
      columnIndex: flatCol?.columnIndex,
    });
  }
  if (display.residentName.trim() === "") {
    errors.push({
      code: "MISSING_RESIDENT_NAME",
      message: "Resident Name is required.",
      field: "Resident Name",
      header: nameCol?.header,
      columnIndex: nameCol?.columnIndex,
    });
  }

  if (typeCol && display.residentType.trim() !== "") {
    if (!isCanonicalType(display.residentType)) {
      errors.push({
        code: "INVALID_RESIDENT_TYPE",
        message:
          "Resident Type must be Owner, Tenant, Family Member, or Other.",
        field: "Resident Type",
        header: typeCol.header,
        columnIndex: typeCol.columnIndex,
      });
    }
  }

  const mobileInputs = [
    ...(primaryCol
      ? [
          {
            value: display.primaryMobile,
            header: primaryCol.header || "Primary Mobile",
            columnIndex: primaryCol.columnIndex,
          },
        ]
      : []),
    ...additionalCols.map((column, index) => ({
      value: display.additionalMobiles[index] ?? "",
      header: column.header || "Additional Mobile",
      columnIndex: column.columnIndex,
    })),
  ];
  const validMobiles = collectMobiles(mobileInputs, errors);
  errors.push(...validateCustomFields(row, mapping));

  const buildingKey = residentImportCompareKey(display.building);
  const wingKey = residentImportCompareKey(display.wing);

  return {
    rowNumber: row.rowNumber,
    display,
    buildingKey,
    wingKey,
    buildingIdentityKey: buildingIdentityKey(buildingKey, wingKey),
    wingBuildingKey: buildingIdentityKey(buildingKey, wingKey),
    flatKey: residentImportCompareKey(display.flatNumber),
    nameKey: residentImportCompareKey(display.residentName),
    typeKey: residentImportCompareKey(display.residentType),
    validMobiles,
    errors,
    warnings: [],
  };
}

function typesCompatible(left: string, right: string): boolean {
  return !left || !right || left === right;
}

function sameFlat(left: PreparedRow, right: PreparedRow): boolean {
  return (
    left.wingBuildingKey === right.wingBuildingKey &&
    left.flatKey === right.flatKey &&
    left.flatKey !== ""
  );
}

function sharedMobiles(left: PreparedRow, right: PreparedRow): string[] {
  return left.validMobiles.filter((mobile) => right.validMobiles.includes(mobile));
}

function isExactDuplicate(candidate: PreparedRow, earlier: PreparedRow): boolean {
  return (
    sameFlat(candidate, earlier) &&
    candidate.nameKey === earlier.nameKey &&
    candidate.nameKey !== "" &&
    sharedMobiles(candidate, earlier).length > 0 &&
    typesCompatible(candidate.typeKey, earlier.typeKey)
  );
}

function conflictIssues(
  row: PreparedRow,
  other: PreparedRow,
): ResidentImportIssue[] {
  const issues: ResidentImportIssue[] = [];
  const related = [other.rowNumber];
  const sameFlatIdentity = sameFlat(row, other);
  const commonMobiles = sharedMobiles(row, other);
  const sameName = row.nameKey !== "" && row.nameKey === other.nameKey;
  const sameFlatNumber =
    row.flatKey !== "" && row.flatKey === other.flatKey;

  if (sameFlatIdentity && sameName && commonMobiles.length === 0) {
    issues.push({
      code: "POSSIBLE_CONFLICT_FLAT_NAME_MOBILE",
      message: `Same flat and resident name as Excel row ${other.rowNumber}, but the mobile numbers do not match.`,
      relatedRowNumbers: related,
    });
  }

  if (sameFlatIdentity && !sameName && commonMobiles.length > 0) {
    issues.push({
      code: "POSSIBLE_CONFLICT_FLAT_SHARED_MOBILE",
      message: `Same flat as Excel row ${other.rowNumber} with a different name and a shared mobile number.`,
      relatedRowNumbers: related,
    });
    issues.push({
      code: "POSSIBLE_SHARED_MOBILE",
      message:
        "This mobile number is also used by another resident in this file.",
      relatedRowNumbers: related,
    });
  }

  if (!sameFlatIdentity && commonMobiles.length > 0) {
    issues.push({
      code: "POSSIBLE_CONFLICT_MOBILE_FLAT",
      message: `This mobile number is also used on a different flat in Excel row ${other.rowNumber}.`,
      relatedRowNumbers: related,
    });
  }

  if (sameName && !sameFlatIdentity && row.flatKey && other.flatKey) {
    issues.push({
      code: "POSSIBLE_CONFLICT_NAME_FLAT",
      message: `The same resident name appears on a different flat in Excel row ${other.rowNumber}.`,
      relatedRowNumbers: related,
    });
  }

  const oneBlankBuilding =
    sameFlatNumber &&
    ((row.buildingIdentityKey === "" && other.buildingIdentityKey !== "") ||
      (other.buildingIdentityKey === "" && row.buildingIdentityKey !== ""));
  if (oneBlankBuilding) {
    issues.push({
      code: "POSSIBLE_CONFLICT_BLANK_BUILDING",
      message: `Flat ${row.display.flatNumber.trim() || row.flatKey} appears with a blank building and a named building in Excel row ${other.rowNumber}.`,
      relatedRowNumbers: related,
    });
  }

  const splitIdentity =
    sameFlatNumber &&
    row.buildingIdentityKey !== other.buildingIdentityKey &&
    row.buildingKey === other.buildingKey &&
    row.buildingKey !== "" &&
    row.wingKey !== other.wingKey;
  if (splitIdentity) {
    issues.push({
      code: "POSSIBLE_CONFLICT_SPLIT_IDENTITY",
      message: `This building/wing combination may be split or combined compared with Excel row ${other.rowNumber}.`,
      relatedRowNumbers: related,
    });
  }

  return issues;
}

function classifyRows(prepared: PreparedRow[]): ResidentImportValidatedRow[] {
  const fieldValid = prepared.filter((row) => row.errors.length === 0);

  const duplicateOf = new Map<number, number>();
  for (let index = 0; index < fieldValid.length; index += 1) {
    const row = fieldValid[index];
    if (!row) {
      continue;
    }
    const earlier = fieldValid.slice(0, index).find((candidate) =>
      isExactDuplicate(row, candidate),
    );
    if (earlier) {
      duplicateOf.set(row.rowNumber, earlier.rowNumber);
    }
  }

  return prepared.map((row) => {
    if (row.errors.length > 0) {
      return {
        rowNumber: row.rowNumber,
        status: "INVALID" as const,
        display: row.display,
        errors: row.errors,
        warnings: row.warnings,
        relatedRowNumbers: [],
      };
    }

    const duplicateSource = duplicateOf.get(row.rowNumber);
    if (duplicateSource != null) {
      const issue: ResidentImportIssue = {
        code: "INTRA_FILE_DUPLICATE",
        message: `Duplicate of Excel row ${duplicateSource}.`,
        relatedRowNumbers: [duplicateSource],
      };
      return {
        rowNumber: row.rowNumber,
        status: "INTRA_FILE_DUPLICATE" as const,
        display: row.display,
        errors: [],
        warnings: [issue],
        relatedRowNumbers: [duplicateSource],
      };
    }

    const warnings: ResidentImportIssue[] = [...row.warnings];
    const related: number[] = [];

    for (const other of fieldValid) {
      if (other.rowNumber >= row.rowNumber) {
        continue;
      }
      const found = conflictIssues(row, other);
      for (const issue of found) {
        warnings.push(issue);
        related.push(...(issue.relatedRowNumbers ?? []));
      }
    }

    if (warnings.length > 0) {
      return {
        rowNumber: row.rowNumber,
        status: "POSSIBLE_CONFLICT" as const,
        display: row.display,
        errors: [],
        warnings,
        relatedRowNumbers: uniqueNumbers(related),
      };
    }

    return {
      rowNumber: row.rowNumber,
      status: "VALID_NEW" as const,
      display: row.display,
      errors: [],
      warnings: [],
      relatedRowNumbers: [],
    };
  });
}

export function validateResidentImportWorkbook(input: {
  workbook: WorkbookParseResult;
  mapping: ResidentImportMappingSnapshot;
}): ResidentImportValidationOutcome {
  const hasFlat = input.mapping.columns.some(
    (column) => column.target === "FLAT_NUMBER",
  );
  const hasName = input.mapping.columns.some(
    (column) => column.target === "RESIDENT_NAME",
  );
  if (!hasFlat || !hasName) {
    return {
      ok: false,
      code: "INCOMPLETE_MAPPING",
      message: "Map Flat Number and Resident Name before validation can start.",
    };
  }

  const prepared = input.workbook.rows.map((row) =>
    prepareRow(row, input.mapping),
  );
  const rows = classifyRows(prepared);
  return {
    ok: true,
    rows,
    summary: summarizeResidentImportValidation(rows),
  };
}

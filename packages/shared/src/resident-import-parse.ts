/**
 * M03-T03 Excel parse contract, V1 import limits, and read-only parser.
 *
 * Parse reads a workbook faithfully.
 * Mapping decides what columns mean.
 * Validation decides whether mapped row data is valid.
 */

import * as XLSX from "xlsx";

/** V1 product limit. Change this value only — do not scatter file-size literals. */
export const MAX_RESIDENT_IMPORT_FILE_BYTES = 100 * 1024 * 1024;

export const RESIDENT_IMPORT_ALLOWED_EXTENSIONS = [".xlsx"] as const;

export const RESIDENT_IMPORT_LIMITS = {
  maxFileBytes: MAX_RESIDENT_IMPORT_FILE_BYTES,
  maxSheetCount: 32,
  maxParserRowCount: 100_000,
  maxColumnCount: 128,
  previewRowCount: 50,
} as const;

/** @deprecated Use RESIDENT_IMPORT_LIMITS. Kept as an alias so older imports keep working. */
export const RESIDENT_IMPORT_PARSE_LIMITS = RESIDENT_IMPORT_LIMITS;

export const RESIDENT_IMPORT_XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const DUPLICATE_HEADER_WARNING =
  "Duplicate column names detected. You will be asked to map them individually.";

export type WorkbookCellKind =
  | "empty"
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "formula"
  | "error";

export type WorkbookRawCell = {
  address: string;
  kind: WorkbookCellKind;
  /** Literal stored or cached value. Formula cells use the cached result when present. */
  value: string | number | boolean | null;
  /** Original formula text when kind is formula; otherwise null. */
  formula: string | null;
  numberFormat: string | null;
};

export type WorkbookDetectedColumn = {
  /** 0-based column index. Duplicate header text stays distinguishable by index. */
  index: number;
  header: string;
};

export type WorkbookParsedRow = {
  /** 1-based Excel row number. The header row is typically 1. */
  rowNumber: number;
  /** Cells aligned to `columns[index]`. */
  cells: Array<WorkbookRawCell | null>;
  /** Display-only strings aligned to `columns[index]`. Not a mapping decision. */
  displayValues: string[];
};

export type WorkbookParseWarningCode =
  | "duplicate_header"
  | "hidden_sheet"
  | "formula_cell";

export type WorkbookParseWarning = {
  code: WorkbookParseWarningCode;
  message: string;
  sheetName?: string;
  rowNumber?: number;
  header?: string;
};

export type WorkbookParseResult = {
  fileName: string;
  fileBytes: number;
  sheetNames: string[];
  hiddenSheetNames: string[];
  visibleSheetNames: string[];
  selectedSheet: string;
  columns: WorkbookDetectedColumn[];
  /** Original header strings, including duplicates, in column order. */
  headers: string[];
  duplicateHeaders: string[];
  rows: WorkbookParsedRow[];
  totalDataRowCount: number;
  warnings: WorkbookParseWarning[];
};

export type WorkbookParseErrorCode =
  | "unsupported_extension"
  | "file_too_large"
  | "empty_file"
  | "too_many_sheets"
  | "too_many_rows"
  | "too_many_columns"
  | "empty_workbook"
  | "missing_header_row"
  | "sheet_unavailable"
  | "corrupt_workbook";

export type WorkbookParseFailure = {
  ok: false;
  code: WorkbookParseErrorCode;
  message: string;
};

export type WorkbookParseSuccess = {
  ok: true;
  result: WorkbookParseResult;
};

export type WorkbookParseOutcome = WorkbookParseSuccess | WorkbookParseFailure;

export type WorkbookParseRequest = {
  fileName: string;
  bytes: Uint8Array;
  selectedSheet?: string;
};

export function formatResidentImportMaxFileSize(): string {
  return `${MAX_RESIDENT_IMPORT_FILE_BYTES / (1024 * 1024)} MB`;
}

export function formatResidentImportFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb >= 10 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
  }

  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function isResidentImportXlsxFileName(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith(".xlsx");
}

export function getResidentImportAdminMessage(
  code: WorkbookParseErrorCode,
): string {
  switch (code) {
    case "unsupported_extension":
      return "Please select an Excel file ending in .xlsx.";
    case "file_too_large":
      return `This file is larger than ${formatResidentImportMaxFileSize()}. Choose a smaller Excel file.`;
    case "empty_file":
      return "This Excel file is empty.";
    case "too_many_sheets":
      return "This Excel file has too many sheets to process.";
    case "too_many_rows":
      return "This sheet has too many rows to process.";
    case "too_many_columns":
      return "This sheet has too many columns to process.";
    case "empty_workbook":
      return "This Excel file has no usable sheets.";
    case "missing_header_row":
      return "The selected sheet has no column headers.";
    case "sheet_unavailable":
      return "The selected sheet cannot be used.";
    case "corrupt_workbook":
      return "This Excel file could not be read. Save it again as .xlsx and try once more.";
  }
}

function fail(
  code: Parameters<typeof getResidentImportAdminMessage>[0],
): WorkbookParseOutcome {
  return { ok: false, code, message: getResidentImportAdminMessage(code) };
}

function isHiddenSheet(workbook: XLSX.WorkBook, sheetName: string): boolean {
  const meta = workbook.Workbook?.Sheets?.find((sheet) => sheet.name === sheetName);
  return meta?.Hidden === 1 || meta?.Hidden === 2;
}

function cellIsOccupied(cell: XLSX.CellObject | undefined): boolean {
  if (!cell) {
    return false;
  }
  if (cell.f) {
    return true;
  }
  if (cell.t === "z") {
    return false;
  }
  return cell.v !== undefined && cell.v !== null && cell.v !== "";
}

function looksLikeDateFormat(numberFormat: string | null): boolean {
  if (!numberFormat) {
    return false;
  }
  const format = numberFormat.toLowerCase();
  return format.includes("d") && (format.includes("m") || format.includes("y"));
}

function excelSerialToIsoDate(serial: number): string {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 24 * 60 * 60 * 1000;
  const date = new Date(utc);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateValue(value: Date): string {
  // SheetJS Date objects are timezone-shifted; recover the Excel serial first.
  const serial = value.getTime() / 86_400_000 + 25569;
  if (!Number.isFinite(serial)) {
    return value.toString();
  }
  return excelSerialToIsoDate(serial);
}

function readRawCell(
  worksheet: XLSX.WorkSheet,
  row: number,
  column: number,
): WorkbookRawCell | null {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const cell = worksheet[address] as XLSX.CellObject | undefined;
  if (!cell || (!cellIsOccupied(cell) && !cell.f)) {
    return null;
  }

  const numberFormat = typeof cell.z === "string" ? cell.z : null;
  const formula = typeof cell.f === "string" ? cell.f : null;
  let kind: WorkbookCellKind = "string";
  let value: string | number | boolean | null = null;

  if (formula) {
    kind = "formula";
  } else if (cell.t === "d" || cell.v instanceof Date) {
    kind = "date";
  } else if (cell.t === "b") {
    kind = "boolean";
  } else if (cell.t === "e") {
    kind = "error";
  } else if (cell.t === "n") {
    kind = looksLikeDateFormat(numberFormat) ? "date" : "number";
  } else {
    kind = "string";
  }

  if (cell.v instanceof Date) {
    value = formatDateValue(cell.v);
  } else if (kind === "date" && typeof cell.v === "number") {
    value = excelSerialToIsoDate(cell.v);
  } else if (typeof cell.v === "boolean" || typeof cell.v === "number") {
    value = cell.v;
  } else if (cell.v == null) {
    value = null;
  } else {
    value = String(cell.v);
  }

  return {
    address,
    kind,
    value,
    formula,
    numberFormat,
  };
}

function displayForCell(cell: WorkbookRawCell | null): string {
  if (!cell || cell.value == null) {
    return "";
  }
  if (typeof cell.value === "boolean") {
    return cell.value ? "TRUE" : "FALSE";
  }
  return String(cell.value);
}

function findHeaderRow(
  worksheet: XLSX.WorkSheet,
  range: XLSX.Range,
): number | null {
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[address] as XLSX.CellObject | undefined;
      if (cellIsOccupied(cell)) {
        return row;
      }
    }
  }
  return null;
}

function lastOccupiedColumn(
  worksheet: XLSX.WorkSheet,
  row: number,
  start: number,
  end: number,
): number {
  for (let column = end; column >= start; column -= 1) {
    const address = XLSX.utils.encode_cell({ r: row, c: column });
    const cell = worksheet[address] as XLSX.CellObject | undefined;
    if (cellIsOccupied(cell)) {
      return column;
    }
  }
  return start - 1;
}

function headerText(
  worksheet: XLSX.WorkSheet,
  row: number,
  column: number,
): string {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const cell = worksheet[address] as XLSX.CellObject | undefined;
  if (!cell || cell.v == null) {
    return "";
  }
  return String(cell.v);
}

export function parseResidentImportWorkbook(
  request: WorkbookParseRequest,
): WorkbookParseOutcome {
  const fileName = request.fileName.trim();
  const bytes = request.bytes;

  if (!isResidentImportXlsxFileName(fileName)) {
    return fail("unsupported_extension");
  }

  if (bytes.byteLength === 0) {
    return fail("empty_file");
  }

  if (bytes.byteLength > RESIDENT_IMPORT_LIMITS.maxFileBytes) {
    return fail("file_too_large");
  }

  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return fail("corrupt_workbook");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      // Keep Excel date serials as numbers. cellDates Date objects shift
      // calendar days in IST/other positive offsets.
      cellDates: false,
      cellNF: true,
      raw: true,
    });
  } catch {
    return fail("corrupt_workbook");
  }

  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) {
    return fail("empty_workbook");
  }

  if (sheetNames.length > RESIDENT_IMPORT_LIMITS.maxSheetCount) {
    return fail("too_many_sheets");
  }

  const hiddenSheetNames = sheetNames.filter((name) =>
    isHiddenSheet(workbook, name),
  );
  const visibleSheetNames = sheetNames.filter(
    (name) => !isHiddenSheet(workbook, name),
  );

  if (visibleSheetNames.length === 0) {
    return fail("empty_workbook");
  }

  let selectedSheet = request.selectedSheet?.trim() || "";
  if (selectedSheet) {
    if (
      !sheetNames.includes(selectedSheet) ||
      hiddenSheetNames.includes(selectedSheet)
    ) {
      return fail("sheet_unavailable");
    }
  } else {
    selectedSheet =
      visibleSheetNames.find((name) => {
        const candidate = workbook.Sheets[name];
        const candidateRef = candidate?.["!ref"];
        if (!candidate || !candidateRef) {
          return false;
        }
        return (
          findHeaderRow(candidate, XLSX.utils.decode_range(candidateRef)) != null
        );
      }) ?? "";
    if (!selectedSheet) {
      return fail("missing_header_row");
    }
  }

  const worksheet = workbook.Sheets[selectedSheet];
  if (!worksheet) {
    return fail("corrupt_workbook");
  }

  const ref = worksheet["!ref"];
  if (!ref) {
    return fail("missing_header_row");
  }

  const range = XLSX.utils.decode_range(ref);
  const headerRow = findHeaderRow(worksheet, range);
  if (headerRow == null) {
    return fail("missing_header_row");
  }

  const headerLastColumn = lastOccupiedColumn(
    worksheet,
    headerRow,
    range.s.c,
    range.e.c,
  );
  if (headerLastColumn < range.s.c) {
    return fail("missing_header_row");
  }

  const columnCount = headerLastColumn - range.s.c + 1;
  if (columnCount > RESIDENT_IMPORT_LIMITS.maxColumnCount) {
    return fail("too_many_columns");
  }

  const dataRowCount = range.e.r - headerRow;
  if (dataRowCount > RESIDENT_IMPORT_LIMITS.maxParserRowCount) {
    return fail("too_many_rows");
  }

  const columns: WorkbookDetectedColumn[] = [];
  const headers: string[] = [];
  for (let offset = 0; offset < columnCount; offset += 1) {
    const header = headerText(worksheet, headerRow, range.s.c + offset);
    columns.push({ index: offset, header });
    headers.push(header);
  }

  const headerCounts = new Map<string, number>();
  for (const header of headers) {
    if (!header) {
      continue;
    }
    headerCounts.set(header, (headerCounts.get(header) ?? 0) + 1);
  }
  const duplicateHeaders = [...headerCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([header]) => header);

  const warnings: WorkbookParseWarning[] = [];
  if (duplicateHeaders.length > 0) {
    warnings.push({
      code: "duplicate_header",
      message: DUPLICATE_HEADER_WARNING,
      sheetName: selectedSheet,
    });
  }
  if (hiddenSheetNames.length > 0) {
    warnings.push({
      code: "hidden_sheet",
      message:
        hiddenSheetNames.length === 1
          ? "1 hidden sheet was ignored."
          : `${hiddenSheetNames.length} hidden sheets were ignored.`,
    });
  }

  const rows: WorkbookParsedRow[] = [];
  let sawFormula = false;
  for (let excelRow = headerRow + 1; excelRow <= range.e.r; excelRow += 1) {
    const cells: Array<WorkbookRawCell | null> = [];
    const displayValues: string[] = [];
    for (let offset = 0; offset < columnCount; offset += 1) {
      const cell = readRawCell(worksheet, excelRow, range.s.c + offset);
      if (cell?.formula) {
        sawFormula = true;
      }
      cells.push(cell);
      displayValues.push(displayForCell(cell));
    }
    rows.push({
      rowNumber: excelRow + 1,
      cells,
      displayValues,
    });
  }

  if (sawFormula) {
    warnings.push({
      code: "formula_cell",
      message: "Some cells contain formulas. Cached values were used.",
      sheetName: selectedSheet,
    });
  }

  return {
    ok: true,
    result: {
      fileName,
      fileBytes: bytes.byteLength,
      sheetNames,
      hiddenSheetNames,
      visibleSheetNames,
      selectedSheet,
      columns,
      headers,
      duplicateHeaders,
      rows,
      totalDataRowCount: rows.length,
      warnings,
    },
  };
}

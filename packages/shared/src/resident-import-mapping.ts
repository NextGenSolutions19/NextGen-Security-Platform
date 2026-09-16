/**
 * M03-T03 resident import column mapping.
 *
 * Parse reads a workbook faithfully.
 * Mapping decides what columns mean.
 * Validation (later) decides whether mapped row data is valid.
 *
 * Mapping is local/client-side in Phase 3A. Snapshots are serializable so
 * they can later be stored on resident_import_jobs.mapping_snapshot.
 */

import type { SocietyResidentFieldType } from "./resident-import-foundation";
import type { WorkbookParseResult } from "./resident-import-parse";

export const RESIDENT_IMPORT_MAPPING_SNAPSHOT_VERSION = 1 as const;

export const RESIDENT_IMPORT_MAPPING_TARGETS = [
  "IGNORE",
  "BUILDING",
  "WING",
  "FLAT_NUMBER",
  "RESIDENT_NAME",
  "RESIDENT_TYPE",
  "PRIMARY_MOBILE",
  "ADDITIONAL_MOBILE",
  "CUSTOM_FIELD",
] as const;

export type ResidentImportMappingTarget =
  (typeof RESIDENT_IMPORT_MAPPING_TARGETS)[number];

export const UNIQUE_RESIDENT_IMPORT_MAPPING_TARGETS = [
  "BUILDING",
  "WING",
  "FLAT_NUMBER",
  "RESIDENT_NAME",
  "RESIDENT_TYPE",
  "PRIMARY_MOBILE",
] as const;

export type UniqueResidentImportMappingTarget =
  (typeof UNIQUE_RESIDENT_IMPORT_MAPPING_TARGETS)[number];

export const REPEATABLE_RESIDENT_IMPORT_MAPPING_TARGETS = [
  "IGNORE",
  "ADDITIONAL_MOBILE",
  "CUSTOM_FIELD",
] as const;

export const REQUIRED_RESIDENT_IMPORT_MAPPING_TARGETS = [
  "FLAT_NUMBER",
  "RESIDENT_NAME",
] as const;

export const OPTIONAL_SYSTEM_RESIDENT_IMPORT_MAPPING_TARGETS = [
  "BUILDING",
  "WING",
  "RESIDENT_TYPE",
  "PRIMARY_MOBILE",
] as const;

export const RESIDENT_IMPORT_MAPPING_TARGET_LABELS: Record<
  ResidentImportMappingTarget,
  string
> = {
  IGNORE: "Ignore Column",
  BUILDING: "Building",
  WING: "Wing",
  FLAT_NUMBER: "Flat Number",
  RESIDENT_NAME: "Resident Name",
  RESIDENT_TYPE: "Resident Type",
  PRIMARY_MOBILE: "Primary Mobile",
  ADDITIONAL_MOBILE: "Additional Mobile",
  CUSTOM_FIELD: "Custom Field",
};

export const RESIDENT_IMPORT_CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "phone",
  "date",
  "dropdown",
  "yes_no",
  "multi_select",
] as const satisfies readonly SocietyResidentFieldType[];

export const RESIDENT_IMPORT_CUSTOM_FIELD_TYPE_LABELS: Record<
  SocietyResidentFieldType,
  string
> = {
  text: "Text",
  number: "Number",
  phone: "Phone",
  date: "Date",
  dropdown: "Dropdown",
  yes_no: "Yes / No",
  multi_select: "Multi-select",
};

export const RESIDENT_TYPE_MAPPING_NOTE =
  "Resident Type is a controlled field (Owner, Tenant, Family Member, Other). Values will be reviewed during validation and will not be rewritten here.";

export const DUPLICATE_UNIQUE_MAPPING_MESSAGE =
  "This field is already mapped from another column. Unmap that column first.";

export const VALIDATION_STEP_UNAVAILABLE_MESSAGE =
  "Validation will be available in the next step.";

const ADDITIONAL_MOBILE_ALIASES = new Set([
  "mobile 2",
  "mobile no 2",
  "mobile number 2",
  "phone 2",
  "phone no 2",
  "phone number 2",
  "alternate mobile",
  "alternative mobile",
  "secondary mobile",
  "additional mobile",
  "alternate contact",
  "alternative contact",
  "secondary contact",
]);

const PRIMARY_MOBILE_ALIASES = new Set([
  "mobile",
  "mobile 1",
  "mobile no",
  "mobile no 1",
  "mobile number",
  "mobile number 1",
  "phone",
  "phone 1",
  "phone no",
  "phone number",
  "contact",
  "contact 1",
  "contact number",
  "contact no",
]);

const FLAT_NUMBER_ALIASES = new Set([
  "flat no",
  "flat number",
  "flat",
  "unit",
  "unit no",
  "unit number",
  "apartment no",
  "apartment number",
]);

const RESIDENT_NAME_ALIASES = new Set([
  "resident name",
  "member name",
  "member",
  "owner name",
  "tenant name",
  "name",
]);

const RESIDENT_TYPE_ALIASES = new Set([
  "resident type",
  "occupancy type",
  "member type",
]);

const BUILDING_ALIASES = new Set([
  "building",
  "building name",
  "tower",
  "tower name",
  "block",
]);

const WING_ALIASES = new Set(["wing", "wing name"]);

const IGNORE_ALIASES = new Set([
  "qa case",
  "test case",
  "serial no",
  "serial number",
  "sr no",
  "s no",
  "sl no",
]);

export type ResidentImportMappingSource = "suggestion" | "admin";

export type ResidentImportSuggestionConfidence = "safe" | "none";

export type ResidentImportCustomFieldConfig = {
  name: string;
  fieldType: SocietyResidentFieldType;
  required: boolean;
  options: string[];
};

export type ResidentImportColumnMapping = {
  columnIndex: number;
  header: string;
  excelAddress: string;
  target: ResidentImportMappingTarget;
  suggestedTarget: ResidentImportMappingTarget;
  suggestionConfidence: ResidentImportSuggestionConfidence;
  source: ResidentImportMappingSource;
  customField: ResidentImportCustomFieldConfig | null;
};

export type ResidentImportMappingSnapshot = {
  version: typeof RESIDENT_IMPORT_MAPPING_SNAPSHOT_VERSION;
  fileName: string;
  sheetName: string;
  columns: ResidentImportColumnMapping[];
};

export type ResidentImportMappingApplyResult =
  | { ok: true; snapshot: ResidentImportMappingSnapshot }
  | {
      ok: false;
      code: "duplicate_unique_target";
      message: string;
      snapshot: ResidentImportMappingSnapshot;
    };

export type ResidentImportRequiredMappingStatus = {
  target: (typeof REQUIRED_RESIDENT_IMPORT_MAPPING_TARGETS)[number];
  label: string;
  mapped: boolean;
};

export type ResidentImportMappingSummary = {
  columnCount: number;
  requiredSystemFieldCount: number;
  optionalSystemFieldCount: number;
  customFieldCount: number;
  ignoredColumnCount: number;
  additionalMobileCount: number;
  required: ResidentImportRequiredMappingStatus[];
  requiredComplete: boolean;
};

export type ResidentImportMappingSourceWorkbook = Pick<
  WorkbookParseResult,
  "fileName" | "selectedSheet" | "columns" | "rows"
>;

export function excelColumnLetter(columnIndex: number): string {
  if (columnIndex < 0 || !Number.isInteger(columnIndex)) {
    return "";
  }

  let position = columnIndex + 1;
  let letter = "";
  while (position > 0) {
    const remainder = (position - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    position = Math.floor((position - 1) / 26);
  }
  return letter;
}

export function formatResidentImportColumnLabel(
  header: string,
  excelAddress: string,
  options?: { duplicate?: boolean },
): string {
  const trimmed = header.trim();
  if (!trimmed) {
    return `Column ${excelAddress}`;
  }
  if (options?.duplicate) {
    return `${header} (Column ${excelAddress})`;
  }
  return header;
}

export function isUniqueResidentImportMappingTarget(
  target: ResidentImportMappingTarget,
): target is UniqueResidentImportMappingTarget {
  return (UNIQUE_RESIDENT_IMPORT_MAPPING_TARGETS as readonly string[]).includes(
    target,
  );
}

export function isSocietyResidentFieldType(
  value: string,
): value is SocietyResidentFieldType {
  return (RESIDENT_IMPORT_CUSTOM_FIELD_TYPES as readonly string[]).includes(
    value,
  );
}

export function normalizeResidentImportHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[._/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWeakHeader(normalized: string): boolean {
  return normalized.length === 0 || !/[a-z0-9]/.test(normalized);
}

export function suggestResidentImportMappingTarget(header: string): {
  target: ResidentImportMappingTarget;
  confidence: ResidentImportSuggestionConfidence;
} {
  const normalized = normalizeResidentImportHeader(header);

  if (isWeakHeader(normalized) || IGNORE_ALIASES.has(normalized)) {
    return { target: "IGNORE", confidence: "none" };
  }

  if (ADDITIONAL_MOBILE_ALIASES.has(normalized)) {
    return { target: "ADDITIONAL_MOBILE", confidence: "safe" };
  }
  if (PRIMARY_MOBILE_ALIASES.has(normalized)) {
    return { target: "PRIMARY_MOBILE", confidence: "safe" };
  }
  if (FLAT_NUMBER_ALIASES.has(normalized)) {
    return { target: "FLAT_NUMBER", confidence: "safe" };
  }
  if (RESIDENT_NAME_ALIASES.has(normalized)) {
    return { target: "RESIDENT_NAME", confidence: "safe" };
  }
  if (RESIDENT_TYPE_ALIASES.has(normalized)) {
    return { target: "RESIDENT_TYPE", confidence: "safe" };
  }
  if (BUILDING_ALIASES.has(normalized)) {
    return { target: "BUILDING", confidence: "safe" };
  }
  if (WING_ALIASES.has(normalized)) {
    return { target: "WING", confidence: "safe" };
  }

  return { target: "CUSTOM_FIELD", confidence: "safe" };
}

export function createDefaultCustomFieldConfig(
  header: string,
  excelAddress: string,
): ResidentImportCustomFieldConfig {
  const name = header.trim() || `Column ${excelAddress}`;
  return {
    name,
    fieldType: "text",
    required: false,
    options: [],
  };
}

function customFieldForTarget(
  target: ResidentImportMappingTarget,
  header: string,
  excelAddress: string,
): ResidentImportCustomFieldConfig | null {
  return target === "CUSTOM_FIELD"
    ? createDefaultCustomFieldConfig(header, excelAddress)
    : null;
}

function mappingForColumn(
  columnIndex: number,
  header: string,
): ResidentImportColumnMapping {
  const excelAddress = excelColumnLetter(columnIndex);
  const suggestion = suggestResidentImportMappingTarget(header);
  return {
    columnIndex,
    header,
    excelAddress,
    target: suggestion.target,
    suggestedTarget: suggestion.target,
    suggestionConfidence: suggestion.confidence,
    source: "suggestion",
    customField: customFieldForTarget(suggestion.target, header, excelAddress),
  };
}

export function createResidentImportMappingSnapshot(
  workbook: ResidentImportMappingSourceWorkbook,
): ResidentImportMappingSnapshot {
  const usedUniqueTargets = new Set<UniqueResidentImportMappingTarget>();
  const columns = workbook.columns.map((column) => {
    const mapping = mappingForColumn(column.index, column.header);
    if (
      isUniqueResidentImportMappingTarget(mapping.target) &&
      usedUniqueTargets.has(mapping.target)
    ) {
      return {
        ...mapping,
        target: "IGNORE" as const,
        customField: null,
      };
    }
    if (isUniqueResidentImportMappingTarget(mapping.target)) {
      usedUniqueTargets.add(mapping.target);
    }
    return mapping;
  });

  return {
    version: RESIDENT_IMPORT_MAPPING_SNAPSHOT_VERSION,
    fileName: workbook.fileName,
    sheetName: workbook.selectedSheet,
    columns,
  };
}

export function resetResidentImportMappingSnapshot(
  workbook: ResidentImportMappingSourceWorkbook,
): ResidentImportMappingSnapshot {
  return createResidentImportMappingSnapshot(workbook);
}

export function serializeResidentImportMappingSnapshot(
  snapshot: ResidentImportMappingSnapshot,
): string {
  return JSON.stringify(snapshot);
}

export function parseResidentImportMappingSnapshot(
  raw: string,
): ResidentImportMappingSnapshot {
  const parsed = JSON.parse(raw) as ResidentImportMappingSnapshot;
  if (
    parsed?.version !== RESIDENT_IMPORT_MAPPING_SNAPSHOT_VERSION ||
    !Array.isArray(parsed.columns)
  ) {
    throw new Error("Invalid mapping snapshot");
  }
  return parsed;
}

function uniqueTargetOwner(
  snapshot: ResidentImportMappingSnapshot,
  target: UniqueResidentImportMappingTarget,
  exceptColumnIndex?: number,
): ResidentImportColumnMapping | undefined {
  return snapshot.columns.find(
    (column) =>
      column.target === target && column.columnIndex !== exceptColumnIndex,
  );
}

export function applyResidentImportColumnTarget(
  snapshot: ResidentImportMappingSnapshot,
  columnIndex: number,
  target: ResidentImportMappingTarget,
): ResidentImportMappingApplyResult {
  const current = snapshot.columns.find(
    (column) => column.columnIndex === columnIndex,
  );
  if (!current) {
    return { ok: true, snapshot };
  }

  if (current.target === target) {
    return { ok: true, snapshot };
  }

  if (isUniqueResidentImportMappingTarget(target)) {
    const owner = uniqueTargetOwner(snapshot, target, columnIndex);
    if (owner) {
      const ownerLabel = formatResidentImportColumnLabel(
        owner.header,
        owner.excelAddress,
        { duplicate: true },
      );
      return {
        ok: false,
        code: "duplicate_unique_target",
        message: `${RESIDENT_IMPORT_MAPPING_TARGET_LABELS[target]} is already mapped from ${ownerLabel}. Unmap that column first.`,
        snapshot,
      };
    }
  }

  const nextColumns = snapshot.columns.map((column) => {
    if (column.columnIndex !== columnIndex) {
      return column;
    }
    return {
      ...column,
      target,
      source: "admin" as const,
      customField:
        target === "CUSTOM_FIELD"
          ? column.customField ??
            createDefaultCustomFieldConfig(column.header, column.excelAddress)
          : null,
    };
  });

  return {
    ok: true,
    snapshot: {
      ...snapshot,
      columns: nextColumns,
    },
  };
}

export function updateResidentImportCustomField(
  snapshot: ResidentImportMappingSnapshot,
  columnIndex: number,
  patch: Partial<ResidentImportCustomFieldConfig>,
): ResidentImportMappingSnapshot {
  return {
    ...snapshot,
    columns: snapshot.columns.map((column) => {
      if (column.columnIndex !== columnIndex || column.target !== "CUSTOM_FIELD") {
        return column;
      }
      const current =
        column.customField ??
        createDefaultCustomFieldConfig(column.header, column.excelAddress);
      const fieldType = patch.fieldType ?? current.fieldType;
      const keepOptions =
        fieldType === "dropdown" || fieldType === "multi_select";
      return {
        ...column,
        source: "admin" as const,
        customField: {
          name: patch.name ?? current.name,
          fieldType,
          required: patch.required ?? current.required,
          options: keepOptions ? (patch.options ?? current.options) : [],
        },
      };
    }),
  };
}

export function sampleResidentImportColumnValues(
  workbook: ResidentImportMappingSourceWorkbook,
  columnIndex: number,
  limit = 3,
): string[] {
  const samples: string[] = [];
  const seen = new Set<string>();
  for (const row of workbook.rows) {
    const value = row.displayValues[columnIndex] ?? "";
    if (value.trim() === "") {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    samples.push(value);
    if (samples.length >= limit) {
      break;
    }
  }
  return samples;
}

export function suggestCustomFieldOptionsFromValues(
  values: readonly string[],
  limit = 64,
): string[] {
  const options: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value.trim() === "") {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    options.push(value);
    if (options.length >= limit) {
      break;
    }
  }
  return options;
}

export function suggestCustomFieldOptionsFromWorkbook(
  workbook: ResidentImportMappingSourceWorkbook,
  columnIndex: number,
): string[] {
  return suggestCustomFieldOptionsFromValues(
    workbook.rows.map((row) => row.displayValues[columnIndex] ?? ""),
  );
}

export function mergeCustomFieldOptions(
  current: readonly string[],
  suggested: readonly string[],
): string[] {
  return suggestCustomFieldOptionsFromValues([...current, ...suggested]);
}

export type AddCustomFieldOptionResult =
  | { ok: true; options: string[]; added: string }
  | { ok: false; reason: "empty" | "duplicate" };

export function normalizeCustomFieldOptionInput(draft: string): string {
  return draft.trim();
}

export function canAddCustomFieldOption(
  options: readonly string[],
  draft: string,
): boolean {
  return addCustomFieldOption(options, draft).ok;
}

export function addCustomFieldOption(
  options: readonly string[],
  draft: string,
): AddCustomFieldOptionResult {
  const added = normalizeCustomFieldOptionInput(draft);
  if (!added) {
    return { ok: false, reason: "empty" };
  }
  if (options.some((option) => option.trim() === added)) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, options: [...options, added], added };
}

export function removeCustomFieldOption(
  options: readonly string[],
  option: string,
): string[] {
  return options.filter((item) => item !== option);
}

export function summarizeResidentImportMapping(
  snapshot: ResidentImportMappingSnapshot,
): ResidentImportMappingSummary {
  let requiredSystemFieldCount = 0;
  let optionalSystemFieldCount = 0;
  let customFieldCount = 0;
  let ignoredColumnCount = 0;
  let additionalMobileCount = 0;

  for (const column of snapshot.columns) {
    if (column.target === "IGNORE") {
      ignoredColumnCount += 1;
    } else if (column.target === "CUSTOM_FIELD") {
      customFieldCount += 1;
    } else if (column.target === "ADDITIONAL_MOBILE") {
      additionalMobileCount += 1;
    } else if (
      (REQUIRED_RESIDENT_IMPORT_MAPPING_TARGETS as readonly string[]).includes(
        column.target,
      )
    ) {
      requiredSystemFieldCount += 1;
    } else {
      optionalSystemFieldCount += 1;
    }
  }

  const required = REQUIRED_RESIDENT_IMPORT_MAPPING_TARGETS.map((target) => ({
    target,
    label: RESIDENT_IMPORT_MAPPING_TARGET_LABELS[target],
    mapped: snapshot.columns.some((column) => column.target === target),
  }));

  return {
    columnCount: snapshot.columns.length,
    requiredSystemFieldCount,
    optionalSystemFieldCount,
    customFieldCount,
    ignoredColumnCount,
    additionalMobileCount,
    required,
    requiredComplete: required.every((item) => item.mapped),
  };
}

export function duplicateResidentImportHeaders(
  snapshot: ResidentImportMappingSnapshot,
): Set<string> {
  const counts = new Map<string, number>();
  for (const column of snapshot.columns) {
    if (!column.header) {
      continue;
    }
    counts.set(column.header, (counts.get(column.header) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([header]) => header),
  );
}

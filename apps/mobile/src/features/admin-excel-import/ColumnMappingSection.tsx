import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  RESIDENT_IMPORT_CUSTOM_FIELD_TYPE_LABELS,
  RESIDENT_IMPORT_CUSTOM_FIELD_TYPES,
  RESIDENT_IMPORT_MAPPING_TARGETS,
  RESIDENT_IMPORT_MAPPING_TARGET_LABELS,
  RESIDENT_TYPE_MAPPING_NOTE,
  applyResidentImportColumnTarget,
  addCustomFieldOption,
  canAddCustomFieldOption,
  duplicateResidentImportHeaders,
  formatResidentImportColumnLabel,
  mergeCustomFieldOptions,
  removeCustomFieldOption,
  sampleResidentImportColumnValues,
  suggestCustomFieldOptionsFromWorkbook,
  summarizeResidentImportMapping,
  updateResidentImportCustomField,
  type ResidentImportColumnMapping,
  type ResidentImportMappingSnapshot,
  type ResidentImportMappingTarget,
  type WorkbookParseResult,
} from "@nextgen/shared";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

const REQUIRED_YES_NO = ["no", "yes"] as const;

type ColumnMappingSectionProps = {
  workbook: WorkbookParseResult;
  snapshot: ResidentImportMappingSnapshot;
  onSnapshotChange: (snapshot: ResidentImportMappingSnapshot) => void;
  onResetSuggestions: () => void;
  onContinueToValidation: () => void;
};

export function ColumnMappingSection({
  workbook,
  snapshot,
  onSnapshotChange,
  onResetSuggestions,
  onContinueToValidation,
}: ColumnMappingSectionProps) {
  const [mappingError, setMappingError] = useState<string | null>(null);
  const summary = useMemo(
    () => summarizeResidentImportMapping(snapshot),
    [snapshot],
  );
  const duplicateHeaders = useMemo(
    () => duplicateResidentImportHeaders(snapshot),
    [snapshot],
  );

  const handleTargetChange = (
    columnIndex: number,
    target: ResidentImportMappingTarget,
  ) => {
    const outcome = applyResidentImportColumnTarget(snapshot, columnIndex, target);
    if (!outcome.ok) {
      setMappingError(outcome.message);
      return;
    }
    setMappingError(null);
    onSnapshotChange(outcome.snapshot);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Column Mapping</Text>
      <Text style={styles.helper}>
        Choose what each Excel column means. Suggestions can be changed. No
        residents are imported yet.
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>
          {summary.columnCount} Excel columns detected
        </Text>
        <Text style={styles.helper}>
          Mapped: {summary.requiredSystemFieldCount} required system field
          {summary.requiredSystemFieldCount === 1 ? "" : "s"}
          {", "}
          {summary.optionalSystemFieldCount} optional system field
          {summary.optionalSystemFieldCount === 1 ? "" : "s"}
          {", "}
          {summary.customFieldCount} custom field
          {summary.customFieldCount === 1 ? "" : "s"}
          {", "}
          {summary.additionalMobileCount} additional mobile
          {summary.additionalMobileCount === 1 ? "" : "s"}
          {", "}
          {summary.ignoredColumnCount} ignored column
          {summary.ignoredColumnCount === 1 ? "" : "s"}
        </Text>
        <Text style={styles.summaryTitle}>Required mappings</Text>
        {summary.required.map((item) => (
          <Text key={item.target} style={styles.helper}>
            {item.mapped ? "✓" : "○"} {item.label}
          </Text>
        ))}
      </View>

      {mappingError ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>{mappingError}</Text>
        </View>
      ) : null}

      {snapshot.columns.map((column) => (
        <ColumnMappingCard
          key={column.columnIndex}
          column={column}
          workbook={workbook}
          duplicate={duplicateHeaders.has(column.header)}
          onTargetChange={(target) =>
            handleTargetChange(column.columnIndex, target)
          }
          onCustomFieldPatch={(patch) => {
            setMappingError(null);
            onSnapshotChange(
              updateResidentImportCustomField(
                snapshot,
                column.columnIndex,
                patch,
              ),
            );
          }}
        />
      ))}

      <Button
        label="Reset mapping suggestions"
        variant="secondary"
        onPress={() => {
          setMappingError(null);
          onResetSuggestions();
        }}
      />

      <View style={styles.validationBox}>
        <Button
          label="Continue to Validation"
          disabled={!summary.requiredComplete}
          onPress={onContinueToValidation}
        />
        {!summary.requiredComplete ? (
          <Text style={styles.helper}>
            Map Flat Number and Resident Name before validation can start.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ColumnMappingCard({
  column,
  workbook,
  duplicate,
  onTargetChange,
  onCustomFieldPatch,
}: {
  column: ResidentImportColumnMapping;
  workbook: WorkbookParseResult;
  duplicate: boolean;
  onTargetChange: (target: ResidentImportMappingTarget) => void;
  onCustomFieldPatch: (
    patch: Parameters<typeof updateResidentImportCustomField>[2],
  ) => void;
}) {
  const [optionDraft, setOptionDraft] = useState("");
  const samples = sampleResidentImportColumnValues(
    workbook,
    column.columnIndex,
    3,
  );
  const label = formatResidentImportColumnLabel(
    column.header,
    column.excelAddress,
    { duplicate },
  );
  const showOptions =
    column.target === "CUSTOM_FIELD" &&
    (column.customField?.fieldType === "dropdown" ||
      column.customField?.fieldType === "multi_select");

  const addOption = () => {
    const outcome = addCustomFieldOption(
      column.customField?.options ?? [],
      optionDraft,
    );
    if (!outcome.ok) {
      return;
    }
    onCustomFieldPatch({ options: outcome.options });
    setOptionDraft("");
  };

  const canAdd = canAddCustomFieldOption(
    column.customField?.options ?? [],
    optionDraft,
  );

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Excel Column: {label}</Text>
      <Text style={styles.helper}>Column {column.excelAddress}</Text>
      <Text style={styles.helper}>
        Sample values: {samples.length > 0 ? samples.join(" · ") : "(none yet)"}
      </Text>

      <SelectField
        label="Map to"
        value={column.target}
        options={RESIDENT_IMPORT_MAPPING_TARGETS}
        getOptionLabel={(target) => RESIDENT_IMPORT_MAPPING_TARGET_LABELS[target]}
        onChange={onTargetChange}
      />

      {column.target === "RESIDENT_TYPE" ? (
        <Text style={styles.helper}>{RESIDENT_TYPE_MAPPING_NOTE}</Text>
      ) : null}

      {column.target === "CUSTOM_FIELD" && column.customField ? (
        <View style={styles.customBlock}>
          <TextField
            label="Custom Field Name"
            value={column.customField.name}
            onChangeText={(name) => onCustomFieldPatch({ name })}
          />
          <SelectField
            label="Field Type"
            value={column.customField.fieldType}
            options={RESIDENT_IMPORT_CUSTOM_FIELD_TYPES}
            getOptionLabel={(type) => RESIDENT_IMPORT_CUSTOM_FIELD_TYPE_LABELS[type]}
            onChange={(fieldType) => onCustomFieldPatch({ fieldType })}
          />
          <SelectField
            label="Required"
            value={column.customField.required ? "yes" : "no"}
            options={REQUIRED_YES_NO}
            getOptionLabel={(value) => (value === "yes" ? "Yes" : "No")}
            onChange={(value) =>
              onCustomFieldPatch({ required: value === "yes" })
            }
          />

          {showOptions ? (
            <View style={styles.optionsBlock}>
              <Text style={styles.summaryTitle}>Options</Text>
              {(column.customField.options ?? []).map((option) => (
                <View key={option} style={styles.optionRow}>
                  <Text style={styles.optionText}>{option}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove option ${option}`}
                    onPress={() =>
                      onCustomFieldPatch({
                        options: removeCustomFieldOption(
                          column.customField?.options ?? [],
                          option,
                        ),
                      })
                    }
                  >
                    <Text style={styles.removeOption}>Remove</Text>
                  </Pressable>
                </View>
              ))}
              <TextField
                accessibilityLabel="Enter new option"
                placeholder="Enter new option..."
                value={optionDraft}
                onChangeText={setOptionDraft}
                onSubmitEditing={addOption}
                blurOnSubmit
                returnKeyType="done"
              />
              <Button
                label="Add option"
                variant="secondary"
                disabled={!canAdd}
                onPress={addOption}
              />
              <Button
                label="Suggest options from Excel"
                variant="secondary"
                onPress={() =>
                  onCustomFieldPatch({
                    options: mergeCustomFieldOptions(
                      column.customField?.options ?? [],
                      suggestCustomFieldOptionsFromWorkbook(
                        workbook,
                        column.columnIndex,
                      ),
                    ),
                  })
                }
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.subtitle,
  },
  helper: {
    ...typography.caption,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryTitle: {
    ...typography.label,
  },
  warningBanner: {
    backgroundColor: "#FFFBEB",
    borderColor: "#D97706",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warningText: {
    color: colors.text,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.subtitle,
    fontSize: 15,
  },
  customBlock: {
    gap: spacing.md,
  },
  optionsBlock: {
    gap: spacing.sm,
    position: "relative",
    zIndex: 1,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  optionText: {
    ...typography.body,
    flex: 1,
  },
  removeOption: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  validationBox: {
    gap: spacing.sm,
  },
});

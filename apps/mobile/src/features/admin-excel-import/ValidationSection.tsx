import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  classifyResidentImportDecisionGate,
  findResidentImportRowDecision,
  formatResidentImportDecision,
  formatResidentImportValidationStatus,
  filterResidentImportValidatedRows,
  RESIDENT_IMPORT_VALIDATION_FILTERS,
  type ResidentImportBulkAction,
  type ResidentImportDecision,
  type ResidentImportDecisionSnapshot,
  type ResidentImportValidatedRow,
  type ResidentImportValidationFilter,
  type ResidentImportValidationSuccess,
} from "@nextgen/shared";
import { Button } from "@/components/ui/Button";
import { colors, radius, spacing, typography } from "@/constants/theme";

const FILTER_LABELS: Record<ResidentImportValidationFilter, string> = {
  all: "All",
  valid: "Valid",
  conflicts: "Conflicts",
  duplicates: "Duplicates",
  invalid: "Invalid",
};

type ValidationSectionProps = {
  result: ResidentImportValidationSuccess;
  decisions: ResidentImportDecisionSnapshot;
  canReview: boolean;
  onSetDecision: (rowNumber: number, decision: ResidentImportDecision) => void;
  onBulkAction: (action: ResidentImportBulkAction) => void;
  onReviewImportPlan: () => void;
};

export function ValidationSection({
  result,
  decisions,
  canReview,
  onSetDecision,
  onBulkAction,
  onReviewImportPlan,
}: ValidationSectionProps) {
  const [filter, setFilter] = useState<ResidentImportValidationFilter>("all");
  const rows = useMemo(
    () => filterResidentImportValidatedRows(result.rows, filter),
    [filter, result.rows],
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Validation</Text>
      <Text style={styles.helper}>
        Rows are classified locally. Choose which rows to import. No residents
        are written yet.
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Validation summary</Text>
        <Text style={styles.body}>Total Rows: {result.summary.totalRows}</Text>
        <Text style={styles.body}>Valid New: {result.summary.validNew}</Text>
        <Text style={styles.body}>
          Possible Conflicts: {result.summary.possibleConflicts}
        </Text>
        <Text style={styles.body}>Duplicates: {result.summary.duplicates}</Text>
        <Text style={styles.body}>Invalid: {result.summary.invalid}</Text>
      </View>

      <Text style={styles.sectionTitle}>Resolve Rows</Text>
      <Text style={styles.helper}>
        Valid rows default to Import New. Conflicts, duplicates, and invalid
        rows default to Skip. Backend-blocked flats cannot be overridden yet.
      </Text>

      <View style={styles.bulkRow}>
        <Button
          label="Import all Valid rows"
          variant="secondary"
          onPress={() => onBulkAction("IMPORT_ALL_VALID")}
        />
        <Button
          label="Skip all Valid rows"
          variant="secondary"
          onPress={() => onBulkAction("SKIP_ALL_VALID")}
        />
        <Button
          label="Skip all Conflicts"
          variant="secondary"
          onPress={() => onBulkAction("SKIP_ALL_CONFLICTS")}
        />
        <Button
          label="Reset decisions"
          variant="secondary"
          onPress={() => onBulkAction("RESET")}
        />
      </View>

      <View style={styles.filters}>
        {RESIDENT_IMPORT_VALIDATION_FILTERS.map((item) => {
          const selected = item === filter;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFilter(item)}
              style={[styles.filterChip, selected ? styles.filterChipSelected : null]}
            >
              <Text
                style={[
                  styles.filterLabel,
                  selected ? styles.filterLabelSelected : null,
                ]}
              >
                {FILTER_LABELS[item]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {rows.map((row) => (
        <ValidationRowCard
          key={row.rowNumber}
          row={row}
          decisions={decisions}
          onSetDecision={onSetDecision}
        />
      ))}

      {rows.length === 0 ? (
        <Text style={styles.helper}>No rows in this filter.</Text>
      ) : null}

      <View style={styles.reviewBox}>
        <Button
          label="Review Import Plan"
          disabled={!canReview}
          onPress={onReviewImportPlan}
        />
        <Text style={styles.helper}>
          Review the local import plan before any future database write.
        </Text>
      </View>
    </View>
  );
}

function ValidationRowCard({
  row,
  decisions,
  onSetDecision,
}: {
  row: ResidentImportValidatedRow;
  decisions: ResidentImportDecisionSnapshot;
  onSetDecision: (rowNumber: number, decision: ResidentImportDecision) => void;
}) {
  const issues = [...row.errors, ...row.warnings];
  const gate = classifyResidentImportDecisionGate(row);
  const decision = findResidentImportRowDecision(decisions, row.rowNumber);
  const statusStyle =
    row.status === "VALID_NEW"
      ? styles.statusValid
      : row.status === "INVALID"
        ? styles.statusInvalid
        : row.status === "INTRA_FILE_DUPLICATE"
          ? styles.statusDuplicate
          : gate.kind === "blocked_backend"
            ? styles.statusBlocked
            : styles.statusConflict;

  return (
    <View style={[styles.card, statusStyle]}>
      <Text style={styles.cardTitle}>Excel Row: {row.rowNumber}</Text>
      <Text style={styles.body}>
        Flat: {row.display.flatNumber.trim() ? row.display.flatNumber : "—"}
      </Text>
      <Text style={styles.body}>
        Resident: {row.display.residentName.trim() ? row.display.residentName : "—"}
      </Text>
      <Text style={styles.body}>
        Mobile: {row.display.primaryMobile.trim() ? row.display.primaryMobile : "—"}
      </Text>
      {row.display.building.trim() ? (
        <Text style={styles.body}>Building: {row.display.building}</Text>
      ) : null}
      <Text style={styles.statusText}>
        Status: {formatResidentImportValidationStatus(row.status)}
      </Text>
      {issues.map((issue, index) => (
        <Text key={`${issue.code}-${index}`} style={styles.issue}>
          {issue.message}
        </Text>
      ))}
      {row.relatedRowNumbers.length > 0 ? (
        <Text style={styles.helper}>
          Related Excel row{row.relatedRowNumbers.length === 1 ? "" : "s"}:{" "}
          {row.relatedRowNumbers.join(", ")}
        </Text>
      ) : null}

      <Text style={styles.statusText}>
        Decision:{" "}
        {decision
          ? formatResidentImportDecision(decision.decision, decision.isBlocked)
          : gate.decisionLabel}
      </Text>
      <Text style={styles.helper}>{gate.explanation}</Text>
      <DecisionActions
        row={row}
        current={decision?.decision ?? gate.defaultDecision}
        onSetDecision={onSetDecision}
      />
    </View>
  );
}

function DecisionActions({
  row,
  current,
  onSetDecision,
}: {
  row: ResidentImportValidatedRow;
  current: ResidentImportDecision;
  onSetDecision: (rowNumber: number, decision: ResidentImportDecision) => void;
}) {
  const gate = classifyResidentImportDecisionGate(row);

  if (gate.kind === "valid") {
    if (current === "IMPORT_NEW") {
      return (
        <Button
          label="Skip this row"
          variant="secondary"
          onPress={() => onSetDecision(row.rowNumber, "SKIP")}
        />
      );
    }
    return (
      <Button
        label="Import New"
        variant="secondary"
        onPress={() => onSetDecision(row.rowNumber, "IMPORT_NEW")}
      />
    );
  }

  if (gate.kind === "overridable_conflict") {
    return (
      <View style={styles.actionColumn}>
        <Button
          label="Import as Separate Resident"
          variant="secondary"
          disabled={current === "IMPORT_NEW_AS_SEPARATE"}
          onPress={() =>
            onSetDecision(row.rowNumber, "IMPORT_NEW_AS_SEPARATE")
          }
        />
        <Button
          label="Keep Skipped"
          variant="secondary"
          disabled={current === "SKIP"}
          onPress={() => onSetDecision(row.rowNumber, "SKIP")}
        />
      </View>
    );
  }

  return null;
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
  body: {
    ...typography.body,
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
  bulkRow: {
    gap: spacing.sm,
  },
  actionColumn: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  filterChipSelected: {
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
  },
  filterLabel: {
    ...typography.label,
  },
  filterLabelSelected: {
    color: colors.accent,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.subtitle,
    fontSize: 15,
  },
  statusText: {
    ...typography.label,
    marginTop: spacing.xs,
  },
  issue: {
    ...typography.caption,
    color: colors.text,
  },
  statusValid: {
    borderColor: colors.success,
  },
  statusInvalid: {
    borderColor: colors.error,
  },
  statusConflict: {
    borderColor: "#D97706",
  },
  statusDuplicate: {
    borderColor: colors.accent,
  },
  statusBlocked: {
    borderColor: "#7C2D12",
  },
  reviewBox: {
    gap: spacing.sm,
  },
});

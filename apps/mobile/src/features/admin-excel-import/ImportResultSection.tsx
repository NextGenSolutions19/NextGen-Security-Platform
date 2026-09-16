import { StyleSheet, Text, View } from "react-native";
import {
  BACK_TO_RESIDENT_MANAGEMENT_LABEL,
  IMPORT_ANOTHER_EXCEL_FILE_LABEL,
  type ResidentImportConfirmUiView,
} from "@nextgen/shared";
import { Button } from "@/components/ui/Button";
import { colors, radius, spacing, typography } from "@/constants/theme";

type ImportResultSectionProps = {
  result: ResidentImportConfirmUiView;
  onBackToResidentManagement: () => void;
  onImportAnotherFile: () => void;
};

export function ImportResultSection({
  result,
  onBackToResidentManagement,
  onImportAnotherFile,
}: ImportResultSectionProps) {
  const { summary } = result;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{summary.title}</Text>
      {summary.explanation ? (
        <Text style={styles.body}>{summary.explanation}</Text>
      ) : null}

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Submitted to import</Text>
        <Text style={styles.body}>Total Submitted: {summary.totalSubmitted}</Text>
        <Text style={styles.body}>
          Imported Successfully: {summary.importedSuccessfully}
        </Text>
        <Text style={styles.body}>Already Exists: {summary.alreadyExists}</Text>
        <Text style={styles.body}>Needs Review: {summary.needsReview}</Text>
        <Text style={styles.body}>Cannot Import: {summary.cannotImport}</Text>
        <Text style={styles.body}>Invalid: {summary.invalid}</Text>
        <Text style={styles.body}>Failed: {summary.failed}</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Not submitted</Text>
        <Text style={styles.helper}>
          These rows were not sent for import because they were already skipped,
          duplicate, invalid, in conflict, blocked, or already existing.
        </Text>
        <Text style={styles.body}>Skipped: {summary.notSubmitted.skipped}</Text>
        <Text style={styles.body}>
          Duplicate: {summary.notSubmitted.duplicate}
        </Text>
        <Text style={styles.body}>Invalid: {summary.notSubmitted.invalid}</Text>
        <Text style={styles.body}>
          Needs Review: {summary.notSubmitted.conflict}
        </Text>
        <Text style={styles.body}>
          Cannot Import: {summary.notSubmitted.backendBlocked}
        </Text>
        <Text style={styles.body}>
          Already Exists: {summary.notSubmitted.alreadyExists}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Submitted row results</Text>
      {result.rows.map((row) => (
        <View
          key={`result-${row.rowNumber}`}
          style={[
            styles.card,
            row.status === "IMPORTED" ? styles.successCard : styles.reviewCard,
          ]}
        >
          <Text style={styles.cardTitle}>Excel Row {row.rowNumber}</Text>
          <Text style={styles.body}>Flat {row.flatNumber || "—"}</Text>
          <Text style={styles.body}>{row.residentName || "—"}</Text>
          <Text style={styles.statusText}>{row.resultLabel}</Text>
          <Text style={styles.helper}>{row.message}</Text>
        </View>
      ))}

      {result.notSubmittedRows.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rows not submitted</Text>
          {result.notSubmittedRows.map((row) => (
            <View key={`unsent-${row.rowNumber}`} style={styles.card}>
              <Text style={styles.cardTitle}>Excel Row {row.rowNumber}</Text>
              <Text style={styles.body}>{row.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={BACK_TO_RESIDENT_MANAGEMENT_LABEL}
          onPress={onBackToResidentManagement}
        />
        <Button
          label={IMPORT_ANOTHER_EXCEL_FILE_LABEL}
          variant="secondary"
          onPress={onImportAnotherFile}
        />
      </View>
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
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  successCard: {
    borderColor: colors.success,
  },
  reviewCard: {
    borderColor: "#D97706",
  },
  cardTitle: {
    ...typography.subtitle,
    fontSize: 15,
  },
  statusText: {
    ...typography.label,
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
  },
});

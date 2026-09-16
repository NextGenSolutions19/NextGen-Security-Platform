import { StyleSheet, Text, View } from "react-native";
import {
  CONFIRM_IMPORT_LABEL,
  CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE,
  IMPORTING_RESIDENTS_LABEL,
  VERIFY_AGAINST_EXISTING_RESIDENTS_LABEL,
  formatResidentImportValidationStatus,
  type ResidentImportConfirmUiView,
  type ResidentImportDatabaseRowResult,
  type ResidentImportDatabaseVerificationResult,
  type ResidentImportMappedRowSnapshot,
  type ResidentImportPlan,
  type ResidentImportVerificationStatus,
} from "@nextgen/shared";
import { ImportResultSection } from "@/features/admin-excel-import/ImportResultSection";
import { Button } from "@/components/ui/Button";
import { colors, radius, spacing, typography } from "@/constants/theme";

function displayOrDash(value: string): string {
  return value.trim() ? value : "—";
}

function buildingWingLabel(mapped: ResidentImportMappedRowSnapshot): string {
  const building = mapped.building.trim();
  const wing = mapped.wing.trim();
  if (!building && !wing) {
    return "—";
  }
  if (building && wing) {
    return `${mapped.building} / ${mapped.wing}`;
  }
  return building ? mapped.building : mapped.wing;
}

function verificationCardStyle(status: ResidentImportDatabaseRowResult["status"]) {
  if (status === "READY_TO_IMPORT") {
    return styles.statusReady;
  }
  if (status === "ALREADY_EXISTS") {
    return styles.statusExists;
  }
  if (status === "BACKEND_BLOCKED") {
    return styles.statusBlocked;
  }
  return styles.statusConflict;
}

type ImportPlanSectionProps = {
  plan: ResidentImportPlan;
  isVerifying: boolean;
  isImporting: boolean;
  verificationStatus: ResidentImportVerificationStatus;
  verification: ResidentImportDatabaseVerificationResult | null;
  confirmEnabled: boolean;
  confirmDisabledReason: string;
  unsupportedFieldsWarning: string | null;
  importResult: ResidentImportConfirmUiView | null;
  onVerifyAgainstDatabase: () => void;
  onRequestConfirm: () => void;
  onBackToResidentManagement: () => void;
  onImportAnotherFile: () => void;
};

export function ImportPlanSection({
  plan,
  isVerifying,
  isImporting,
  verificationStatus,
  verification,
  confirmEnabled,
  confirmDisabledReason,
  unsupportedFieldsWarning,
  importResult,
  onVerifyAgainstDatabase,
  onRequestConfirm,
  onBackToResidentManagement,
  onImportAnotherFile,
}: ImportPlanSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Review Import Plan</Text>
      <Text style={styles.helper}>
        This is a local preview. Verify planned import rows against existing
        residents in this society, then confirm to import only ready rows.
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Import plan summary</Text>
        <Text style={styles.body}>
          Total Excel Rows: {plan.summary.totalExcelRows}
        </Text>
        <Text style={styles.body}>Will Import: {plan.summary.willImport}</Text>
        <Text style={styles.body}>Will Skip: {plan.summary.willSkip}</Text>
        <Text style={styles.body}>
          Valid selected for import: {plan.summary.validSelectedForImport}
        </Text>
        <Text style={styles.body}>
          Conflicts explicitly approved as separate residents:{" "}
          {plan.summary.conflictsApprovedAsSeparate}
        </Text>
        <Text style={styles.body}>
          Duplicates skipped: {plan.summary.duplicatesSkipped}
        </Text>
        <Text style={styles.body}>
          Invalid skipped: {plan.summary.invalidSkipped}
        </Text>
        <Text style={styles.body}>
          Backend-blocked skipped: {plan.summary.backendBlockedSkipped}
        </Text>
        <Text style={styles.body}>
          Manual skips: {plan.summary.manualSkips}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Will Import</Text>
      {plan.willImport.length === 0 ? (
        <Text style={styles.helper}>No rows are selected for import.</Text>
      ) : null}
      {plan.willImport.map((row) => (
        <View key={`import-${row.rowNumber}`} style={[styles.card, styles.importCard]}>
          <Text style={styles.cardTitle}>Excel Row: {row.rowNumber}</Text>
          <Text style={styles.body}>
            Building/Wing: {buildingWingLabel(row.mapped)}
          </Text>
          <Text style={styles.body}>
            Flat: {displayOrDash(row.mapped.flatNumber)}
          </Text>
          <Text style={styles.body}>
            Resident: {displayOrDash(row.mapped.residentName)}
          </Text>
          <Text style={styles.body}>
            Resident Type: {displayOrDash(row.mapped.residentType)}
          </Text>
          <Text style={styles.body}>
            Primary Mobile: {displayOrDash(row.mapped.primaryMobile)}
          </Text>
          <Text style={styles.body}>Additional Mobiles:</Text>
          {row.mapped.additionalMobiles.length === 0 ? (
            <Text style={styles.helper}>—</Text>
          ) : (
            row.mapped.additionalMobiles.map((mobile, index) => (
              <Text key={`${row.rowNumber}-mobile-${index}`} style={styles.body}>
                - {mobile}
              </Text>
            ))
          )}
          {row.mapped.customFields.map((field) => (
            <Text key={`${row.rowNumber}-${field.name}`} style={styles.body}>
              {field.name}: {displayOrDash(field.displayValue)}
            </Text>
          ))}
          <Text style={styles.helper}>{row.decisionSource}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Will Not Import</Text>
      {plan.willSkip.length === 0 ? (
        <Text style={styles.helper}>Every row is selected for import.</Text>
      ) : null}
      {plan.willSkip.map((row) => (
        <View key={`skip-${row.rowNumber}`} style={[styles.card, styles.skipCard]}>
          <Text style={styles.cardTitle}>Excel Row: {row.rowNumber}</Text>
          <Text style={styles.body}>
            Status: {formatResidentImportValidationStatus(row.validationStatus)}
          </Text>
          <Text style={styles.body}>
            Decision: {row.isBlocked ? "Cannot Import" : "Skip"}
          </Text>
          <Text style={styles.helper}>{row.reason}</Text>
        </View>
      ))}

      <View style={styles.confirmBox}>
        <Button
          label={VERIFY_AGAINST_EXISTING_RESIDENTS_LABEL}
          loading={isVerifying}
          disabled={isVerifying || isImporting}
          onPress={onVerifyAgainstDatabase}
        />
        <Text style={styles.helper}>
          Only rows currently selected for import are checked. Skipped, invalid,
          duplicate, and backend-blocked rows are not sent.
        </Text>
      </View>

      {verificationStatus === "stale" ? (
        <View style={styles.staleBanner}>
          <Text style={styles.warningText}>
            {CONFIRM_IMPORT_STALE_VERIFICATION_MESSAGE}
          </Text>
        </View>
      ) : null}

      {verificationStatus === "verified" && verification ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Database Verification</Text>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Verification summary</Text>
            <Text style={styles.body}>
              Rows Checked: {verification.summary.rowsChecked}
            </Text>
            <Text style={styles.body}>
              Ready to Import: {verification.summary.readyToImport}
            </Text>
            <Text style={styles.body}>
              Already Exists: {verification.summary.alreadyExists}
            </Text>
            <Text style={styles.body}>
              Possible Conflicts: {verification.summary.possibleConflicts}
            </Text>
            <Text style={styles.body}>
              Backend Blocked: {verification.summary.backendBlocked}
            </Text>
          </View>
          {verification.rows.map((row) => (
            <View
              key={`verify-${row.rowNumber}`}
              style={[styles.card, verificationCardStyle(row.status)]}
            >
              <Text style={styles.cardTitle}>Excel Row: {row.rowNumber}</Text>
              <Text style={styles.statusText}>
                Database Status: {row.databaseStatusLabel}
              </Text>
              <Text style={styles.body}>Decision: {row.decisionLabel}</Text>
              <Text style={styles.helper}>{row.message}</Text>
              {row.matchedFields.length > 0 ? (
                <Text style={styles.helper}>
                  Matched: {row.matchedFields.join(", ")}
                </Text>
              ) : null}
              {row.existingResident ? (
                <Text style={styles.helper}>
                  Existing: {row.existingResident.residentName} · Flat{" "}
                  {row.existingResident.flatNumber}
                  {row.existingResident.wingBuilding.trim()
                    ? ` · ${row.existingResident.wingBuilding}`
                    : ""}
                  {row.existingResident.mobile.trim()
                    ? ` · ${row.existingResident.mobile}`
                    : ""}
                  {row.existingResident.status === "disabled" ? " · Archived" : ""}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.confirmBox}>
        {unsupportedFieldsWarning ? (
          <Text style={styles.warningText}>{unsupportedFieldsWarning}</Text>
        ) : null}
        <Button
          label={isImporting ? IMPORTING_RESIDENTS_LABEL : CONFIRM_IMPORT_LABEL}
          loading={isImporting}
          disabled={!confirmEnabled || isImporting}
          onPress={onRequestConfirm}
        />
        {isImporting ? (
          <Text style={styles.helper}>{IMPORTING_RESIDENTS_LABEL}</Text>
        ) : null}
        {!confirmEnabled && confirmDisabledReason ? (
          <Text style={styles.helper}>{confirmDisabledReason}</Text>
        ) : null}
      </View>

      {importResult ? (
        <ImportResultSection
          result={importResult}
          onBackToResidentManagement={onBackToResidentManagement}
          onImportAnotherFile={onImportAnotherFile}
        />
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
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  importCard: {
    borderColor: colors.success,
  },
  skipCard: {
    borderColor: colors.border,
  },
  statusReady: {
    borderColor: colors.success,
  },
  statusExists: {
    borderColor: colors.accent,
  },
  statusConflict: {
    borderColor: "#D97706",
  },
  statusBlocked: {
    borderColor: "#7C2D12",
  },
  cardTitle: {
    ...typography.subtitle,
    fontSize: 15,
  },
  statusText: {
    ...typography.label,
    marginTop: spacing.xs,
  },
  confirmBox: {
    gap: spacing.sm,
  },
  warningText: {
    ...typography.body,
    color: colors.text,
  },
  staleBanner: {
    backgroundColor: "#FFFBEB",
    borderColor: "#D97706",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});

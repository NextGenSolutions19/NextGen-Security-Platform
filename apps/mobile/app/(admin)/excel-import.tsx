import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  DUPLICATE_HEADER_WARNING,
  RESIDENT_IMPORT_LIMITS,
  applyResidentImportBulkAction,
  beginResidentImportConfirm,
  beginResidentImportVerification,
  buildResidentImportConfirmUiView,
  buildResidentImportPlan,
  buildResidentImportVerifyRequest,
  canReviewResidentImportPlan,
  cancelResidentImportConfirmDialog,
  completeResidentImportConfirm,
  completeResidentImportVerification,
  completedResidentImportRowNumbers,
  createResidentImportConfirmFlowState,
  createResidentImportDecisionSnapshot,
  createResidentImportMappingSnapshot,
  createResidentImportVerificationState,
  displayedResidentImportVerification,
  failResidentImportConfirm,
  failResidentImportVerification,
  formatResidentImportFileSize,
  formatResidentImportMaxFileSize,
  markResidentImportVerificationStale,
  parseResidentImportWorkbook,
  prepareResidentImportConfirm,
  requestResidentImportConfirmDialog,
  resetResidentImportConfirmFlow,
  reviewImportPlanDoesNotRestoreVerification,
  resetResidentImportMappingSnapshot,
  residentImportConfirmDisabledReason,
  residentImportUnsupportedFieldsWarning,
  setResidentImportRowDecision,
  validateResidentImportWorkbook,
  type ResidentImportBulkAction,
  type ResidentImportDecision,
  type ResidentImportDecisionSnapshot,
  type ResidentImportMappingSnapshot,
  type ResidentImportPlan,
  type ResidentImportValidationSuccess,
  type WorkbookParseResult,
} from "@nextgen/shared";
import { ColumnMappingSection } from "@/features/admin-excel-import/ColumnMappingSection";
import { ConfirmImportDialog } from "@/features/admin-excel-import/ConfirmImportDialog";
import { ImportPlanSection } from "@/features/admin-excel-import/ImportPlanSection";
import { ValidationSection } from "@/features/admin-excel-import/ValidationSection";
import { pickResidentImportWorkbook } from "@/features/admin-excel-import/pickResidentImportWorkbook";
import {
  ResidentImportConfirmError,
  confirmResidentImportRows,
} from "@/features/admin-excel-import/residentImportConfirmService";
import {
  ResidentImportVerifyError,
  verifyResidentImportAgainstDatabase,
} from "@/features/admin-excel-import/residentImportVerifyService";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SelectField } from "@/components/ui/SelectField";
import { colors, radius, spacing, typography } from "@/constants/theme";

const ADMIN_DASHBOARD_ROUTE = "/(admin)/dashboard" as Href;
const ADMIN_RESIDENTS_ROUTE = "/(admin)/residents" as Href;
const PREVIEW_ROWS = RESIDENT_IMPORT_LIMITS.previewRowCount;
const MAX_FILE_SIZE_LABEL = formatResidentImportMaxFileSize();

export default function AdminExcelImportScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const [isPicking, setIsPicking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [result, setResult] = useState<WorkbookParseResult | null>(null);
  const [mapping, setMapping] = useState<ResidentImportMappingSnapshot | null>(
    null,
  );
  const [validation, setValidation] =
    useState<ResidentImportValidationSuccess | null>(null);
  const [decisions, setDecisions] =
    useState<ResidentImportDecisionSnapshot | null>(null);
  const [importPlan, setImportPlan] = useState<ResidentImportPlan | null>(null);
  const [verificationState, setVerificationState] = useState(
    createResidentImportVerificationState,
  );
  const [confirmFlow, setConfirmFlow] = useState(createResidentImportConfirmFlowState);
  const importInFlightRef = useRef(false);
  const importPlanRef = useRef<ResidentImportPlan | null>(null);
  importPlanRef.current = importPlan;

  const previewRows = useMemo(
    () => result?.rows.slice(0, PREVIEW_ROWS) ?? [],
    [result],
  );

  const resetConfirmFlow = () => {
    importInFlightRef.current = false;
    setConfirmFlow(resetResidentImportConfirmFlow());
  };

  const invalidateVerification = () => {
    setVerificationState(markResidentImportVerificationStale());
    resetConfirmFlow();
  };

  const rebuildPlanFromDecisions = (
    nextDecisions: ResidentImportDecisionSnapshot,
  ): ResidentImportPlan | null => {
    if (!result || !mapping || !validation) {
      return null;
    }
    return buildResidentImportPlan({
      workbook: result,
      mapping,
      validation,
      decisions: nextDecisions,
    });
  };

  const clearValidationAndDecisions = () => {
    setValidation(null);
    setDecisions(null);
    setImportPlan(null);
    setVerificationState(createResidentImportVerificationState());
    resetConfirmFlow();
  };

  const applyWorkbook = (
    fileName: string,
    fileBytes: Uint8Array,
    selectedSheet?: string,
  ) => {
    const outcome = parseResidentImportWorkbook({
      fileName,
      bytes: fileBytes,
      selectedSheet,
    });

    if (!outcome.ok) {
      setResult(null);
      setMapping(null);
      clearValidationAndDecisions();
      setErrorMessage(outcome.message);
      return;
    }

    setErrorMessage(null);
    setResult(outcome.result);
    setMapping(createResidentImportMappingSnapshot(outcome.result));
    clearValidationAndDecisions();
  };

  const handleSelectFile = async () => {
    setIsPicking(true);
    setErrorMessage(null);

    try {
      const picked = await pickResidentImportWorkbook();
      if (picked.status === "cancelled") {
        return;
      }
      if (picked.status === "rejected") {
        setBytes(null);
        setResult(null);
        setMapping(null);
        clearValidationAndDecisions();
        setErrorMessage(picked.message);
        return;
      }

      setBytes(picked.bytes);
      applyWorkbook(picked.fileName, picked.bytes);
    } catch (error) {
      if (__DEV__) {
        console.warn("Excel import picker failed", error);
      }
      setBytes(null);
      setResult(null);
      setMapping(null);
      clearValidationAndDecisions();
      setErrorMessage("The Excel file could not be opened. Try selecting it again.");
    } finally {
      setIsPicking(false);
    }
  };

  const handleContinueToValidation = () => {
    if (!result || !mapping) {
      return;
    }
    const outcome = validateResidentImportWorkbook({
      workbook: result,
      mapping,
    });
    if (!outcome.ok) {
      clearValidationAndDecisions();
      setErrorMessage(outcome.message);
      return;
    }
    setErrorMessage(null);
    setValidation(outcome);
    setDecisions(createResidentImportDecisionSnapshot(outcome.rows));
    setImportPlan(null);
    invalidateVerification();
  };

  const handleSetDecision = (
    rowNumber: number,
    decision: ResidentImportDecision,
  ) => {
    if (!validation || !decisions) {
      return;
    }
    const next = setResidentImportRowDecision(
      decisions,
      validation.rows,
      rowNumber,
      decision,
    );
    if (!next.ok) {
      setErrorMessage(next.message);
      return;
    }
    setErrorMessage(null);
    setDecisions(next.snapshot);
    setImportPlan(rebuildPlanFromDecisions(next.snapshot));
    invalidateVerification();
  };

  const handleBulkAction = (action: ResidentImportBulkAction) => {
    if (!validation || !decisions) {
      return;
    }
    setErrorMessage(null);
    const next = applyResidentImportBulkAction({
      action,
      validationRows: validation.rows,
      decisions,
    });
    setDecisions(next);
    setImportPlan(rebuildPlanFromDecisions(next));
    invalidateVerification();
  };

  const handleReviewImportPlan = (): void => {
    if (!result || !mapping || !validation || !decisions) {
      return;
    }
    if (!canReviewResidentImportPlan(validation, decisions)) {
      setErrorMessage(
        "Resolve remaining row decisions before reviewing the import plan.",
      );
      return;
    }
    const plan = buildResidentImportPlan({
      workbook: result,
      mapping,
      validation,
      decisions,
    });
    if (!plan) {
      setErrorMessage(
        "The import plan could not be built from the current decisions.",
      );
      return;
    }
    setErrorMessage(null);
    setImportPlan(plan);
    setVerificationState((current) =>
      reviewImportPlanDoesNotRestoreVerification(current, plan),
    );
  };

  const handleVerifyAgainstDatabase = async () => {
    if (!importPlan) {
      return;
    }
    if (!accessToken) {
      setErrorMessage("Your session has expired. Please login again.");
      return;
    }
    const sentPlan = importPlan;
    setVerificationState(beginResidentImportVerification());
    setErrorMessage(null);
    resetConfirmFlow();
    try {
      const payload = buildResidentImportVerifyRequest(sentPlan);
      const verified = await verifyResidentImportAgainstDatabase(
        accessToken,
        payload,
      );
      setVerificationState(
        completeResidentImportVerification({
          sentPlan,
          currentPlan: importPlanRef.current,
          backendResult: verified,
        }),
      );
    } catch (error) {
      setVerificationState(failResidentImportVerification());
      if (error instanceof ResidentImportVerifyError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(
          "Unable to verify against existing residents. Please try again.",
        );
      }
    }
  };

  const displayedVerification = displayedResidentImportVerification(
    verificationState,
    importPlan,
  );
  const excludeRowNumbers = completedResidentImportRowNumbers(confirmFlow);
  const preparedConfirm = prepareResidentImportConfirm({
    plan: importPlan,
    verificationState,
    excludeRowNumbers,
  });
  const isVerifying = verificationState.status === "verifying";
  const confirmEnabled = !isVerifying && preparedConfirm.ok;
  const confirmDisabledReason = preparedConfirm.ok
    ? ""
    : residentImportConfirmDisabledReason({
        plan: importPlan,
        verificationState,
        excludeRowNumbers,
      });
  const readyRowCount = preparedConfirm.ok
    ? preparedConfirm.request.rows.length
    : 0;
  const unsupportedFieldsWarning = importPlan
    ? residentImportUnsupportedFieldsWarning(importPlan)
    : null;

  const handleRequestConfirm = () => {
    const allowed = prepareResidentImportConfirm({
      plan: importPlan,
      verificationState,
      excludeRowNumbers,
    });
    if (!allowed.ok || confirmFlow.isImporting || importInFlightRef.current) {
      if (!allowed.ok) {
        setErrorMessage(allowed.message);
      }
      setConfirmFlow((current) =>
        requestResidentImportConfirmDialog(current, false),
      );
      return;
    }
    setErrorMessage(null);
    setConfirmFlow((current) =>
      requestResidentImportConfirmDialog(current, true),
    );
  };

  const handleCancelConfirm = () => {
    setConfirmFlow((current) => cancelResidentImportConfirmDialog(current));
  };

  const handleConfirmImport = async () => {
    if (importInFlightRef.current || confirmFlow.isImporting) {
      return;
    }
    const started = beginResidentImportConfirm(confirmFlow);
    if (!started.shouldInvoke) {
      return;
    }
    importInFlightRef.current = true;
    setConfirmFlow(started.state);
    setErrorMessage(null);

    try {
      const prepared = prepareResidentImportConfirm({
        plan: importPlan,
        verificationState,
        excludeRowNumbers,
      });
      if (!prepared.ok || !accessToken || !importPlan) {
        const failed = failResidentImportConfirm(
          started.state,
          prepared.ok
            ? undefined
            : prepared.message,
        );
        setConfirmFlow(failed);
        setErrorMessage(failed.requestError);
        return;
      }
      const batch = await confirmResidentImportRows(
        accessToken,
        prepared.request,
      );
      const view = buildResidentImportConfirmUiView({
        plan: importPlan,
        verification: displayedVerification,
        batch,
      });
      setConfirmFlow(completeResidentImportConfirm(started.state, view));
    } catch (error) {
      const failed = failResidentImportConfirm(
        started.state,
        error instanceof ResidentImportConfirmError
          ? error.message
          : undefined,
      );
      setConfirmFlow(failed);
      setErrorMessage(failed.requestError);
    } finally {
      importInFlightRef.current = false;
    }
  };

  const handleBackToResidentManagement = () => {
    router.replace(ADMIN_RESIDENTS_ROUTE);
  };

  const handleImportAnotherFile = () => {
    setBytes(null);
    setResult(null);
    setMapping(null);
    clearValidationAndDecisions();
    void handleSelectFile();
  };

  const handleSheetChange = (sheetName: string) => {
    if (!bytes || !result) {
      return;
    }
    applyWorkbook(result.fileName, bytes, sheetName);
  };

  return (
    <AdminScrollScreen
      title="Excel Import"
      subtitle="Select an Excel workbook, map columns, validate rows, review the import plan, verify against existing residents, then confirm to import ready rows."
      footer={
        <View style={styles.footer}>
          <Button
            label="Select Excel File"
            loading={isPicking}
            disabled={isPicking || confirmFlow.isImporting}
            onPress={() => void handleSelectFile()}
          />
          <Button
            label="Back to Dashboard"
            variant="secondary"
            onPress={() => router.replace(ADMIN_DASHBOARD_ROUTE)}
          />
        </View>
      }
    >
      <Text style={styles.helper}>.xlsx files only</Text>
      <Text style={styles.helper}>Maximum file size: {MAX_FILE_SIZE_LABEL}</Text>
      <Text style={styles.helper}>
        No data will be imported until later confirmation
      </Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      {isPicking ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.helper}>Reading Excel file…</Text>
        </View>
      ) : null}

      {result ? (
        <View style={styles.section}>
          <InfoCard label="File name" value={result.fileName} />
          <InfoCard
            label="File size"
            value={formatResidentImportFileSize(result.fileBytes)}
          />
          <InfoCard
            label="Sheets"
            value={`${result.visibleSheetNames.length} visible${
              result.hiddenSheetNames.length
                ? `, ${result.hiddenSheetNames.length} hidden`
                : ""
            }`}
          />
          {result.visibleSheetNames.length > 1 ? (
            <SelectField
              label="Sheet"
              value={result.selectedSheet}
              options={result.visibleSheetNames}
              onChange={handleSheetChange}
            />
          ) : (
            <InfoCard label="Sheet" value={result.selectedSheet} />
          )}
          {result.hiddenSheetNames.length > 0 ? (
            <Text style={styles.helper}>
              Hidden sheet{result.hiddenSheetNames.length === 1 ? "" : "s"} ignored:{" "}
              {result.hiddenSheetNames.join(", ")}
            </Text>
          ) : null}

          {result.warnings.map((warning) => (
            <View
              key={`${warning.code}-${warning.sheetName ?? ""}`}
              style={
                warning.code === "duplicate_header"
                  ? styles.warningBanner
                  : styles.noteBanner
              }
            >
              <Text style={styles.warningText}>
                {warning.code === "duplicate_header"
                  ? DUPLICATE_HEADER_WARNING
                  : warning.message}
              </Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Detected columns</Text>
          <Text style={styles.headers}>
            {result.columns
              .map((column) =>
                column.header.trim()
                  ? column.header
                  : `(Column ${column.index + 1})`,
              )
              .join("  ·  ")}
          </Text>

          <Text style={styles.sectionTitle}>Raw preview</Text>
          <Text style={styles.helper}>
            Total rows: {result.totalDataRowCount}
          </Text>
          <Text style={styles.helper}>
            {result.totalDataRowCount <= PREVIEW_ROWS
              ? `Previewing: all ${result.totalDataRowCount} rows`
              : `Previewing: first ${PREVIEW_ROWS} rows`}
          </Text>

          <ScrollView horizontal style={styles.tableScroll}>
            <View>
              <View style={styles.tableRow}>
                {result.columns.map((column) => (
                  <Text key={`h-${column.index}`} style={styles.headerCell}>
                    {column.header || `(Column ${column.index + 1})`}
                  </Text>
                ))}
              </View>
              {previewRows.map((row) => (
                <View key={row.rowNumber} style={styles.tableRow}>
                  {row.displayValues.map((value, index) => (
                    <Text
                      key={`${row.rowNumber}-${index}`}
                      style={styles.bodyCell}
                    >
                      {value}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          {mapping ? (
            <ColumnMappingSection
              workbook={result}
              snapshot={mapping}
              onSnapshotChange={(next) => {
                setMapping(next);
                clearValidationAndDecisions();
              }}
              onResetSuggestions={() => {
                setMapping(resetResidentImportMappingSnapshot(result));
                clearValidationAndDecisions();
              }}
              onContinueToValidation={handleContinueToValidation}
            />
          ) : null}

          {validation && decisions ? (
            <ValidationSection
              result={validation}
              decisions={decisions}
              canReview={canReviewResidentImportPlan(validation, decisions)}
              onSetDecision={handleSetDecision}
              onBulkAction={handleBulkAction}
              onReviewImportPlan={handleReviewImportPlan}
            />
          ) : null}

          {importPlan ? (
            <ImportPlanSection
              plan={importPlan}
              isVerifying={isVerifying}
              isImporting={confirmFlow.isImporting}
              verificationStatus={verificationState.status}
              verification={displayedVerification}
              confirmEnabled={confirmEnabled}
              confirmDisabledReason={confirmDisabledReason}
              unsupportedFieldsWarning={unsupportedFieldsWarning}
              importResult={confirmFlow.result}
              onVerifyAgainstDatabase={() => {
                void handleVerifyAgainstDatabase();
              }}
              onRequestConfirm={handleRequestConfirm}
              onBackToResidentManagement={handleBackToResidentManagement}
              onImportAnotherFile={handleImportAnotherFile}
            />
          ) : null}
        </View>
      ) : null}

      <ConfirmImportDialog
        visible={confirmFlow.dialogOpen}
        count={readyRowCount}
        isImporting={confirmFlow.isImporting}
        unsupportedFieldsWarning={unsupportedFieldsWarning}
        onCancel={handleCancelConfirm}
        onConfirm={() => {
          void handleConfirmImport();
        }}
      />
    </AdminScrollScreen>
  );
}

const cellWidth = 140;

const styles = StyleSheet.create({
  helper: {
    ...typography.caption,
  },
  footer: {
    gap: spacing.sm,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.subtitle,
  },
  headers: {
    ...typography.body,
  },
  warningBanner: {
    backgroundColor: "#FFFBEB",
    borderColor: "#D97706",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteBanner: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warningText: {
    color: colors.text,
    fontSize: 14,
  },
  tableScroll: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCell: {
    width: cellWidth,
    padding: spacing.sm,
    fontWeight: "600",
    color: colors.text,
    fontSize: 13,
  },
  bodyCell: {
    width: cellWidth,
    padding: spacing.sm,
    color: colors.text,
    fontSize: 13,
    ...(Platform.OS === "web" ? ({ whiteSpace: "pre" } as object) : null),
  },
});

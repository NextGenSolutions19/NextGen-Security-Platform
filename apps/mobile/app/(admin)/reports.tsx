import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ADMIN_REPORT_FILTER_ALL,
  ADMIN_VISITOR_PURPOSE_ALL,
  ADMIN_VISITOR_STATUS_FILTERS,
  buildAdminReportCsv,
  buildAdminReportCsvFilename,
  collectAdminReportFlatOptions,
  collectAdminReportResidentOptions,
  collectAdminReportWingOptions,
  collectAdminVisitorPurposeOptions,
  filterAdminReportItems,
  formatAdminReportStatus,
  formatAdminVisitorCheckInAt,
  formatAdminVisitorCheckOutAt,
  formatAdminVisitorStatusFilter,
  formatVisitorPartyLabel,
  getAdminVisitorDateRangeError,
  getIndianDateInputError,
  isRecurringServiceVisit,
  resolveAdminReportGuardLabel,
  resolveVisitRecurringVisitorTypeLabel,
  resolveVisitorDestinationLabel,
  resolveVisitorEntryTypeLabel,
  resolveVisitorPrimaryIdentifier,
  summarizeAdminReportItems,
  type AdminReportGuardOption,
  type AdminVisitorStatusFilter,
  type VisitorListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { replaceAdminDashboard } from "@/features/admin-dashboard/adminDashboardModules";
import { AdminIndianDateField } from "@/features/admin-visitors/AdminIndianDateField";
import { listAdminSocietyVisitorHistory } from "@/features/admin-visitors/adminVisitorHistoryService";
import { listGuardAccounts } from "@/features/guard-management/guardManagementService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

function downloadWebCsvFile(csv: string, filename: string): void {
  const web = globalThis as {
    Blob?: new (parts: string[], options?: { type: string }) => object;
    URL?: {
      createObjectURL: (blob: object) => string;
      revokeObjectURL: (url: string) => void;
    };
    document?: {
      body?: {
        appendChild: (node: unknown) => unknown;
        removeChild: (node: unknown) => unknown;
      };
      createElement: (tagName: string) => {
        href: string;
        download: string;
        style: { display: string };
        click: () => void;
      };
    };
  };

  if (!web.Blob || !web.URL || !web.document) {
    throw new Error("Unable to export report.");
  }

  const blob = new web.Blob([csv], { type: "text/csv;charset=utf-8;" });
  const objectUrl = web.URL.createObjectURL(blob);
  const anchor = web.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  web.document.body?.appendChild(anchor);
  anchor.click();
  web.document.body?.removeChild(anchor);
  web.URL.revokeObjectURL(objectUrl);
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [entries, setEntries] = useState<VisitorListItem[]>([]);
  const [guards, setGuards] = useState<AdminReportGuardOption[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AdminVisitorStatusFilter>("all");
  const [purposeFilter, setPurposeFilter] = useState(ADMIN_VISITOR_PURPOSE_ALL);
  const [wingFilter, setWingFilter] = useState(ADMIN_REPORT_FILTER_ALL);
  const [flatFilter, setFlatFilter] = useState(ADMIN_REPORT_FILTER_ALL);
  const [residentFilter, setResidentFilter] = useState(ADMIN_REPORT_FILTER_ALL);
  const [guardFilter, setGuardFilter] = useState(ADMIN_REPORT_FILTER_ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const purposeOptions = useMemo(
    () => [ADMIN_VISITOR_PURPOSE_ALL, ...collectAdminVisitorPurposeOptions(entries)],
    [entries],
  );
  const wingOptions = useMemo(
    () => [ADMIN_REPORT_FILTER_ALL, ...collectAdminReportWingOptions(entries)],
    [entries],
  );
  const flatOptions = useMemo(
    () => [ADMIN_REPORT_FILTER_ALL, ...collectAdminReportFlatOptions(entries)],
    [entries],
  );
  const residentOptions = useMemo(
    () => [ADMIN_REPORT_FILTER_ALL, ...collectAdminReportResidentOptions(entries)],
    [entries],
  );
  const guardOptions = useMemo(
    () => [ADMIN_REPORT_FILTER_ALL, ...guards.map((guard) => guard.id)],
    [guards],
  );

  const fromDateError = getIndianDateInputError(fromDate);
  const toDateError = getIndianDateInputError(toDate);
  const dateRangeError =
    fromDateError || toDateError
      ? null
      : getAdminVisitorDateRangeError(fromDate, toDate);

  const filteredEntries = useMemo(
    () =>
      filterAdminReportItems(entries, {
        search: searchQuery,
        status: statusFilter,
        purpose: purposeFilter,
        fromDate,
        toDate,
        wingBuilding: wingFilter,
        flatNumber: flatFilter,
        residentName: residentFilter,
        guardId: guardFilter,
      }),
    [
      entries,
      searchQuery,
      statusFilter,
      purposeFilter,
      fromDate,
      toDate,
      wingFilter,
      flatFilter,
      residentFilter,
      guardFilter,
    ],
  );

  const summary = useMemo(
    () => summarizeAdminReportItems(filteredEntries),
    [filteredEntries],
  );

  const loadReports = useCallback(
    async (refresh = false) => {
      if (!accessToken || !jwtSocietyId) {
        return;
      }
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);
      try {
        const [history, guardAccounts] = await Promise.all([
          listAdminSocietyVisitorHistory(accessToken, jwtSocietyId),
          listGuardAccounts(accessToken).catch(() => []),
        ]);
        setEntries(history);
        setGuards(
          guardAccounts.map((guard) => ({
            id: guard.id,
            loginId: guard.loginId,
            name: guard.guardName,
          })),
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load reports.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, jwtSocietyId],
  );

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPurposeFilter(ADMIN_VISITOR_PURPOSE_ALL);
    setWingFilter(ADMIN_REPORT_FILTER_ALL);
    setFlatFilter(ADMIN_REPORT_FILTER_ALL);
    setResidentFilter(ADMIN_REPORT_FILTER_ALL);
    setGuardFilter(ADMIN_REPORT_FILTER_ALL);
    setFromDate("");
    setToDate("");
  };

  const handleExport = async () => {
    if (isExporting || dateRangeError || fromDateError || toDateError) {
      return;
    }
    setIsExporting(true);
    try {
      const csv = buildAdminReportCsv(filteredEntries, guards);
      if (Platform.OS === "web") {
        downloadWebCsvFile(csv, buildAdminReportCsvFilename());
      } else {
        await Share.share({
          title: "Society visitor report",
          message: csv,
        });
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to export report.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const guardLabel = (value: string) => {
    if (value === ADMIN_REPORT_FILTER_ALL) {
      return "All";
    }
    return resolveAdminReportGuardLabel(value, guards);
  };

  return (
    <AdminScrollScreen
      title="Reports"
      subtitle="Read-only visitor report for your society. Dates use IST."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          onPress={() => replaceAdminDashboard(router as never)}
        />
      }
      scrollViewProps={{
        refreshControl: (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadReports(true)}
          />
        ),
      }}
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : null}

      <TextField
        label="Search"
        value={searchQuery}
        placeholder="Mobile, name, flat, purpose, resident"
        onChangeText={setSearchQuery}
      />
      <SelectField
        label="Status"
        value={statusFilter}
        options={ADMIN_VISITOR_STATUS_FILTERS}
        getOptionLabel={(value) =>
          value === "checked_in"
            ? "IN"
            : value === "checked_out"
              ? "OUT"
              : formatAdminVisitorStatusFilter(value)
        }
        onChange={setStatusFilter}
      />
      <SelectField
        label="Purpose"
        value={purposeFilter}
        options={purposeOptions}
        getOptionLabel={(value) => (value === ADMIN_VISITOR_PURPOSE_ALL ? "All" : value)}
        onChange={setPurposeFilter}
      />
      <SelectField
        label="Building/Wing"
        value={wingFilter}
        options={wingOptions}
        getOptionLabel={(value) => (value === ADMIN_REPORT_FILTER_ALL ? "All" : value)}
        onChange={setWingFilter}
      />
      <SelectField
        label="Flat Number"
        value={flatFilter}
        options={flatOptions}
        getOptionLabel={(value) => (value === ADMIN_REPORT_FILTER_ALL ? "All" : value)}
        onChange={setFlatFilter}
      />
      <SelectField
        label="Resident"
        value={residentFilter}
        options={residentOptions}
        getOptionLabel={(value) => (value === ADMIN_REPORT_FILTER_ALL ? "All" : value)}
        onChange={setResidentFilter}
      />
      {guardOptions.length > 1 ? (
        <SelectField
          label="Guard"
          value={guardFilter}
          options={guardOptions}
          getOptionLabel={guardLabel}
          onChange={setGuardFilter}
        />
      ) : null}
      <AdminIndianDateField
        label="From date"
        value={fromDate}
        onChange={setFromDate}
        error={fromDateError}
      />
      <AdminIndianDateField
        label="To date"
        value={toDate}
        onChange={setToDate}
        error={toDateError ?? dateRangeError}
      />
      <Button
        label="Reset Filters"
        variant="secondary"
        onPress={handleResetFilters}
      />

      <View style={styles.summary}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <Text style={styles.summaryLine}>Total visits {summary.totalVisits}</Text>
        <Text style={styles.summaryLine}>Currently IN {summary.currentlyIn}</Text>
        <Text style={styles.summaryLine}>Checked OUT {summary.checkedOut}</Text>
        {summary.purposeCounts.map((row) => (
          <Text key={row.purpose} style={styles.caption}>
            {row.purpose}: {row.count}
          </Text>
        ))}
      </View>

      <Button
        label={isExporting ? "Exporting..." : "Export CSV"}
        variant="secondary"
        disabled={isExporting || Boolean(fromDateError || toDateError || dateRangeError)}
        onPress={() => void handleExport()}
      />

      <Text style={styles.sectionTitle}>Visits</Text>
      {filteredEntries.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {formatAdminReportStatus(item.status)} ·{" "}
            {resolveVisitorPrimaryIdentifier(item)}
          </Text>
          <Text style={styles.cardMeta}>
            {isRecurringServiceVisit(item)
              ? `Entry Type: ${resolveVisitorEntryTypeLabel(item)}`
              : item.purposeLabel || item.purpose}
            {` · ${resolveVisitorDestinationLabel(item)}`}
          </Text>
          {isRecurringServiceVisit(item) &&
          resolveVisitRecurringVisitorTypeLabel(item) ? (
            <Text style={styles.caption}>
              Visitor Type: {resolveVisitRecurringVisitorTypeLabel(item)}
            </Text>
          ) : null}
          {item.visitorName?.trim() ? (
            <Text style={styles.caption}>Mobile {item.visitorMobile}</Text>
          ) : null}
          {item.residentName ? (
            <Text style={styles.caption}>Resident {item.residentName}</Text>
          ) : null}
          {item.vehicleNumber?.trim() ? (
            <Text style={styles.caption}>
              Vehicle Number {item.vehicleNumber.trim()}
            </Text>
          ) : null}
          {typeof item.visitorCount === "number" ? (
            <Text style={styles.caption}>
              No. of Visitors {item.visitorCount}
            </Text>
          ) : null}
          {formatVisitorPartyLabel(item) ? (
            <Text style={styles.caption}>{formatVisitorPartyLabel(item)}</Text>
          ) : null}
          <Text style={styles.caption}>
            In {formatAdminVisitorCheckInAt(item.checkInAt)}
          </Text>
          <Text style={styles.caption}>
            Out {formatAdminVisitorCheckOutAt(item.checkOutAt)}
          </Text>
          <Text style={styles.caption}>
            Guard {resolveAdminReportGuardLabel(item.createdByAppUserId, guards)}
          </Text>
        </View>
      ))}
      {!isLoading && filteredEntries.length === 0 ? (
        <Text style={styles.caption}>No visits match the current filters.</Text>
      ) : null}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
  },
  caption: {
    ...typography.caption,
  },
  sectionTitle: {
    ...typography.subtitle,
    marginTop: spacing.sm,
  },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryLine: {
    ...typography.body,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.subtitle,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
  },
});

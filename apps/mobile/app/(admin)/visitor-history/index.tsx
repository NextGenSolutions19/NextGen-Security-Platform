import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  ADMIN_VISITOR_PURPOSE_ALL,
  ADMIN_VISITOR_STATUS_FILTERS,
  collectAdminVisitorPurposeOptions,
  filterAdminVisitorHistoryItems,
  formatAdminVisitorStatusFilter,
  getAdminVisitorDateRangeError,
  getIndianDateInputError,
  type AdminVisitorStatusFilter,
  type VisitorListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminIndianDateField } from "@/features/admin-visitors/AdminIndianDateField";
import { AdminVisitorHistoryCard } from "@/features/admin-visitors/AdminVisitorHistoryCard";
import { listAdminSocietyVisitorHistory } from "@/features/admin-visitors/adminVisitorHistoryService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

const ADMIN_DASHBOARD_ROUTE = "/(admin)/dashboard" as Href;

export default function AdminVisitorHistoryScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [entries, setEntries] = useState<VisitorListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AdminVisitorStatusFilter>("all");
  const [purposeFilter, setPurposeFilter] = useState(ADMIN_VISITOR_PURPOSE_ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const purposeOptions = useMemo(
    () => [ADMIN_VISITOR_PURPOSE_ALL, ...collectAdminVisitorPurposeOptions(entries)],
    [entries],
  );

  const fromDateError = getIndianDateInputError(fromDate);
  const toDateError = getIndianDateInputError(toDate);
  const dateRangeError =
    fromDateError || toDateError
      ? null
      : getAdminVisitorDateRangeError(fromDate, toDate);

  const filteredEntries = useMemo(
    () =>
      filterAdminVisitorHistoryItems(entries, {
        search: searchQuery,
        status: statusFilter,
        purpose: purposeFilter,
        fromDate,
        toDate,
      }),
    [entries, searchQuery, statusFilter, purposeFilter, fromDate, toDate],
  );

  const loadEntries = useCallback(
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
        setEntries(await listAdminSocietyVisitorHistory(accessToken, jwtSocietyId));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load visitor history.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, jwtSocietyId],
  );

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!purposeOptions.includes(purposeFilter)) {
      setPurposeFilter(ADMIN_VISITOR_PURPOSE_ALL);
    }
  }, [purposeFilter, purposeOptions]);

  return (
    <AdminScrollScreen
      title="Visitor History"
      subtitle="View visitor records for your society."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          onPress={() => router.replace(ADMIN_DASHBOARD_ROUTE)}
        />
      }
      contentContainerStyle={styles.scrollContent}
      scrollViewProps={{
        showsVerticalScrollIndicator: true,
        refreshControl: !isLoading ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadEntries(true)}
          />
        ) : undefined,
      }}
    >
      <TextField
        label="Search"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Mobile, name, flat, purpose, vehicle, resident"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.filters}>
        {ADMIN_VISITOR_STATUS_FILTERS.map((filter) => {
          const selected = statusFilter === filter;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setStatusFilter(filter)}
              style={[
                styles.filterChip,
                selected ? styles.filterChipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selected ? styles.filterChipTextSelected : null,
                ]}
              >
                {formatAdminVisitorStatusFilter(filter)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SelectField
        label="Purpose / category"
        value={purposeFilter}
        options={purposeOptions}
        getOptionLabel={(value) => (value === ADMIN_VISITOR_PURPOSE_ALL ? "All" : value)}
        onChange={setPurposeFilter}
      />

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
        error={toDateError}
      />
      {dateRangeError ? <ErrorBanner message={dateRangeError} /> : null}

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading visitor history...</Text>
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>
            {entries.length === 0
              ? "No visitor records found for your society."
              : "No visitor records match your search or filters."}
          </Text>
        </View>
      ) : (
        <View style={styles.listContent}>
          {filteredEntries.map((item) => (
            <AdminVisitorHistoryCard
              key={item.id}
              item={item}
              onPress={() =>
                router.push(`/(admin)/visitor-history/${item.id}` as Href)
              }
            />
          ))}
        </View>
      )}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  filters: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  filterChip: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
  },
  filterChipSelected: {
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: "600",
    textAlign: "center",
  },
  filterChipTextSelected: {
    color: colors.accent,
  },
  listContent: {
    gap: spacing.sm,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});

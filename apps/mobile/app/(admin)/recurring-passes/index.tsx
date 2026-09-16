import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import {
  ADMIN_RECURRING_PASS_STATUS_FILTERS,
  ADMIN_RECURRING_PASS_TYPE_FILTERS,
  filterAdminRecurringVisitorPasses,
  formatAdminRecurringPassStatusFilter,
  formatAdminRecurringPassTypeFilter,
  type AdminRecurringPassStatusFilter,
  type AdminRecurringPassTypeFilter,
  type AdminRecurringVisitorPassListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminRecurringPassCard } from "@/features/admin-recurring-passes/AdminRecurringPassCard";
import { listAdminSocietyRecurringPasses } from "@/features/admin-recurring-passes/adminRecurringPassService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

const ADMIN_DASHBOARD_ROUTE = "/(admin)/dashboard" as Href;
const CREATE_PASS_ROUTE = "/(admin)/recurring-passes/new" as Href;

export default function AdminRecurringPassListScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [passes, setPasses] = useState<AdminRecurringVisitorPassListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AdminRecurringPassStatusFilter>("all");
  const [typeFilter, setTypeFilter] =
    useState<AdminRecurringPassTypeFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredPasses = useMemo(
    () =>
      filterAdminRecurringVisitorPasses(passes, {
        search: searchQuery,
        status: statusFilter,
        visitorType: typeFilter,
      }),
    [passes, searchQuery, statusFilter, typeFilter],
  );

  const loadPasses = useCallback(
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
        setPasses(await listAdminSocietyRecurringPasses(accessToken, jwtSocietyId));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load recurring visitor passes.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, jwtSocietyId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadPasses();
    }, [loadPasses]),
  );

  const emptyMessage =
    passes.length === 0
      ? null
      : "No recurring visitor passes match your search or filters.";

  return (
    <AdminScrollScreen
      title="Recurring Visitor Passes"
      subtitle="Manage recurring staff and QR access for your society."
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
            onRefresh={() => void loadPasses(true)}
          />
        ) : undefined,
      }}
    >
      <Button
        label="Create Pass"
        onPress={() => router.push(CREATE_PASS_ROUTE)}
      />

      <TextField
        label="Search"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Name, mobile, type, flat or destination"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.filters}>
        {ADMIN_RECURRING_PASS_STATUS_FILTERS.map((filter) => {
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
                {formatAdminRecurringPassStatusFilter(filter)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SelectField
        label="Visitor type"
        value={typeFilter}
        options={ADMIN_RECURRING_PASS_TYPE_FILTERS}
        getOptionLabel={formatAdminRecurringPassTypeFilter}
        onChange={setTypeFilter}
      />

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading recurring visitor passes...</Text>
        </View>
      ) : filteredPasses.length === 0 ? (
        <View style={styles.centerState}>
          {passes.length === 0 ? (
            <>
              <Text style={styles.emptyTitle}>No recurring visitor passes yet.</Text>
              <Text style={styles.stateText}>
                Recurring passes for domestic help, drivers, milkmen and other
                regular visitors will appear here.
              </Text>
              <Button
                label="Create Pass"
                onPress={() => router.push(CREATE_PASS_ROUTE)}
              />
            </>
          ) : (
            <Text style={styles.stateText}>{emptyMessage}</Text>
          )}
        </View>
      ) : (
        <View style={styles.listContent}>
          {filteredPasses.map((item) => (
            <AdminRecurringPassCard
              key={item.id}
              item={item}
              onPress={() =>
                router.push(`/(admin)/recurring-passes/${item.id}` as Href)
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
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
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
  emptyTitle: {
    ...typography.subtitle,
    textAlign: "center",
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});

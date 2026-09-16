import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  ADMIN_RESIDENT_LIST_FILTERS,
  ARCHIVE_RESIDENT_EXPLANATION,
  ARCHIVE_RESIDENT_TITLE,
  REACTIVATE_RESIDENT_EXPLANATION,
  REACTIVATE_RESIDENT_TITLE,
  RESIDENT_ADDED_MESSAGE,
  RESIDENT_ARCHIVED_MESSAGE,
  RESIDENT_REACTIVATED_MESSAGE,
  RESIDENT_UPDATED_MESSAGE,
  buildArchiveResidentRequest,
  buildReactivateResidentRequest,
  filterAdminResidentsByStatus,
  filterResidentDirectoryItems,
  formatAdminResidentListFilter,
  type AdminResidentDirectoryItem,
  type AdminResidentListFilter,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminResidentCard } from "@/features/admin-residents/AdminResidentCard";
import { listAdminSocietyResidents } from "@/features/admin-residents/adminResidentDirectoryService";
import { mutateAdminResident } from "@/features/admin-residents/adminResidentMutationService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScreen } from "@/components/admin/AdminScreen";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

const ADD_RESIDENT_ROUTE = "/(admin)/residents/new" as Href;
const ADMIN_DASHBOARD_ROUTE = "/(admin)/dashboard" as Href;

type ConfirmAction = {
  type: "archive" | "reactivate";
  item: AdminResidentDirectoryItem;
};

function noticeMessage(notice: string | string[] | undefined): string | null {
  const value = Array.isArray(notice) ? notice[0] : notice;
  if (value === "added") {
    return RESIDENT_ADDED_MESSAGE;
  }
  if (value === "updated") {
    return RESIDENT_UPDATED_MESSAGE;
  }
  return null;
}

export default function AdminResidentManagementScreen() {
  const router = useRouter();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [residents, setResidents] = useState<AdminResidentDirectoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AdminResidentListFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    noticeMessage(notice),
  );
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const filteredResidents = useMemo(
    () =>
      filterResidentDirectoryItems(
        filterAdminResidentsByStatus(residents, statusFilter),
        searchQuery,
      ),
    [residents, searchQuery, statusFilter],
  );

  const loadResidents = useCallback(
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
        setResidents(await listAdminSocietyResidents(accessToken, jwtSocietyId));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load residents.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, jwtSocietyId],
  );

  useEffect(() => {
    void loadResidents();
  }, [loadResidents]);

  useEffect(() => {
    const message = noticeMessage(notice);
    if (message) {
      setSuccessMessage(message);
    }
  }, [notice]);

  const handleConfirmStatusChange = async () => {
    if (!confirmAction || !accessToken || isMutating) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);

    try {
      const request =
        confirmAction.type === "archive"
          ? buildArchiveResidentRequest(confirmAction.item.residentId)
          : buildReactivateResidentRequest(confirmAction.item.residentId);
      await mutateAdminResident(accessToken, request);
      setSuccessMessage(
        confirmAction.type === "archive"
          ? RESIDENT_ARCHIVED_MESSAGE
          : RESIDENT_REACTIVATED_MESSAGE,
      );
      setConfirmAction(null);
      await loadResidents(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update resident.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  if (confirmAction) {
    const isArchive = confirmAction.type === "archive";
    return (
      <AdminScrollScreen
        title={isArchive ? ARCHIVE_RESIDENT_TITLE : REACTIVATE_RESIDENT_TITLE}
        subtitle={
          isArchive ? ARCHIVE_RESIDENT_EXPLANATION : REACTIVATE_RESIDENT_EXPLANATION
        }
        footer={
          <View style={styles.confirmFooter}>
            <Button
              label={isArchive ? "Archive Resident" : "Reactivate"}
              loading={isMutating}
              disabled={isMutating}
              onPress={() => void handleConfirmStatusChange()}
            />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={isMutating}
              onPress={() => {
                if (!isMutating) {
                  setErrorMessage(null);
                  setConfirmAction(null);
                }
              }}
            />
          </View>
        }
      >
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        <InfoCard label="Flat Number" value={confirmAction.item.flatNumber} />
        <InfoCard label="Resident Name" value={confirmAction.item.residentName} />
      </AdminScrollScreen>
    );
  }

  return (
    <AdminScreen
      title="Resident Management"
      subtitle="Manage residents registered in your society."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          onPress={() => router.replace(ADMIN_DASHBOARD_ROUTE)}
        />
      }
    >
      <View style={styles.content}>
        <Button
          label="+ Add Resident"
          onPress={() => router.push(ADD_RESIDENT_ROUTE)}
        />

        <TextField
          label="Search"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, flat number or mobile"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.filters}>
          {ADMIN_RESIDENT_LIST_FILTERS.map((filter) => {
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
                  {formatAdminResidentListFilter(filter)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {successMessage ? <SuccessBanner message={successMessage} /> : null}
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading residents...</Text>
          </View>
        ) : filteredResidents.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateText}>
              {residents.length === 0
                ? "No residents found for your society."
                : statusFilter !== "all" && !searchQuery.trim()
                  ? `No ${formatAdminResidentListFilter(statusFilter).toLowerCase()} residents found.`
                  : "No residents match your search."}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void loadResidents(true)}
              />
            }
          >
            {filteredResidents.map((item) => (
              <AdminResidentCard
                key={item.id}
                item={item}
                onEdit={() =>
                  router.push(`/(admin)/residents/${item.id}` as Href)
                }
                onArchive={() => {
                  setSuccessMessage(null);
                  setConfirmAction({ type: "archive", item });
                }}
                onReactivate={() => {
                  setSuccessMessage(null);
                  setConfirmAction({ type: "reactivate", item });
                }}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
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
  },
  filterChipSelected: {
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
  },
  filterChipText: {
    ...typography.body,
    fontWeight: "600",
  },
  filterChipTextSelected: {
    color: colors.accent,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  centerState: {
    flex: 1,
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
  confirmFooter: {
    gap: spacing.sm,
  },
});

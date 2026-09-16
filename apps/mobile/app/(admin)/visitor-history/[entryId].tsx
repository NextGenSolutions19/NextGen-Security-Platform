import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  formatAdminVisitorCheckInAt,
  formatAdminVisitorCheckOutAt,
  formatVerificationMethod,
  formatVisitorCount,
  formatVisitorStatus,
  isGroupVisitorEntry,
  isRecurringServiceVisit,
  resolveAdminVisitorRecordedBy,
  resolveVisitRecurringVisitorTypeLabel,
  resolveVisitorDestinationLabel,
  resolveVisitorEntryTypeLabel,
  VISITOR_ENTRY_TYPE_LABELS,
  type AdminReportGuardOption,
  type VisitorListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminVisitorPhotoSection } from "@/features/admin-visitors/AdminVisitorPhotoSection";
import { getAdminSocietyVisitorEntry } from "@/features/admin-visitors/adminVisitorHistoryService";
import { listGuardAccounts } from "@/features/guard-management/guardManagementService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { colors, spacing, typography } from "@/constants/theme";

const HISTORY_ROUTE = "/(admin)/visitor-history" as Href;

export default function AdminVisitorDetailsScreen() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [item, setItem] = useState<VisitorListItem | null>(null);
  const [guards, setGuards] = useState<AdminReportGuardOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadEntry = useCallback(async () => {
    if (!accessToken || !jwtSocietyId || !entryId) {
      setIsLoading(false);
      setErrorMessage("Visitor record not found.");
      return;
    }

    try {
      const [found, guardAccounts] = await Promise.all([
        getAdminSocietyVisitorEntry(accessToken, jwtSocietyId, entryId),
        listGuardAccounts(accessToken).catch(() => []),
      ]);
      if (!found) {
        setItem(null);
        setErrorMessage("Visitor record not found.");
        return;
      }

      setItem(found);
      setGuards(
        guardAccounts.map((guard) => ({
          id: guard.id,
          loginId: guard.loginId,
          name: guard.guardName,
        })),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load visitor details.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, entryId, jwtSocietyId]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  if (isLoading) {
    return (
      <AdminScrollScreen
        title="Visitor Details"
        subtitle="Read-only visitor record for your society."
        footer={
          <Button
            label="Back to History"
            variant="secondary"
            onPress={() => router.replace(HISTORY_ROUTE)}
          />
        }
      >
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading visitor details...</Text>
        </View>
      </AdminScrollScreen>
    );
  }

  if (!item) {
    return (
      <AdminScrollScreen
        title="Visitor Details"
        subtitle="Read-only visitor record for your society."
        footer={
          <Button
            label="Back to History"
            variant="secondary"
            onPress={() => router.replace(HISTORY_ROUTE)}
          />
        }
      >
        <ErrorBanner message={errorMessage ?? "Visitor record not found."} />
      </AdminScrollScreen>
    );
  }

  const recordedBy = resolveAdminVisitorRecordedBy(
    item.createdByAppUserId,
    guards,
  );

  return (
    <AdminScrollScreen
      title="Visitor Details"
      subtitle="Read-only visitor record for your society."
      footer={
        <Button
          label="Back to History"
          variant="secondary"
          onPress={() => router.replace(HISTORY_ROUTE)}
        />
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      <AdminVisitorPhotoSection visitorEntryId={item.id} />
      {item.visitorName ? (
        <InfoCard label="Full Name" value={item.visitorName} />
      ) : null}
      <InfoCard label="Visitor Mobile" value={item.visitorMobile} />
      {isRecurringServiceVisit(item) ? (
        <>
          <InfoCard
            label="Entry Type"
            value={resolveVisitorEntryTypeLabel(item)}
          />
          {resolveVisitRecurringVisitorTypeLabel(item) ? (
            <InfoCard
              label="Visitor Type"
              value={resolveVisitRecurringVisitorTypeLabel(item)!}
            />
          ) : null}
        </>
      ) : (
        <InfoCard label="Purpose" value={item.purposeLabel || item.purpose} />
      )}
      <InfoCard label="Flat Number" value={resolveVisitorDestinationLabel(item)} />
      <InfoCard label="Resident" value={item.residentName ?? "—"} />
      <InfoCard
        label="Check-in"
        value={formatAdminVisitorCheckInAt(item.checkInAt)}
      />
      <InfoCard
        label="Check-out"
        value={formatAdminVisitorCheckOutAt(item.checkOutAt)}
      />
      <InfoCard label="Status" value={formatVisitorStatus(item.status)} />
      <InfoCard
        label="Verification"
        value={formatVerificationMethod(item.verificationMethod)}
      />
      <InfoCard label="Vehicle Number" value={item.vehicleNumber ?? "—"} />
      <InfoCard
        label="Entry"
        value={
          isGroupVisitorEntry(item)
            ? VISITOR_ENTRY_TYPE_LABELS.group
            : VISITOR_ENTRY_TYPE_LABELS.single
        }
      />
      {isGroupVisitorEntry(item) ? (
        <InfoCard
          label="Number of Visitors"
          value={formatVisitorCount(item.visitorCount)}
        />
      ) : null}
      {item.notes ? <InfoCard label="Notes" value={item.notes} /> : null}
      <Text style={styles.auditTitle}>Entry recorded by</Text>
      <InfoCard label="Guard ID" value={recordedBy.guardId} />
      {recordedBy.guardName ? (
        <InfoCard label="Guard Name" value={recordedBy.guardName} />
      ) : null}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  auditTitle: {
    ...typography.sectionTitle,
    color: colors.navy,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: spacing.sm,
  },
});

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  canAcknowledgeEmergency,
  canResolveEmergency,
  formatEmergencyStatus,
  formatEmergencyTypeLabel,
  formatIstTimestamp,
  formatIstTimestampOrDash,
  formatRaisedByLabel,
  type AdminEmergencyEvent,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  acknowledgeAdminEmergencyEvent,
  getAdminEmergencyEvent,
  markAdminEmergencyNotificationRead,
  resolveAdminEmergencyEvent,
} from "@/features/admin-emergency/adminEmergencyService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { colors, spacing, typography } from "@/constants/theme";

const LIST_ROUTE = "/(admin)/emergency-monitoring" as Href;

export default function AdminEmergencyEventDetailsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [event, setEvent] = useState<AdminEmergencyEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    if (!accessToken || !eventId) {
      setIsLoading(false);
      setErrorMessage("Emergency event not found.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const loaded = await getAdminEmergencyEvent(accessToken, eventId);
      setEvent(loaded);
      try {
        await markAdminEmergencyNotificationRead(accessToken, eventId);
      } catch {
        // Read receipts require the pending migration/function; details still load.
      }
    } catch (error) {
      setEvent(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load emergency details.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, eventId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  const handleAcknowledge = async () => {
    if (!accessToken || !eventId || isUpdating) {
      return;
    }
    setIsUpdating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      setEvent(await acknowledgeAdminEmergencyEvent(accessToken, eventId));
      setSuccessMessage("Emergency acknowledged.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to acknowledge emergency.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResolve = async () => {
    if (!accessToken || !eventId || isUpdating) {
      return;
    }
    setIsUpdating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      setEvent(await resolveAdminEmergencyEvent(accessToken, eventId));
      setSuccessMessage("Emergency resolved. The record remains in history.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to resolve emergency.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <AdminScrollScreen
      title="Emergency Details"
      subtitle="Acknowledge or resolve this society emergency."
      footer={
        <View style={styles.footer}>
          {event && canAcknowledgeEmergency(event.status) ? (
            <Button
              label="Acknowledge"
              loading={isUpdating}
              onPress={() => void handleAcknowledge()}
            />
          ) : null}
          {event && canResolveEmergency(event.status) ? (
            <Button
              label="Resolve"
              loading={isUpdating}
              onPress={() => void handleResolve()}
            />
          ) : null}
          <Button
            label="Back to Emergencies"
            variant="secondary"
            onPress={() => router.replace(LIST_ROUTE)}
          />
        </View>
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {successMessage ? <SuccessBanner message={successMessage} /> : null}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading emergency details...</Text>
        </View>
      ) : null}
      {event ? (
        <View style={styles.cards}>
          <InfoCard
            label="Type"
            value={formatEmergencyTypeLabel(event.emergencyType)}
          />
          <InfoCard label="Status" value={formatEmergencyStatus(event.status)} />
          <InfoCard
            label="Raised by"
            value={formatRaisedByLabel(event.raisedByLoginId)}
          />
          <InfoCard
            label="Raised at"
            value={formatIstTimestamp(event.raisedAt)}
          />
          <InfoCard
            label="Acknowledged at"
            value={formatIstTimestampOrDash(event.acknowledgedAt)}
          />
          <InfoCard
            label="Resolved at"
            value={formatIstTimestampOrDash(event.resolvedAt)}
          />
          <InfoCard label="Notes" value={event.notes?.trim() || "—"} />
        </View>
      ) : null}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: spacing.sm,
  },
  centerState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cards: {
    gap: spacing.md,
  },
});

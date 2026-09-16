import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import type { AdminEmergencyEvent } from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminEmergencyEventCard } from "@/features/admin-emergency/AdminEmergencyEventCard";
import { listAdminEmergencyEvents } from "@/features/admin-emergency/adminEmergencyService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { colors, spacing, typography } from "@/constants/theme";

const ADMIN_DASHBOARD_ROUTE = "/(admin)/dashboard" as Href;

export default function AdminEmergencyMonitoringScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [events, setEvents] = useState<AdminEmergencyEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadEvents = useCallback(
    async (refresh = false) => {
      if (!accessToken) {
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        setEvents(await listAdminEmergencyEvents(accessToken));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load emergency events.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  return (
    <AdminScrollScreen
      title="Emergency Monitoring"
      subtitle="Society emergency alerts raised by Guards."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          onPress={() => router.replace(ADMIN_DASHBOARD_ROUTE)}
        />
      }
      scrollViewProps={{
        refreshControl: (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadEvents(true)}
          />
        ),
      }}
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading emergency events...</Text>
        </View>
      ) : null}
      {!isLoading && events.length === 0 && !errorMessage ? (
        <Text style={styles.stateText}>No emergency events for your society.</Text>
      ) : null}
      <View style={styles.list}>
        {events.map((event) => (
          <AdminEmergencyEventCard
            key={event.id}
            item={event}
            onPress={() =>
              router.push(`/(admin)/emergency-monitoring/${event.id}` as Href)
            }
          />
        ))}
      </View>
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
});

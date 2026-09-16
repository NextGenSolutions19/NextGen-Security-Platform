import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  formatEmergencyStatus,
  formatIstTimestamp,
  type AdminEmergencyNotification,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  listAdminEmergencyNotifications,
  markAdminEmergencyNotificationRead,
} from "@/features/admin-emergency/adminEmergencyService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { colors, radius, spacing, typography } from "@/constants/theme";

const ADMIN_DASHBOARD_ROUTE = "/(admin)/dashboard" as Href;

export default function AdminNotificationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [notifications, setNotifications] = useState<AdminEmergencyNotification[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadNotifications = useCallback(
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
        setNotifications(await listAdminEmergencyNotifications(accessToken));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load notifications.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const openNotification = async (item: AdminEmergencyNotification) => {
    if (accessToken && item.unread) {
      try {
        await markAdminEmergencyNotificationRead(accessToken, item.emergencyEventId);
        setNotifications((current) =>
          current.map((notification) =>
            notification.id === item.id
              ? { ...notification, unread: false }
              : notification,
          ),
        );
      } catch {
        // Opening the event still works if mark-read fails after migration/function deploy.
      }
    }
    router.push(`/(admin)/emergency-monitoring/${item.emergencyEventId}` as Href);
  };

  return (
    <AdminScrollScreen
      title="Notifications"
      subtitle="Emergency alerts for your society."
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
            onRefresh={() => void loadNotifications(true)}
          />
        ),
      }}
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading notifications...</Text>
        </View>
      ) : null}
      {!isLoading && notifications.length === 0 && !errorMessage ? (
        <Text style={styles.stateText}>No emergency notifications yet.</Text>
      ) : null}
      <View style={styles.list}>
        {notifications.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => void openNotification(item)}
            style={({ pressed }) => [
              styles.card,
              item.unread ? styles.unreadCard : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.unreadLabel}>{item.unread ? "Unread" : "Read"}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.meta}>
              {formatEmergencyStatus(item.status)} · {formatIstTimestamp(item.createdAt)}
            </Text>
            <Text style={styles.actionHint}>Tap to open emergency</Text>
          </Pressable>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  unreadCard: {
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.92,
  },
  unreadLabel: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
  },
  title: {
    ...typography.subtitle,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
  },
  meta: {
    ...typography.caption,
  },
  actionHint: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
  },
});

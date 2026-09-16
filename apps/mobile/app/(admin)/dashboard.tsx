import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  ADMIN_DASHBOARD_MODULES,
  adminModuleAccent,
  adminModuleIcon,
  isAdminDashboardModuleActive,
  pushAdminRoute,
} from "@/features/admin-dashboard/adminDashboardModules";
import { AdminModuleCard } from "@/components/admin/AdminModuleCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

function getAdminGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 17) {
    return "Good afternoon";
  }
  return "Good evening";
}

function getDashboardItemWidth(screenWidth: number): `${number}%` {
  if (screenWidth >= 1080) {
    return "31%";
  }
  if (screenWidth >= 720) {
    return "48%";
  }
  return "100%";
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const user = session?.user;
  const { width } = useWindowDimensions();
  const itemWidth = getDashboardItemWidth(width);

  return (
    <AdminScrollScreen unstyled contentContainerStyle={styles.scrollContent}>
      <View style={[styles.heroCard, cardShadow()]}>
        <Text style={styles.greeting}>
          {getAdminGreeting()}
          {user ? `, ${user.loginId}` : ""}
        </Text>
        {user ? (
          <>
            <Text style={styles.societyLine}>
              {user.societyName} • {user.societyCode}
            </Text>
            <Text style={styles.roleLine}>
              {user.isAuthorizedAdmin ? "Authorized Society Administrator" : "Society Administrator"}
            </Text>
          </>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Management modules</Text>
        <Text style={styles.sectionCaption}>
          Access society administration tools from the control center.
        </Text>
      </View>

      <View style={styles.moduleGrid}>
        {ADMIN_DASHBOARD_MODULES.map((module) => {
          const isActive = isAdminDashboardModuleActive(module);
          return (
            <View
              key={module.id}
              style={[styles.moduleItem, { width: itemWidth }]}
            >
              <AdminModuleCard
                title={module.label}
                description={module.description}
                icon={adminModuleIcon(module.id)}
                accent={adminModuleAccent(module.id)}
                badge={module.badge}
                onPress={
                  isActive
                    ? () => pushAdminRoute(router as never, module.route)
                    : undefined
                }
              />
            </View>
          );
        })}
      </View>
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  greeting: {
    ...typography.title,
    fontSize: 24,
    color: colors.navy,
  },
  societyLine: {
    ...typography.body,
    fontSize: 16,
    color: colors.textSecondary,
  },
  roleLine: {
    ...typography.caption,
    fontSize: 14,
    color: colors.primaryBlue,
    fontWeight: "600",
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.subtitle,
    fontSize: 18,
    color: colors.navy,
  },
  sectionCaption: {
    ...typography.caption,
    fontSize: 14,
  },
  moduleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  moduleItem: {
    minWidth: 240,
    flexGrow: 1,
  },
});

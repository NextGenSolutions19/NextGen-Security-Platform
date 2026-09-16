import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  ADMIN_NAV_ITEMS,
  getAdminNavItemLabel,
  isAdminNavItemActive,
} from "@/features/admin-dashboard/adminNavigation";
import { colors, layout, radius, spacing, typography } from "@/constants/theme";

const ADMIN_DESKTOP_BREAKPOINT = 1024;
const SIDEBAR_WIDTH = 272;

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= ADMIN_DESKTOP_BREAKPOINT;
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = session?.user;

  const navigate = (route: string) => {
    setMenuOpen(false);
    router.push(route as never);
  };

  const sidebar = (
    <View style={[styles.sidebar, isDesktop ? styles.sidebarDesktop : styles.sidebarMobile]}>
      <View style={styles.sidebarBrand}>
        <View style={styles.brandIcon}>
          <Ionicons name="shield-checkmark" size={22} color={colors.teal} />
        </View>
        <View style={styles.brandText}>
          <Text style={styles.brandTitle}>NextGen Security</Text>
          <Text style={styles.brandSubtitle}>Admin Control Center</Text>
        </View>
      </View>

      {user ? (
        <View style={styles.contextBlock}>
          <Text style={styles.contextLogin} numberOfLines={1}>
            {user.loginId}
          </Text>
          <Text style={styles.contextSociety} numberOfLines={2}>
            {user.societyName}
          </Text>
          <Text style={styles.contextCode}>{user.societyCode}</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navList}
        showsVerticalScrollIndicator={false}
      >
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = isAdminNavItemActive(pathname, item.route);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => navigate(item.route)}
              style={({ pressed }) => [
                styles.navItem,
                active ? styles.navItemActive : null,
                pressed ? styles.navItemPressed : null,
              ]}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? "#FFFFFF" : "#CBD5E1"}
              />
              <Text style={[styles.navLabel, active ? styles.navLabelActive : null]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => [
          styles.signOutButton,
          pressed ? styles.navItemPressed : null,
        ]}
      >
        <Ionicons name="log-out-outline" size={22} color="#CBD5E1" />
        <Text style={styles.signOutLabel}>Sign Out</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.frame}>
        {isDesktop ? sidebar : null}

        <View style={styles.main}>
          {!isDesktop ? (
            <View style={[styles.mobileHeader, { paddingTop: spacing.xs }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open admin menu"
                onPress={() => setMenuOpen(true)}
                style={styles.menuButton}
              >
                <Ionicons name="menu-outline" size={24} color={colors.navy} />
              </Pressable>
              <View style={styles.mobileHeaderText}>
                <Text style={styles.mobileHeaderTitle}>
                  {getAdminNavItemLabel(pathname)}
                </Text>
                {user ? (
                  <Text style={styles.mobileHeaderMeta} numberOfLines={1}>
                    {user.societyCode}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.content}>{children}</View>
        </View>
      </View>

      {!isDesktop ? (
        <Modal
          visible={menuOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setMenuOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setMenuOpen(false)}
          />
          <View
            style={[
              styles.drawer,
              { paddingTop: Math.max(insets.top, spacing.md) },
            ]}
          >
            {sidebar}
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  frame: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  sidebarDesktop: {
    width: SIDEBAR_WIDTH,
    paddingTop: spacing.lg,
  },
  sidebarMobile: {
    flex: 1,
    paddingTop: spacing.sm,
  },
  sidebarBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    flex: 1,
    gap: 2,
  },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  brandSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
  },
  contextBlock: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  contextLogin: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  contextSociety: {
    color: "#CBD5E1",
    fontSize: 13,
  },
  contextCode: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "600",
  },
  navScroll: {
    flex: 1,
  },
  navList: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  navItemActive: {
    backgroundColor: colors.primaryBlue,
  },
  navItemPressed: {
    opacity: 0.88,
  },
  navLabel: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  navLabelActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: spacing.md,
  },
  signOutLabel: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "500",
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  mobileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  menuButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileHeaderText: {
    flex: 1,
    gap: 2,
  },
  mobileHeaderTitle: {
    ...typography.subtitle,
    fontSize: 17,
    color: colors.navy,
  },
  mobileHeaderMeta: {
    ...typography.caption,
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "84%",
    maxWidth: 320,
    backgroundColor: colors.navy,
  },
});

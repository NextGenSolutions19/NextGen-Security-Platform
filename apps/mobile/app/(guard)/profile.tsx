import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { UserRole } from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { colors, spacing, typography } from "@/constants/theme";

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "—";
}

function formatRole(role: UserRole | string | undefined): string {
  if (role === "guard") {
    return "Guard";
  }

  if (role === "society_admin") {
    return "Society Admin";
  }

  return displayValue(role);
}

export default function GuardProfileScreen() {
  const router = useRouter();
  const { session, isInitializing } = useAuth();
  const user = session?.user;

  return (
    <ScrollScreen
      title="Profile"
      subtitle="Your guard account details."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          onPress={() => router.back()}
        />
      }
    >
      {isInitializing ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading profile...</Text>
        </View>
      ) : !user ? (
        <ErrorBanner message="Unable to load your profile. Please sign in again." />
      ) : (
        <View style={styles.cards}>
          <InfoCard label="Login ID" value={displayValue(user.loginId)} />
          <InfoCard label="Role" value={formatRole(user.role)} />
          <InfoCard label="Society Name" value={displayValue(user.societyName)} />
          <InfoCard label="Society Code" value={displayValue(user.societyCode)} />
          {user.id ? (
            <Text style={styles.supportId}>Account ID: {user.id}</Text>
          ) : null}
        </View>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  cards: {
    gap: spacing.md,
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
  supportId: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { PLATFORM_NAME } from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { colors, spacing, typography } from "@/constants/theme";

export default function SplashScreen() {
  const { isInitializing } = useAuth();

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/icon.png")}
        style={styles.logo}
        accessibilityLabel="NextGen Security Platform logo"
      />
      <Text style={styles.title}>{PLATFORM_NAME}</Text>
      <Text style={styles.subtitle}>Society Security Management</Text>
      {isInitializing ? (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color={colors.primary}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: spacing.lg,
    borderRadius: 20,
  },
  title: {
    ...typography.title,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  loader: {
    marginTop: spacing.xl,
  },
});

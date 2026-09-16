import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  cardShadow,
  colors,
  layout,
  radius,
  spacing,
  typography,
} from "@/constants/theme";
import { ContentContainer } from "@/components/ui/ContentContainer";

interface AuthShellProps extends ViewProps {
  title: string;
  subtitle: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function AuthShell({
  title,
  subtitle,
  footer,
  children,
  style,
  ...props
}: AuthShellProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ContentContainer width="auth" style={[styles.wrapper, style]} {...props}>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Ionicons name="shield-checkmark" size={28} color={colors.teal} />
              </View>
              <View style={styles.brandText}>
                <Text style={styles.brandName}>NextGen Security Platform</Text>
                <Text style={styles.brandTagline}>
                  Secure society access for guards and administrators
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
              <View style={styles.form}>{children}</View>
              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </View>
          </ContentContainer>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.lightBlue,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  wrapper: {
    gap: spacing.lg,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  brandIcon: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow(),
  },
  brandText: {
    flex: 1,
    gap: spacing.xs,
  },
  brandName: {
    ...typography.brandTitle,
  },
  brandTagline: {
    ...typography.caption,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...cardShadow(),
  },
  title: {
    ...typography.title,
    fontSize: 22,
  },
  subtitle: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  form: {
    gap: spacing.md,
  },
  footer: {
    paddingTop: spacing.sm,
  },
});

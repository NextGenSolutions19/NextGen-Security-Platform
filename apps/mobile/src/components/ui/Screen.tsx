import { StyleSheet, Text, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ContentContainer } from "@/components/ui/ContentContainer";
import { colors, spacing, typography } from "@/constants/theme";

type ScreenWidth = "form" | "wide" | "full";

interface ScreenProps extends ViewProps {
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  contentWidth?: ScreenWidth;
}

export function Screen({
  title,
  subtitle,
  footer,
  children,
  style,
  contentWidth = "form",
  ...props
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, style]} {...props}>
        <ContentContainer width={contentWidth} style={styles.inner}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.content}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ContentContainer>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  inner: {
    flex: 1,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.caption,
    marginBottom: spacing.lg,
  },
  content: {
    flex: 1,
    gap: spacing.md,
  },
  footer: {
    paddingTop: spacing.md,
  },
});

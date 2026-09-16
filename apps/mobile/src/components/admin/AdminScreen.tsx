import { StyleSheet, Text, View, type ViewProps } from "react-native";
import { ContentContainer } from "@/components/ui/ContentContainer";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

type ScreenWidth = "form" | "wide" | "full";

interface AdminScreenProps extends ViewProps {
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  contentWidth?: ScreenWidth;
}

export function AdminScreen({
  title,
  subtitle,
  footer,
  children,
  style,
  contentWidth = "wide",
  ...props
}: AdminScreenProps) {
  return (
    <View style={styles.page}>
      <ContentContainer width={contentWidth} style={[styles.inner, style]} {...props}>
        {title || subtitle ? (
          <View style={styles.pageHeader}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}

        <View style={[styles.workspace, cardShadow(), styles.content]}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ContentContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  pageHeader: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.navy,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 14,
  },
  workspace: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  content: {
    flex: 1,
    gap: spacing.md,
  },
  footer: {
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
});

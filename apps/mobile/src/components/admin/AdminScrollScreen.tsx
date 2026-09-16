import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ContentContainer } from "@/components/ui/ContentContainer";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

interface AdminScrollScreenProps {
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode | null;
  children: React.ReactNode;
  contentWidth?: "form" | "wide" | "full";
  scrollViewProps?: Omit<
    ScrollViewProps,
    "children" | "style" | "contentContainerStyle" | "keyboardShouldPersistTaps"
  >;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Skip the inner workspace card — useful for dashboard layouts. */
  unstyled?: boolean;
}

export function AdminScrollScreen({
  title,
  subtitle,
  footer,
  children,
  contentWidth = "wide",
  scrollViewProps,
  contentContainerStyle,
  unstyled = false,
}: AdminScrollScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.page}>
      <ContentContainer width={contentWidth} style={styles.inner}>
        {title || subtitle ? (
          <View style={styles.pageHeader}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          {...scrollViewProps}
        >
          {unstyled ? (
            children
          ) : (
            <View style={[styles.workspace, cardShadow()]}>{children}</View>
          )}
        </ScrollView>

        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, spacing.md) },
            ]}
          >
            {footer}
          </View>
        ) : null}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  workspace: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
});

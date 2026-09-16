import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ContentContainer } from "@/components/ui/ContentContainer";
import { colors, spacing, typography } from "@/constants/theme";

type ScreenWidth = "form" | "wide" | "full";

interface ScrollScreenProps {
  title?: string;
  subtitle?: string;
  footer: React.ReactNode;
  children: React.ReactNode;
  contentWidth?: ScreenWidth;
  scrollViewProps?: Omit<
    ScrollViewProps,
    "children" | "style" | "contentContainerStyle" | "keyboardShouldPersistTaps"
  >;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function ScrollScreen({
  title,
  subtitle,
  footer,
  children,
  contentWidth = "form",
  scrollViewProps,
  contentContainerStyle,
}: ScrollScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <ContentContainer width={contentWidth} style={styles.inner}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
            keyboardShouldPersistTaps="handled"
            {...scrollViewProps}
          >
            {children}
          </ScrollView>

          <View
            style={[
              styles.fixedFooter,
              { paddingBottom: Math.max(insets.bottom, spacing.md) },
            ]}
          >
            {footer}
          </View>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  fixedFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: spacing.md,
  },
});

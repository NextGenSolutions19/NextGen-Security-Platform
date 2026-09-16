import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

export type StatusBadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info";

interface StatusBadgeProps {
  label: string;
  tone?: StatusBadgeTone;
}

const toneStyles: Record<
  StatusBadgeTone,
  { background: string; border: string; text: string }
> = {
  success: {
    background: colors.successBackground,
    border: colors.success,
    text: colors.success,
  },
  warning: {
    background: colors.warningBackground,
    border: colors.warning,
    text: colors.warning,
  },
  danger: {
    background: colors.errorBackground,
    border: colors.danger,
    text: colors.danger,
  },
  neutral: {
    background: colors.background,
    border: colors.border,
    text: colors.slate,
  },
  info: {
    background: colors.lightBlue,
    border: colors.primaryBlue,
    text: colors.primaryBlue,
  },
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  const palette = toneStyles[tone];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}
      accessibilityRole="text"
    >
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.caption,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});

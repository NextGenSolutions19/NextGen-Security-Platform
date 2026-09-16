import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface AdminFilterPanelProps {
  title?: string;
  children: React.ReactNode;
}

export function AdminFilterPanel({ title = "Filters", children }: AdminFilterPanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.navy,
  },
  content: {
    gap: spacing.sm,
  },
});

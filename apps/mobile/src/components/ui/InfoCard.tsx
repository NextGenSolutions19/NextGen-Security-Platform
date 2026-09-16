import { StyleSheet, Text, View } from "react-native";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

interface InfoCardProps {
  label: string;
  value: string;
}

export function InfoCard({ label, value }: InfoCardProps) {
  return (
    <View style={[styles.container, cardShadow()]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontWeight: "600",
  },
  value: {
    ...typography.subtitle,
  },
});

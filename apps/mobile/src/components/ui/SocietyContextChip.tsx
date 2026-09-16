import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface SocietyContextChipProps {
  societyName: string;
  societyCode: string;
}

export function SocietyContextChip({
  societyName,
  societyCode,
}: SocietyContextChipProps) {
  return (
    <View style={styles.chip} accessibilityRole="text">
      <Ionicons name="business-outline" size={18} color={colors.teal} />
      <View style={styles.textWrap}>
        <Text style={styles.name} numberOfLines={1}>
          {societyName}
        </Text>
        <Text style={styles.code}>{societyCode}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: colors.lightBlue,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textWrap: {
    flexShrink: 1,
    gap: 2,
  },
  name: {
    ...typography.label,
    fontSize: 13,
  },
  code: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: "600",
    color: colors.teal,
  },
});

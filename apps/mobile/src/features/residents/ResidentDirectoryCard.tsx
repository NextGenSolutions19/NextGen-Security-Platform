import { StyleSheet, Text, View } from "react-native";
import {
  formatResidentFlatLabel,
  formatResidentMobile,
  type ResidentDirectoryItem,
} from "@nextgen/shared";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

interface ResidentDirectoryCardProps {
  item: ResidentDirectoryItem;
}

export function ResidentDirectoryCard({ item }: ResidentDirectoryCardProps) {
  return (
    <View style={[styles.card, cardShadow()]} accessibilityRole="text">
      <Text style={styles.flatNumber}>
        {formatResidentFlatLabel(item.wingBuilding, item.flatNumber)}
      </Text>
      <Text style={styles.residentName}>{item.residentName}</Text>
      <Text style={styles.mobile}>{formatResidentMobile(item.mobile)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  flatNumber: {
    ...typography.subtitle,
    color: colors.navy,
  },
  residentName: {
    ...typography.body,
  },
  mobile: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

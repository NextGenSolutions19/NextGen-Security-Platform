import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatResidentFlatLabel,
  formatResidentMobile,
  formatResidentStatus,
  formatResidentType,
  formatWingBuilding,
  type AdminResidentDirectoryItem,
} from "@nextgen/shared";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { residentStatusTone } from "@/components/admin/adminStatusHelpers";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

interface AdminResidentCardProps {
  item: AdminResidentDirectoryItem;
  onEdit: () => void;
  onArchive?: () => void;
  onReactivate?: () => void;
}

export function AdminResidentCard({
  item,
  onEdit,
  onArchive,
  onReactivate,
}: AdminResidentCardProps) {
  const isArchived = item.status === "disabled";

  return (
    <View style={[styles.card, cardShadow()]}>
      <View style={styles.headerRow}>
        <Text style={styles.flatNumber}>
          {formatResidentFlatLabel(item.wingBuilding, item.flatNumber)}
        </Text>
        <StatusBadge
          label={formatResidentStatus(item.status).toUpperCase()}
          tone={residentStatusTone(isArchived)}
        />
      </View>
      <Text style={styles.residentName}>{item.residentName}</Text>
      <Text style={styles.detail}>Mobile: {formatResidentMobile(item.mobile)}</Text>
      <Text style={styles.detail}>
        Wing / Building: {formatWingBuilding(item.wingBuilding)}
      </Text>
      <Text style={styles.detail}>Type: {formatResidentType(item.residentType)}</Text>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => [
            styles.actionButton,
            styles.actionPrimary,
            pressed ? styles.actionPressed : null,
          ]}
        >
          <Text style={styles.actionPrimaryText}>Edit</Text>
        </Pressable>
        {isArchived ? (
          <Pressable
            accessibilityRole="button"
            onPress={onReactivate}
            style={({ pressed }) => [
              styles.actionButton,
              pressed ? styles.actionPressed : null,
            ]}
          >
            <Text style={styles.actionText}>Reactivate</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={onArchive}
            style={({ pressed }) => [
              styles.actionButton,
              pressed ? styles.actionPressed : null,
            ]}
          >
            <Text style={styles.actionText}>Archive</Text>
          </Pressable>
        )}
      </View>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  flatNumber: {
    ...typography.subtitle,
    color: colors.navy,
    flex: 1,
  },
  residentName: {
    ...typography.body,
    fontWeight: "600",
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  actionPrimary: {
    backgroundColor: colors.lightBlue,
    borderColor: colors.primaryBlue,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.text,
  },
  actionPrimaryText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primaryBlue,
  },
});

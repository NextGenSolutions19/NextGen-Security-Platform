import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatEmergencyStatus,
  formatEmergencyTypeLabel,
  formatIstTimestamp,
  formatRaisedByLabel,
  type AdminEmergencyEvent,
} from "@nextgen/shared";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

interface AdminEmergencyEventCardProps {
  item: AdminEmergencyEvent;
  onPress?: () => void;
}

function emergencyStatusTone(status: string): "danger" | "warning" | "success" | "neutral" {
  const normalized = status.toLowerCase();
  if (normalized.includes("open") || normalized.includes("raised")) {
    return "danger";
  }
  if (normalized.includes("ack")) {
    return "warning";
  }
  if (normalized.includes("resolved")) {
    return "success";
  }
  return "neutral";
}

export function AdminEmergencyEventCard({
  item,
  onPress,
}: AdminEmergencyEventCardProps) {
  const statusLabel = formatEmergencyStatus(item.status);

  const content = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.type}>{formatEmergencyTypeLabel(item.emergencyType)}</Text>
        <StatusBadge label={statusLabel} tone={emergencyStatusTone(statusLabel)} />
      </View>
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Raised by</Text>
          <Text style={styles.detailValue}>{formatRaisedByLabel(item.raisedByLoginId)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Raised at</Text>
          <Text style={styles.detailValue}>{formatIstTimestamp(item.raisedAt)}</Text>
        </View>
      </View>
      {onPress ? <Text style={styles.actionHint}>Tap to view details</Text> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.card, cardShadow()]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        cardShadow(),
        styles.cardPressable,
        pressed ? styles.cardPressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardPressable: {},
  cardPressed: {
    opacity: 0.92,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  type: {
    ...typography.subtitle,
    color: colors.navy,
    flex: 1,
  },
  details: {
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  detailLabel: {
    ...typography.caption,
    flex: 1,
  },
  detailValue: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
    textAlign: "right",
  },
  actionHint: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
  },
});

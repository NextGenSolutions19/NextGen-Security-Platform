import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatRecurringPassAllowedDaysSummary,
  formatRecurringPassAllowedTime,
  formatRecurringPassCalendarDate,
  formatRecurringPassEffectiveStatus,
  formatStoredRecurringVisitorType,
  type AdminRecurringVisitorPassListItem,
} from "@nextgen/shared";
import { RecurringPassPhotoAvatar } from "@/features/admin-recurring-passes/RecurringPassPhotoAvatar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { recurringPassStatusTone } from "@/components/admin/adminStatusHelpers";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

interface AdminRecurringPassCardProps {
  item: AdminRecurringVisitorPassListItem;
  onPress?: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function AdminRecurringPassCard({
  item,
  onPress,
}: AdminRecurringPassCardProps) {
  const allowedTime = formatRecurringPassAllowedTime(
    item.allowedEntryFromTime,
    item.allowedEntryToTime,
  );
  const destination = item.residentName
    ? `${item.destinationLabel} · ${item.residentName}`
    : item.destinationLabel;
  const statusLabel = formatRecurringPassEffectiveStatus(item);

  const content = (
    <>
      <View style={styles.header}>
        <RecurringPassPhotoAvatar
          visitorName={item.visitorName}
          passId={item.id}
          size="compact"
        />
        <View style={styles.headerText}>
          <Text style={styles.primaryIdentifier}>{item.visitorName}</Text>
          <Text style={styles.mobile}>{item.visitorMobile}</Text>
          <Text style={styles.visitorType}>
            {formatStoredRecurringVisitorType(item)}
          </Text>
        </View>
        <StatusBadge
          label={statusLabel}
          tone={recurringPassStatusTone(statusLabel)}
        />
      </View>

      <View style={styles.details}>
        <DetailRow label="Destination" value={destination || "—"} />
        <DetailRow
          label="Valid from"
          value={formatRecurringPassCalendarDate(item.validFrom)}
        />
        <DetailRow
          label="Valid until"
          value={formatRecurringPassCalendarDate(item.validUntil)}
        />
        <DetailRow
          label="Allowed days"
          value={formatRecurringPassAllowedDaysSummary(item.allowedDaysOfWeek)}
        />
        {allowedTime ? (
          <DetailRow label="Allowed time" value={allowedTime} />
        ) : null}
      </View>
      {onPress ? (
        <Text style={styles.actionHint}>Tap to view details</Text>
      ) : null}
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
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardPressable: {
    borderColor: colors.border,
  },
  cardPressed: {
    opacity: 0.92,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  primaryIdentifier: {
    ...typography.subtitle,
    color: colors.navy,
  },
  mobile: {
    ...typography.caption,
  },
  visitorType: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  details: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    flex: 1.4,
    textAlign: "right",
  },
  actionHint: {
    ...typography.caption,
    color: colors.primaryBlue,
    fontWeight: "600",
  },
});

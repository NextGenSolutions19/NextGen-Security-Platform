import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatCheckInAt,
  formatCheckOutAt,
  formatVerificationMethod,
  formatVisitorPartyLabel,
  formatVisitorStatus,
  isRecurringServiceVisit,
  resolveVisitRecurringVisitorTypeLabel,
  resolveVisitorDestinationLabel,
  resolveVisitorEntryTypeLabel,
  resolveVisitorPrimaryIdentifier,
  type VisitorListItem,
} from "@nextgen/shared";
import { VisitorPhotoDisplay } from "@/features/visitor/VisitorPhotoDisplay";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

interface VisitorListCardProps {
  item: VisitorListItem;
  onPress?: () => void;
  actionLabel?: string;
  /** Use larger photo on detail screens. */
  photoSize?: "compact" | "detail";
  showPhoto?: boolean;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function resolveStatusTone(
  status: VisitorListItem["status"],
): "success" | "danger" {
  return status === "checked_in" ? "success" : "danger";
}

function resolveStatusLabel(status: VisitorListItem["status"]): string {
  return status === "checked_in" ? "IN" : "OUT";
}

export function VisitorListCard({
  item,
  onPress,
  actionLabel,
  photoSize = "compact",
  showPhoto = true,
}: VisitorListCardProps) {
  const partyLabel = formatVisitorPartyLabel(item);
  const primaryIdentifier = resolveVisitorPrimaryIdentifier(item);
  const visitorName = item.visitorName?.trim() ?? "";
  const recurringVisit = isRecurringServiceVisit(item);
  const recurringVisitorType = resolveVisitRecurringVisitorTypeLabel(item);

  const content = (
    <>
      {showPhoto ? (
        <VisitorPhotoDisplay visitorEntryId={item.id} size={photoSize} />
      ) : null}
      <View style={styles.headerRow}>
        <View style={styles.headerMeta}>
          <StatusBadge
            label={resolveStatusLabel(item.status)}
            tone={resolveStatusTone(item.status)}
          />
          {partyLabel ? <Text style={styles.partyLabel}>{partyLabel}</Text> : null}
        </View>
      </View>

      <Text style={styles.primaryIdentifier}>{primaryIdentifier}</Text>
      {!recurringVisit ? (
        <Text style={styles.purpose}>{item.purposeLabel || item.purpose}</Text>
      ) : null}

      <View style={styles.details}>
        {recurringVisit ? (
          <DetailRow
            label="Entry Type"
            value={resolveVisitorEntryTypeLabel(item)}
          />
        ) : null}
        {recurringVisitorType ? (
          <DetailRow label="Visitor Type" value={recurringVisitorType} />
        ) : null}
        {visitorName ? (
          <DetailRow label="Mobile" value={item.visitorMobile} />
        ) : null}
        <DetailRow
          label="Destination"
          value={resolveVisitorDestinationLabel(item)}
        />
        {item.residentName ? (
          <DetailRow label="Resident" value={item.residentName} />
        ) : null}
        <DetailRow label="Check-in" value={formatCheckInAt(item.checkInAt)} />
        {item.checkOutAt ? (
          <DetailRow label="Check-out" value={formatCheckOutAt(item.checkOutAt)} />
        ) : null}
        {item.vehicleNumber ? (
          <DetailRow label="Vehicle" value={item.vehicleNumber} />
        ) : null}
        <DetailRow
          label="Verification"
          value={formatVerificationMethod(item.verificationMethod)}
        />
        <DetailRow label="Status" value={formatVisitorStatus(item.status)} />
      </View>

      {actionLabel ? (
        <Text style={styles.actionHint}>{actionLabel}</Text>
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
    borderColor: colors.primaryBlue,
  },
  cardPressed: {
    opacity: 0.92,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  headerMeta: {
    flex: 1,
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  partyLabel: {
    ...typography.caption,
    color: colors.primaryBlue,
    fontWeight: "700",
  },
  primaryIdentifier: {
    ...typography.subtitle,
  },
  purpose: {
    ...typography.body,
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
    flex: 1,
    textAlign: "right",
  },
  actionHint: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: "600",
  },
});

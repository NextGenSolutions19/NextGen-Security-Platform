import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatAdminVisitorCheckInAt,
  formatAdminVisitorCheckOutAt,
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VisitorPhotoDisplay } from "@/features/visitor/VisitorPhotoDisplay";
import {
  visitorStatusLabel,
  visitorStatusTone,
} from "@/components/admin/adminStatusHelpers";
import { cardShadow, colors, radius, spacing, typography } from "@/constants/theme";

interface AdminVisitorHistoryCardProps {
  item: VisitorListItem;
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

export function AdminVisitorHistoryCard({
  item,
  onPress,
}: AdminVisitorHistoryCardProps) {
  const partyLabel = formatVisitorPartyLabel(item);
  const primaryIdentifier = resolveVisitorPrimaryIdentifier(item);
  const visitorName = item.visitorName?.trim() ?? "";
  const recurringVisit = isRecurringServiceVisit(item);
  const recurringVisitorType = resolveVisitRecurringVisitorTypeLabel(item);

  const content = (
    <>
      <VisitorPhotoDisplay visitorEntryId={item.id} size="compact" />
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          {partyLabel ? <Text style={styles.partyLabel}>{partyLabel}</Text> : null}
          <Text style={styles.primaryIdentifier}>{primaryIdentifier}</Text>
          {!recurringVisit ? (
            <Text style={styles.purpose}>{item.purposeLabel || item.purpose}</Text>
          ) : null}
        </View>
        <StatusBadge
          label={visitorStatusLabel(item.status)}
          tone={visitorStatusTone(item.status)}
        />
      </View>

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
        <DetailRow
          label="Check-in"
          value={formatAdminVisitorCheckInAt(item.checkInAt)}
        />
        <DetailRow
          label="Check-out"
          value={formatAdminVisitorCheckOutAt(item.checkOutAt)}
        />
        {item.vehicleNumber ? (
          <DetailRow label="Vehicle" value={item.vehicleNumber} />
        ) : null}
        <DetailRow
          label="Verification"
          value={formatVerificationMethod(item.verificationMethod)}
        />
        <DetailRow label="Status" value={formatVisitorStatus(item.status)} />
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
        pressed ? styles.cardPressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardPressed: {
    opacity: 0.92,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  partyLabel: {
    ...typography.caption,
    color: colors.primaryBlue,
    fontWeight: "700",
  },
  primaryIdentifier: {
    ...typography.subtitle,
    color: colors.navy,
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
    color: colors.primaryBlue,
    fontWeight: "600",
  },
});

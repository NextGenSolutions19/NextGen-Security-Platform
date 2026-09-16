import { StyleSheet, Text, View } from "react-native";
import {
  REGISTRATION_MODE_LABELS,
  formatCheckInAt,
  formatCheckOutAt,
  formatFrequentVisitorEntryType,
  formatVerificationMethod,
  formatVisitorCount,
  formatVisitorStatus,
  resolveVisitorPrimaryIdentifier,
  type FrequentVisitorHistoryVisit,
} from "@nextgen/shared";
import { VisitorPhotoDisplay } from "@/features/visitor/VisitorPhotoDisplay";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface FrequentVisitorHistoryCardProps {
  visit: FrequentVisitorHistoryVisit;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function FrequentVisitorHistoryCard({
  visit,
}: FrequentVisitorHistoryCardProps) {
  const purpose = visit.purposeLabel || visit.purpose;
  const isGroup = visit.entryType === "group";
  const primaryIdentifier = resolveVisitorPrimaryIdentifier(visit);
  const visitorName = visit.visitorName?.trim() ?? "";

  return (
    <View style={styles.card}>
      <VisitorPhotoDisplay visitorEntryId={visit.id} size="compact" />
      <Text style={styles.primaryIdentifier}>{primaryIdentifier}</Text>
      <Text style={styles.purpose}>{purpose}</Text>
      <View style={styles.details}>
        {visitorName ? (
          <DetailRow label="Mobile" value={visit.visitorMobile} />
        ) : null}
        <DetailRow
          label="Entry Type"
          value={formatFrequentVisitorEntryType(visit.entryType)}
        />
        {isGroup ? (
          <DetailRow
            label="Number of Visitors"
            value={formatVisitorCount(visit.visitorCount)}
          />
        ) : null}
        <DetailRow label="Flat" value={visit.flatNumber || "—"} />
        {visit.residentName ? (
          <DetailRow label="Resident" value={visit.residentName} />
        ) : null}
        <DetailRow label="Check-in" value={formatCheckInAt(visit.checkInAt)} />
        {visit.status === "checked_out" && visit.checkOutAt ? (
          <DetailRow label="Check-out" value={formatCheckOutAt(visit.checkOutAt)} />
        ) : null}
        <DetailRow label="Status" value={formatVisitorStatus(visit.status)} />
        <DetailRow
          label="Verification"
          value={formatVerificationMethod(visit.verificationMethod)}
        />
        {visit.verificationMethod === "OTP_NOT_PERFORMED" ? (
          <DetailRow
            label="Registration"
            value={REGISTRATION_MODE_LABELS[visit.registrationMode]}
          />
        ) : null}
        {visit.customPurposeText ? (
          <DetailRow label="Other purpose" value={visit.customPurposeText} />
        ) : null}
        {visit.vehicleNumber ? (
          <DetailRow label="Vehicle" value={visit.vehicleNumber} />
        ) : null}
        {visit.idType ? <DetailRow label="ID type" value={visit.idType} /> : null}
        {visit.idNumber ? (
          <DetailRow label="ID number" value={visit.idNumber} />
        ) : null}
        {visit.notes ? <DetailRow label="Notes" value={visit.notes} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
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
});

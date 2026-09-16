import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatCheckInAt,
  formatFrequentVisitCount,
  formatFrequentVisitorPartyHint,
  resolveVisitorPrimaryIdentifier,
  type FrequentVisitorItem,
} from "@nextgen/shared";
import { VisitorPhotoDisplay } from "@/features/visitor/VisitorPhotoDisplay";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface FrequentVisitorCardProps {
  item: FrequentVisitorItem;
  onPress: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function FrequentVisitorCard({ item, onPress }: FrequentVisitorCardProps) {
  const partyHint = formatFrequentVisitorPartyHint(item);
  const primaryIdentifier = resolveVisitorPrimaryIdentifier({
    visitorName: item.lastVisitorName,
    visitorMobile: item.visitorMobile,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View history for ${primaryIdentifier}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <VisitorPhotoDisplay
        visitorEntryId={item.lastVisitorEntryId}
        size="compact"
      />
      <Text style={styles.primaryIdentifier}>{primaryIdentifier}</Text>
      <Text style={styles.visitCount}>
        {formatFrequentVisitCount(item.visitCount)}
      </Text>
      {partyHint ? <Text style={styles.partyHint}>{partyHint}</Text> : null}
      <View style={styles.details}>
        {item.lastVisitorName ? (
          <DetailRow label="Mobile" value={item.visitorMobile} />
        ) : null}
        <DetailRow label="Last visit" value={formatCheckInAt(item.lastVisitAt)} />
        <DetailRow label="Purpose" value={item.lastPurpose || "—"} />
        <DetailRow label="Flat" value={item.lastFlatNumber || "—"} />
        {item.lastResidentName ? (
          <DetailRow label="Resident" value={item.lastResidentName} />
        ) : null}
      </View>
      <Text style={styles.historyHint}>View History &gt;</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardPressed: {
    opacity: 0.92,
  },
  primaryIdentifier: {
    ...typography.subtitle,
  },
  visitCount: {
    ...typography.body,
    color: colors.textSecondary,
  },
  partyHint: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
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
  historyHint: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
  },
});

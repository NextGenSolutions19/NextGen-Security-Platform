import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  filterVisitorListItems,
  formatCheckInAt,
  formatCheckOutAt,
  formatVerificationMethod,
  formatVisitorCount,
  formatVisitorStatus,
  isGroupVisitorEntry,
  isRecurringServiceVisit,
  VISITOR_ENTRY_TYPE_LABELS,
  resolveVisitRecurringVisitorTypeLabel,
  resolveVisitorDestinationLabel,
  resolveVisitorEntryTypeLabel,
  type VisitorEntry,
  type VisitorListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { checkoutVisitor } from "@/features/visitor/checkoutService";
import { listCheckedInVisitors } from "@/features/visitor/visitorListService";
import { VisitorListCard } from "@/features/visitor/VisitorListCard";
import { VisitorPhotoDisplay } from "@/features/visitor/VisitorPhotoDisplay";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing, typography } from "@/constants/theme";

const GUARD_HOME_ROUTE = "/(guard)/home" as Href;

type CheckoutPhase = "list" | "confirm" | "success";

interface CheckoutSuccessState {
  entry: VisitorEntry;
  flatNumber: string;
  residentName: string | null;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [phase, setPhase] = useState<CheckoutPhase>("list");
  const [entries, setEntries] = useState<VisitorListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorListItem | null>(null);
  const [successState, setSuccessState] = useState<CheckoutSuccessState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredEntries = useMemo(
    () => filterVisitorListItems(entries, searchQuery),
    [entries, searchQuery],
  );

  const loadEntries = useCallback(
    async (refresh = false) => {
      if (!accessToken) {
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage(null);

      try {
        setEntries(await listCheckedInVisitors(accessToken));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load checked-in visitors.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const handleSelectVisitor = (visitor: VisitorListItem) => {
    setSelectedVisitor(visitor);
    setPhase("confirm");
    setErrorMessage(null);
  };

  const handleConfirmCheckout = async () => {
    if (!accessToken || !selectedVisitor || isSubmitting) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await checkoutVisitor(accessToken, selectedVisitor.id);
      if (result.alreadyCheckedOut) {
        setErrorMessage("This visitor has already been checked out.");
        setPhase("list");
        setSelectedVisitor(null);
        void loadEntries(true);
        return;
      }

      setSuccessState({
        entry: result.visitorEntry,
        flatNumber: resolveVisitorDestinationLabel(selectedVisitor),
        residentName: selectedVisitor.residentName,
      });
      setPhase("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to check out visitor.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (phase === "success" && successState) {
    const { entry, flatNumber, residentName } = successState;
    const isGroup = isGroupVisitorEntry(entry);

    return (
      <ScrollScreen
        title={isGroup ? "Group Checked Out" : "Visitor Checked Out"}
        subtitle={
          isGroup
            ? "The entire group has been checked out successfully."
            : "The visitor has been checked out successfully."
        }
        footer={
          <Button
            label="Back to Dashboard"
            onPress={() => router.replace(GUARD_HOME_ROUTE)}
          />
        }
      >
        <View style={styles.successCards}>
          <VisitorPhotoDisplay visitorEntryId={entry.id} size="detail" />
          {isGroup ? (
            <>
              <InfoCard label="Entry" value={VISITOR_ENTRY_TYPE_LABELS.group} />
              <InfoCard label="Number of Visitors" value={formatVisitorCount(entry.visitorCount)} />
            </>
          ) : null}
          <InfoCard label="Flat" value={flatNumber} />
          {entry.visitorName ? (
            <InfoCard label="Full Name" value={entry.visitorName} />
          ) : null}
          {residentName ? <InfoCard label="Resident" value={residentName} /> : null}
          <InfoCard
            label={isGroup ? "Primary / Contact Mobile" : "Visitor Mobile"}
            value={entry.visitorMobile}
          />
          {isRecurringServiceVisit(entry) ? (
            <>
              <InfoCard
                label="Entry Type"
                value={resolveVisitorEntryTypeLabel(entry)}
              />
              {resolveVisitRecurringVisitorTypeLabel(entry) ? (
                <InfoCard
                  label="Visitor Type"
                  value={resolveVisitRecurringVisitorTypeLabel(entry)!}
                />
              ) : null}
            </>
          ) : (
            <InfoCard label="Purpose" value={entry.purposeLabel || entry.purpose} />
          )}
          {entry.vehicleNumber ? (
            <InfoCard label="Vehicle" value={entry.vehicleNumber} />
          ) : null}
          <InfoCard label="Check-in" value={formatCheckInAt(entry.checkInAt)} />
          <InfoCard label="Check-out" value={formatCheckOutAt(entry.checkOutAt)} />
          <InfoCard
            label="Verification"
            value={formatVerificationMethod(entry.verificationMethod)}
          />
          <InfoCard label="Status" value={formatVisitorStatus(entry.status)} />
        </View>
      </ScrollScreen>
    );
  }

  if (phase === "confirm" && selectedVisitor) {
    const isGroup = isGroupVisitorEntry(selectedVisitor);

    return (
      <ScrollScreen
        title={isGroup ? "Checkout Group?" : "Checkout Visitor?"}
        subtitle={
          isGroup
            ? `This will check out all ${selectedVisitor.visitorCount} visitors in this group.`
            : "Confirm checkout for the selected visitor."
        }
        footer={
          <View style={styles.footerActions}>
            <Button
              label={isGroup ? "Confirm Group Checkout" : "Confirm Checkout"}
              variant="warning"
              loading={isSubmitting}
              disabled={isSubmitting}
              onPress={() => void handleConfirmCheckout()}
            />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={isSubmitting}
              onPress={() => {
                setPhase("list");
                setSelectedVisitor(null);
                setErrorMessage(null);
              }}
            />
          </View>
        }
      >
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        <VisitorListCard item={selectedVisitor} photoSize="detail" />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen
      title="Checkout"
      subtitle="Select a checked-in visitor to check out."
      footer={
        <Button label="Back to Dashboard" variant="secondary" onPress={() => router.back()} />
      }
      scrollViewProps={{
        refreshControl: !isLoading ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadEntries(true)}
          />
        ) : undefined,
      }}
    >
      <TextField
        label="Search"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Flat, mobile, name, purpose, vehicle"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading visitors...</Text>
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>
            {entries.length === 0
              ? "No visitors currently checked in."
              : "No visitors match your search."}
          </Text>
        </View>
      ) : (
        <View style={styles.listContent}>
          {filteredEntries.map((item) => (
            <VisitorListCard
              key={item.id}
              item={item}
              actionLabel="Tap to checkout"
              onPress={() => handleSelectVisitor(item)}
            />
          ))}
        </View>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: spacing.sm,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  footerActions: {
    gap: spacing.sm,
  },
  successCards: {
    gap: spacing.md,
  },
});

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  filterVisitorListItems,
  formatVisitorCount,
  isGroupVisitorEntry,
  VISITOR_ENTRY_TYPE_LABELS,
  type VisitorListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { listCheckedOutVisitors } from "@/features/visitor/visitorListService";
import { VisitorListCard } from "@/features/visitor/VisitorListCard";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing, typography } from "@/constants/theme";

type HistoryPhase = "list" | "detail";

export default function VisitorHistoryScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [phase, setPhase] = useState<HistoryPhase>("list");
  const [entries, setEntries] = useState<VisitorListItem[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<VisitorListItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
        setEntries(await listCheckedOutVisitors(accessToken));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load visitor history.",
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

  if (phase === "detail" && selectedEntry) {
    return (
      <ScrollScreen
        title="Visitor History"
        subtitle="Read-only visitor record details."
        footer={
          <Button
            label="Back to History"
            variant="secondary"
            onPress={() => {
              setPhase("list");
              setSelectedEntry(null);
            }}
          />
        }
      >
        <VisitorListCard item={selectedEntry} photoSize="detail" />
        {isGroupVisitorEntry(selectedEntry) ? (
          <>
            <InfoCard label="Entry" value={VISITOR_ENTRY_TYPE_LABELS.group} />
            <InfoCard
              label="Number of Visitors"
              value={formatVisitorCount(selectedEntry.visitorCount)}
            />
          </>
        ) : null}
        {selectedEntry.notes ? (
          <InfoCard label="Notes" value={selectedEntry.notes} />
        ) : null}
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen
      title="Visitor History"
      subtitle="Previous checked-out visitors for your society."
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
          <Text style={styles.stateText}>Loading visitor history...</Text>
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>
            {entries.length === 0
              ? "No checked-out visitor history yet."
              : "No history records match your search."}
          </Text>
        </View>
      ) : (
        <View style={styles.listContent}>
          {filteredEntries.map((item) => (
            <VisitorListCard
              key={item.id}
              item={item}
              actionLabel="Tap to view details"
              onPress={() => {
                setSelectedEntry(item);
                setPhase("detail");
              }}
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
});

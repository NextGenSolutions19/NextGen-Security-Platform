import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { filterVisitorListItems, type VisitorListItem } from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { listCheckedInVisitors } from "@/features/visitor/visitorListService";
import { VisitorListCard } from "@/features/visitor/VisitorListCard";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing, typography } from "@/constants/theme";

export default function VisitorListScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [entries, setEntries] = useState<VisitorListItem[]>([]);
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

  return (
    <Screen
      title="Visitor List"
      subtitle="Visitors currently checked in for your society."
      footer={
        <Button label="Back to Dashboard" variant="secondary" onPress={() => router.back()} />
      }
    >
      <View style={styles.content}>
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
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void loadEntries(true)}
              />
            }
          >
            {filteredEntries.map((item) => (
              <VisitorListCard key={item.id} item={item} />
            ))}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  centerState: {
    flex: 1,
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

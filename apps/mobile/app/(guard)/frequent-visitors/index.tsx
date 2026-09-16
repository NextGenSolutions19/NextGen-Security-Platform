import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  buildFrequentVisitorDetailsPath,
  filterFrequentVisitors,
  type FrequentVisitorItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { FrequentVisitorCard } from "@/features/visitor/FrequentVisitorCard";
import { listFrequentVisitors } from "@/features/visitor/frequentVisitorService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing, typography } from "@/constants/theme";

export default function FrequentVisitorsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [visitors, setVisitors] = useState<FrequentVisitorItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredVisitors = useMemo(
    () => filterFrequentVisitors(visitors, searchQuery),
    [visitors, searchQuery],
  );

  const loadVisitors = useCallback(
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
        setVisitors(await listFrequentVisitors(accessToken));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load frequent visitors.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadVisitors();
  }, [loadVisitors]);

  return (
    <Screen
      title="Frequent Visitors"
      subtitle="Repeat visitors in your society."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          onPress={() => router.back()}
        />
      }
    >
      <View style={styles.content}>
        <TextField
          label="Search"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Mobile, name, purpose, or flat"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
        />

        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading frequent visitors...</Text>
          </View>
        ) : filteredVisitors.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateText}>
              {visitors.length === 0
                ? "No frequent visitors yet. A visitor appears here after 2 or more visits."
                : "No frequent visitors match your search."}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void loadVisitors(true)}
              />
            }
          >
            {filteredVisitors.map((item) => (
              <FrequentVisitorCard
                key={item.visitorMobile}
                item={item}
                onPress={() =>
                  router.push(
                    buildFrequentVisitorDetailsPath(item.visitorMobile) as Href,
                  )
                }
              />
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

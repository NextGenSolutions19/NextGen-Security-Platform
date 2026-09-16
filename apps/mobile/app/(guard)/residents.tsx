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
import {
  filterResidentDirectoryItems,
  type ResidentDirectoryItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { ResidentDirectoryCard } from "@/features/residents/ResidentDirectoryCard";
import { listSocietyResidents } from "@/features/residents/residentDirectoryService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing, typography } from "@/constants/theme";

export default function GuardResidentsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [residents, setResidents] = useState<ResidentDirectoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredResidents = useMemo(
    () => filterResidentDirectoryItems(residents, searchQuery),
    [residents, searchQuery],
  );

  const loadResidents = useCallback(
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
        setResidents(await listSocietyResidents(accessToken));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load residents.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadResidents();
  }, [loadResidents]);

  return (
    <Screen
      title="Residents"
      subtitle="View residents in your society."
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
          placeholder="Search by flat, resident name or mobile"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading residents...</Text>
          </View>
        ) : filteredResidents.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateText}>
              {residents.length === 0
                ? "No residents found for your society."
                : "No residents match your search."}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void loadResidents(true)}
              />
            }
          >
            {filteredResidents.map((item) => (
              <ResidentDirectoryCard key={item.id} item={item} />
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

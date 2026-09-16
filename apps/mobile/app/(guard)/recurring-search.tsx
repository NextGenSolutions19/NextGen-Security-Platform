import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  GUARD_RECURRING_DEFAULT_FALLBACK_REASON,
  parseGuardRecurringSearchQuery,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { useGuardOnDutyRequired } from "@/features/duty/useGuardOnDutyRequired";
import { RecurringPassPhotoAvatar } from "@/features/admin-recurring-passes/RecurringPassPhotoAvatar";
import {
  searchGuardRecurringVisitors,
  validateGuardRecurringFallback,
  type GuardRecurringSearchItem,
} from "@/features/guard-recurring/guardRecurringService";
import { rememberPendingRecurringCheckin } from "@/features/guard-recurring/pendingRecurringCheckinStore";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

const QR_ROUTE = "/(guard)/recurring-qr" as Href;
const VERIFY_ROUTE = "/(guard)/recurring-verify" as Href;

export default function GuardRecurringSearchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const { isOffDuty, offDutyMessage } = useGuardOnDutyRequired(accessToken);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GuardRecurringSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");

  const search = async () => {
    const parsed = parseGuardRecurringSearchQuery(query);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }
    setErrorMessage(null);
    setIsSearching(true);
    setStatusText("Searching...");
    try {
      const results = await searchGuardRecurringVisitors(accessToken, parsed.query);
      setItems(results);
      setSearched(true);
      setStatusText(
        results.length === 0 ? "No recurring visitor found" : `${results.length} found`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to search recurring visitors.",
      );
      setStatusText("");
    } finally {
      setIsSearching(false);
    }
  };

  const select = async (item: GuardRecurringSearchItem) => {
    if (isOffDuty) {
      setErrorMessage(offDutyMessage);
      return;
    }
    setIsSelecting(true);
    setErrorMessage(null);
    try {
      const result = await validateGuardRecurringFallback(accessToken, item.passId);
      rememberPendingRecurringCheckin({
        source: "FALLBACK_SEARCH",
        token: null,
        passId: result.pass.passId,
        preview: result.pass,
      });
      router.push(
        `${VERIFY_ROUTE}?reason=${encodeURIComponent(GUARD_RECURRING_DEFAULT_FALLBACK_REASON)}` as Href,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to validate this recurring visitor.",
      );
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <ScrollScreen
      title="Forgot QR / Search"
      subtitle="Search your society's recurring visitors. Access rules still apply."
      footer={
        <Button
          label="Back to QR Scanner"
          variant="secondary"
          onPress={() => router.replace(QR_ROUTE)}
        />
      }
    >
      {isOffDuty ? <ErrorBanner message={offDutyMessage} /> : null}
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      <TextField
        label="Name or mobile"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      <Button
        label="Search"
        loading={isSearching}
        disabled={isSearching || isSelecting}
        onPress={() => void search()}
      />
      {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
      {isSelecting ? <ActivityIndicator color={colors.primary} /> : null}
      {searched && items.length === 0 ? (
        <Text style={styles.status}>No recurring visitor found</Text>
      ) : null}
      {items.map((item) => (
        <Pressable
          key={item.passId}
          accessibilityRole="button"
          style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
          onPress={() => void select(item)}
          disabled={isSelecting || isOffDuty}
        >
          <RecurringPassPhotoAvatar
            visitorName={item.visitorName}
            previewUri={item.photoSignedUrl}
            size="compact"
          />
          <View style={styles.cardBody}>
            <Text style={styles.name}>{item.visitorName}</Text>
            <Text style={styles.meta}>{item.visitorMobile}</Text>
            <Text style={styles.meta}>{item.visitorType}</Text>
            <Text style={styles.meta}>{item.destination}</Text>
            <Text style={styles.statusChip}>
              {item.effectiveStatus.toUpperCase()}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  status: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.92,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.subtitle,
  },
  meta: {
    ...typography.caption,
  },
  statusChip: {
    ...typography.caption,
    fontWeight: "700",
    marginTop: 4,
  },
});

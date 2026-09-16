import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  formatCheckInAt,
  formatFrequentVisitCount,
  formatVisitPurposeSummary,
  normalizeFrequentVisitorMobile,
  type FrequentVisitorHistoryVisit,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { FrequentVisitorHistoryCard } from "@/features/visitor/FrequentVisitorHistoryCard";
import { listFrequentVisitorHistory } from "@/features/visitor/frequentVisitorService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { colors, spacing, typography } from "@/constants/theme";

const FREQUENT_VISITORS_ROUTE = "/(guard)/frequent-visitors" as Href;

function decodeRouteMobile(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function FrequentVisitorDetailsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const params = useLocalSearchParams<{ mobile?: string | string[] }>();
  const routeMobile = Array.isArray(params.mobile)
    ? params.mobile[0]
    : params.mobile;
  const visitorMobile = normalizeFrequentVisitorMobile(
    decodeRouteMobile(routeMobile ?? ""),
  );

  const [visits, setVisits] = useState<FrequentVisitorHistoryVisit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const latestVisit = visits[0] ?? null;

  const goBackToList = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(FREQUENT_VISITORS_ROUTE);
  };

  const loadHistory = useCallback(async () => {
    if (!accessToken || !visitorMobile) {
      setVisits([]);
      setIsLoading(false);
      setErrorMessage(
        visitorMobile ? null : "Visitor mobile number is missing.",
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      setVisits(await listFrequentVisitorHistory(accessToken, visitorMobile));
    } catch (error) {
      setVisits([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load visit history.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, visitorMobile]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <ScrollScreen
      title="Frequent Visitor Details"
      subtitle="Complete visit history for this mobile number."
      footer={
        <Button
          label="Back to Frequent Visitors"
          variant="secondary"
          onPress={goBackToList}
        />
      }
    >
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading visit history...</Text>
        </View>
      ) : (
        <>
          {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

          {visitorMobile ? (
            <View style={styles.summary}>
              <Text style={styles.badge}>Frequent Visitor</Text>
              {latestVisit?.visitorName ? (
                <InfoCard label="Full Name" value={latestVisit.visitorName} />
              ) : null}
              <InfoCard label="Mobile Number" value={visitorMobile} />
              <InfoCard
                label="Total Visits"
                value={formatFrequentVisitCount(visits.length)}
              />
              {latestVisit ? (
                <>
                  <InfoCard
                    label="Latest Visit"
                    value={formatCheckInAt(latestVisit.checkInAt)}
                  />
                  <InfoCard
                    label="Latest Purpose"
                    value={formatVisitPurposeSummary(latestVisit)}
                  />
                </>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Visit History</Text>

          {visits.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={styles.stateText}>
                No visit history found for this visitor in your society.
              </Text>
            </View>
          ) : (
            visits.map((visit) => (
              <FrequentVisitorHistoryCard key={visit.id} visit={visit} />
            ))
          )}
        </>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.md,
  },
  badge: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
  },
  sectionTitle: {
    ...typography.subtitle,
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

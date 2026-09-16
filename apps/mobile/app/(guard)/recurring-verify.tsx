import { useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  GUARD_RECURRING_DEFAULT_FALLBACK_REASON,
  parseGuardFallbackReason,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { useGuardOnDutyRequired } from "@/features/duty/useGuardOnDutyRequired";
import { RecurringPassPhotoAvatar } from "@/features/admin-recurring-passes/RecurringPassPhotoAvatar";
import { checkinGuardRecurringVisitor } from "@/features/guard-recurring/guardRecurringService";
import {
  clearPendingRecurringCheckin,
  peekPendingRecurringCheckin,
} from "@/features/guard-recurring/pendingRecurringCheckinStore";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { TextField } from "@/components/ui/TextField";
import { colors, typography } from "@/constants/theme";

const LIST_ROUTE = "/(guard)/visitor-list" as Href;
const QR_ROUTE = "/(guard)/recurring-qr" as Href;

export default function GuardRecurringVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reason?: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const { isOffDuty, offDutyMessage } = useGuardOnDutyRequired(accessToken);
  const pending = peekPendingRecurringCheckin();
  const [reason, setReason] = useState(
    params.reason || GUARD_RECURRING_DEFAULT_FALLBACK_REASON,
  );
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isFallback = pending?.source === "FALLBACK_SEARCH";
  const preview = pending?.preview;
  const subtitle = useMemo(
    () =>
      isFallback
        ? "Verify the visitor, enter a Forgot QR reason, then check in."
        : "Verify the visitor photo and details, then check in.",
    [isFallback],
  );

  const checkIn = async () => {
    if (!pending || !accessToken) {
      setErrorMessage("Visitor verification expired. Scan or search again.");
      return;
    }
    if (isOffDuty) {
      setErrorMessage(offDutyMessage);
      return;
    }

    if (isFallback) {
      const parsed = parseGuardFallbackReason(reason);
      if (!parsed.ok) {
        setReasonError(parsed.message);
        return;
      }
      setReasonError(null);
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (pending.source === "FALLBACK_SEARCH") {
        if (!pending.passId) {
          throw new Error("Visitor verification expired. Search again.");
        }
        await checkinGuardRecurringVisitor(accessToken, {
          source: "FALLBACK_SEARCH",
          passId: pending.passId,
          fallbackReason: reason.trim(),
        });
      } else {
        if (!pending.token) {
          throw new Error("Visitor verification expired. Scan again.");
        }
        await checkinGuardRecurringVisitor(accessToken, {
          source: pending.source,
          token: pending.token,
        });
      }
      clearPendingRecurringCheckin();
      setSuccessMessage("Check-in successful");
      setTimeout(() => {
        router.replace(LIST_ROUTE);
      }, 400);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to check in this recurring visitor.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!preview) {
    return (
      <ScrollScreen
        title="Visitor Verification"
        subtitle="Scan or search again."
        footer={
          <Button
            label="Back to QR Scanner"
            variant="secondary"
            onPress={() => router.replace(QR_ROUTE)}
          />
        }
      >
        <ErrorBanner message="Visitor verification expired. Scan or search again." />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen
      title="Visitor Verification"
      subtitle={subtitle}
      footer={
        <>
          <Button
            label="Check-In"
            loading={isSaving}
            disabled={isSaving || isOffDuty}
            onPress={() => void checkIn()}
          />
          <Button
            label="Cancel"
            variant="secondary"
            disabled={isSaving}
            style={styles.stacked}
            onPress={() => {
              clearPendingRecurringCheckin();
              router.replace(QR_ROUTE);
            }}
          />
        </>
      }
    >
      {isOffDuty ? <ErrorBanner message={offDutyMessage} /> : null}
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {successMessage ? <SuccessBanner message={successMessage} /> : null}
      <RecurringPassPhotoAvatar
        visitorName={preview.visitorName}
        previewUri={preview.photoSignedUrl}
        size="detail"
        enableFullPreview
      />
      <Text style={styles.hint}>
        Confirm this is the same person before check-in.
      </Text>
      <InfoCard label="Full name" value={preview.visitorName} />
      <InfoCard label="Mobile" value={preview.visitorMobile} />
      <InfoCard label="Visitor type" value={preview.visitorType} />
      <InfoCard label="Destination" value={preview.destination} />
      {preview.vehicleNumber ? (
        <InfoCard label="Vehicle" value={preview.vehicleNumber} />
      ) : null}
      <InfoCard label="Valid until" value={preview.validUntil} />
      <InfoCard label="Allowed days" value={preview.allowedDays} />
      <InfoCard label="Allowed time" value={preview.allowedTime} />
      {isFallback ? (
        <TextField
          label="Forgot QR reason"
          value={reason}
          onChangeText={setReason}
          error={reasonError ?? undefined}
        />
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  stacked: {
    marginTop: 8,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

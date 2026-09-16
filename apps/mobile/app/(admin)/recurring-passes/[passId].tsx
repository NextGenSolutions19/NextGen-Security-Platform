import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  RECURRING_PASS_QR_ASSIGNMENT_WARNING,
  RECURRING_PASS_REVOKE_WARNING,
  formatRecurringPassAllowedDaysSummary,
  formatRecurringPassAllowedTime,
  formatRecurringPassCalendarDate,
  formatRecurringPassEffectiveStatus,
  formatStoredRecurringVisitorType,
  parseRequiredRecurringPassReason,
  resolveRecurringPassAdminActions,
  type AdminRecurringVisitorPassListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { RecurringPassPhotoAvatar } from "@/features/admin-recurring-passes/RecurringPassPhotoAvatar";
import { AdminConfirmModal } from "@/features/admin-recurring-passes/AdminConfirmModal";
import {
  forgetIssuedRecurringPassQrToken,
  peekIssuedRecurringPassQrToken,
  rememberIssuedRecurringPassQrToken,
} from "@/features/admin-recurring-passes/issuedRecurringPassQrStore";
import {
  getAdminRecurringPassQrStatus,
  getAdminSocietyRecurringPass,
  issueAdminRecurringPassQr,
  reactivateAdminRecurringPass,
  replaceAdminRecurringPassQr,
  revokeAdminRecurringPass,
  suspendAdminRecurringPass,
} from "@/features/admin-recurring-passes/adminRecurringPassService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { colors, spacing, typography } from "@/constants/theme";

const LIST_ROUTE = "/(admin)/recurring-passes" as Href;

type ConfirmKind = "issue" | "replace" | "suspend" | "reactivate" | "revoke" | null;

export default function AdminRecurringPassDetailsScreen() {
  const router = useRouter();
  const { passId } = useLocalSearchParams<{ passId: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [item, setItem] = useState<AdminRecurringVisitorPassListItem | null>(null);
  const [hasActiveCredential, setHasActiveCredential] = useState(false);
  const [hasSessionQrToken, setHasSessionQrToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const loadPass = useCallback(async () => {
    if (!accessToken || !jwtSocietyId || !passId) {
      setIsLoading(false);
      setErrorMessage("Recurring visitor pass not found.");
      return;
    }

    try {
      const found = await getAdminSocietyRecurringPass(
        accessToken,
        jwtSocietyId,
        passId,
      );
      if (!found) {
        setItem(null);
        setErrorMessage("Recurring visitor pass not found.");
        return;
      }

      const status = await getAdminRecurringPassQrStatus(accessToken, passId);
      if (!status.hasActiveCredential) {
        forgetIssuedRecurringPassQrToken(passId);
      }
      setItem(found);
      setHasActiveCredential(status.hasActiveCredential);
      setHasSessionQrToken(
        Boolean(status.hasActiveCredential && peekIssuedRecurringPassQrToken(passId)),
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load recurring visitor pass details.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, jwtSocietyId, passId]);

  useFocusEffect(
    useCallback(() => {
      void loadPass();
    }, [loadPass]),
  );

  const closeConfirm = () => {
    setConfirmKind(null);
    setReason("");
    setReasonError(null);
  };

  const openQrScreen = (issuedPassId: string) => {
    router.push(`/(admin)/recurring-passes/qr?passId=${issuedPassId}` as Href);
  };

  const runConfirmedAction = async () => {
    if (!item || !accessToken) {
      return;
    }

    if (confirmKind === "suspend" || confirmKind === "revoke") {
      const parsed = parseRequiredRecurringPassReason(reason);
      if (!parsed.ok) {
        setReasonError(parsed.message);
        return;
      }
      setReasonError(null);
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (confirmKind === "issue") {
        const issued = await issueAdminRecurringPassQr(accessToken, item.id);
        rememberIssuedRecurringPassQrToken(issued.passId, issued.token);
        closeConfirm();
        openQrScreen(issued.passId);
        return;
      }
      if (confirmKind === "replace") {
        const issued = await replaceAdminRecurringPassQr(accessToken, item.id);
        rememberIssuedRecurringPassQrToken(issued.passId, issued.token);
        closeConfirm();
        openQrScreen(issued.passId);
        return;
      }
      if (confirmKind === "suspend") {
        await suspendAdminRecurringPass(accessToken, item.id, reason.trim());
      } else if (confirmKind === "reactivate") {
        await reactivateAdminRecurringPass(accessToken, item.id);
      } else if (confirmKind === "revoke") {
        await revokeAdminRecurringPass(accessToken, item.id, reason.trim());
        forgetIssuedRecurringPassQrToken(item.id);
      }
      closeConfirm();
      await loadPass();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the recurring visitor pass.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminScrollScreen
        title="Pass Details"
        subtitle="Read-only recurring visitor pass."
        footer={
          <Button
            label="Back to Recurring Passes"
            variant="secondary"
            onPress={() => router.replace(LIST_ROUTE)}
          />
        }
      >
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading pass details...</Text>
        </View>
      </AdminScrollScreen>
    );
  }

  if (!item) {
    return (
      <AdminScrollScreen
        title="Pass Details"
        subtitle="Read-only recurring visitor pass."
        footer={
          <Button
            label="Back to Recurring Passes"
            variant="secondary"
            onPress={() => router.replace(LIST_ROUTE)}
          />
        }
      >
        <ErrorBanner message={errorMessage ?? "Recurring visitor pass not found."} />
      </AdminScrollScreen>
    );
  }

  const allowedTime = formatRecurringPassAllowedTime(
    item.allowedEntryFromTime,
    item.allowedEntryToTime,
  );
  const actions = resolveRecurringPassAdminActions({
    ...item,
    hasActiveCredential,
    hasSessionQrToken,
  });

  return (
    <AdminScrollScreen
      title="Pass Details"
      subtitle="Recurring visitor pass for your society."
      footer={
        <Button
          label="Back to Recurring Passes"
          variant="secondary"
          onPress={() => router.replace(LIST_ROUTE)}
        />
      }
      contentContainerStyle={styles.content}
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      <View style={styles.photoRow}>
        <RecurringPassPhotoAvatar
          visitorName={item.visitorName}
          passId={item.id}
          size="detail"
          enableFullPreview
        />
        <Text style={styles.photoHint}>
          Tap the photo to view it full size. Signed photo URLs stay private and expire quickly.
        </Text>
      </View>
      <InfoCard label="Visitor name" value={item.visitorName} />
      <InfoCard label="Mobile" value={item.visitorMobile} />
      <InfoCard
        label="Visitor type"
        value={formatStoredRecurringVisitorType(item)}
      />
      <InfoCard label="Status" value={formatRecurringPassEffectiveStatus(item)} />
      <InfoCard
        label="Destination"
        value={item.destinationLabel || "—"}
      />
      {item.residentName ? (
        <InfoCard label="Resident" value={item.residentName} />
      ) : null}
      <InfoCard
        label="Valid from"
        value={formatRecurringPassCalendarDate(item.validFrom)}
      />
      <InfoCard
        label="Valid until"
        value={formatRecurringPassCalendarDate(item.validUntil)}
      />
      <InfoCard
        label="Allowed days"
        value={formatRecurringPassAllowedDaysSummary(item.allowedDaysOfWeek)}
      />
      {allowedTime ? (
        <InfoCard label="Allowed time" value={allowedTime} />
      ) : null}
      {item.vehicleNumber ? (
        <InfoCard label="Vehicle" value={item.vehicleNumber} />
      ) : null}
      {item.notes ? <InfoCard label="Notes" value={item.notes} /> : null}
      {item.status !== "revoked" ? (
        <View style={styles.actions}>
          {actions.issueQr ? (
            <Button label="Issue QR Pass" onPress={() => setConfirmKind("issue")} />
          ) : null}
          {actions.viewIssuedQr ? (
            <Button
              label="View QR"
              variant="secondary"
              onPress={() => openQrScreen(item.id)}
            />
          ) : null}
          {actions.replaceQr ? (
            <Button
              label="Generate New QR"
              variant={actions.issueQr || actions.viewIssuedQr ? "secondary" : "primary"}
              onPress={() => setConfirmKind("replace")}
            />
          ) : null}
          {actions.editSchedule ? (
            <Button
              label="Edit Access Schedule"
              variant="secondary"
              onPress={() =>
                router.push(
                  `/(admin)/recurring-passes/edit-schedule?passId=${item.id}` as Href,
                )
              }
            />
          ) : null}
          {actions.renew ? (
            <Button
              label="Renew / Extend Validity"
              variant="secondary"
              onPress={() =>
                router.push(
                  `/(admin)/recurring-passes/renew-validity?passId=${item.id}` as Href,
                )
              }
            />
          ) : null}
          {actions.suspend ? (
            <Button
              label="Suspend Pass"
              variant="secondary"
              onPress={() => setConfirmKind("suspend")}
            />
          ) : null}
          {actions.reactivate ? (
            <Button
              label="Reactivate Pass"
              onPress={() => setConfirmKind("reactivate")}
            />
          ) : null}
          {actions.revoke ? (
            <Button
              label="Revoke Pass"
              variant="secondary"
              onPress={() => setConfirmKind("revoke")}
            />
          ) : null}
        </View>
      ) : (
        <Text style={styles.readOnly}>
          This pass is revoked and remains visible for audit history only.
        </Text>
      )}
      <AdminConfirmModal
        visible={confirmKind === "issue"}
        title="Issue QR Pass"
        message="Issue a secure QR credential for this recurring visitor?"
        warning={RECURRING_PASS_QR_ASSIGNMENT_WARNING}
        confirmLabel="Issue QR"
        isSubmitting={isSubmitting}
        onCancel={closeConfirm}
        onConfirm={() => void runConfirmedAction()}
      />
      <AdminConfirmModal
        visible={confirmKind === "replace"}
        title="Generate New QR"
        message="The previous QR will stop working immediately. A new credential will be issued."
        confirmLabel="Replace QR"
        isSubmitting={isSubmitting}
        onCancel={closeConfirm}
        onConfirm={() => void runConfirmedAction()}
      />
      <AdminConfirmModal
        visible={confirmKind === "suspend"}
        title="Suspend Pass"
        message="Suspend this pass? The existing QR stays assigned but must not grant entry while suspended."
        confirmLabel="Suspend Pass"
        requireReason
        reasonLabel="Reason"
        reasonValue={reason}
        reasonError={reasonError}
        isSubmitting={isSubmitting}
        onChangeReason={setReason}
        onCancel={closeConfirm}
        onConfirm={() => void runConfirmedAction()}
      />
      <AdminConfirmModal
        visible={confirmKind === "reactivate"}
        title="Reactivate Pass"
        message="Reactivate this pass? The existing QR stays assigned and current validity rules still apply."
        confirmLabel="Reactivate Pass"
        isSubmitting={isSubmitting}
        onCancel={closeConfirm}
        onConfirm={() => void runConfirmedAction()}
      />
      <AdminConfirmModal
        visible={confirmKind === "revoke"}
        title="Revoke Pass"
        message="Revoke this recurring visitor pass?"
        warning={RECURRING_PASS_REVOKE_WARNING}
        confirmLabel="Revoke Pass"
        requireReason
        reasonLabel="Reason"
        reasonValue={reason}
        reasonError={reasonError}
        isSubmitting={isSubmitting}
        onChangeReason={setReason}
        onCancel={closeConfirm}
        onConfirm={() => void runConfirmedAction()}
      />
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  photoHint: {
    ...typography.caption,
    flex: 1,
  },
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  readOnly: {
    ...typography.caption,
    color: colors.textSecondary,
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

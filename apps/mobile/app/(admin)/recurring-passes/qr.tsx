import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import {
  RECURRING_PASS_QR_ASSIGNMENT_WARNING,
  RECURRING_PASS_QR_CANNOT_RECOVER_MESSAGE,
  RECURRING_PASS_QR_SCREEN_TITLE,
  RECURRING_PASS_SUSPENDED_QR_WARNING,
  formatRecurringPassCalendarDate,
  formatRecurringPassEffectiveStatus,
  formatStoredRecurringVisitorType,
  resolveAdminRecurringPassEffectiveStatus,
  resolveRecurringPassAdminActions,
  type AdminRecurringVisitorPassListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { RecurringPassPhotoAvatar } from "@/features/admin-recurring-passes/RecurringPassPhotoAvatar";
import {
  getAdminRecurringPassQrStatus,
  getAdminSocietyRecurringPass,
  replaceAdminRecurringPassQr,
} from "@/features/admin-recurring-passes/adminRecurringPassService";
import { AdminConfirmModal } from "@/features/admin-recurring-passes/AdminConfirmModal";
import {
  peekIssuedRecurringPassQrToken,
  rememberIssuedRecurringPassQrToken,
} from "@/features/admin-recurring-passes/issuedRecurringPassQrStore";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { colors, spacing, typography } from "@/constants/theme";

function detailsRoute(passId: string): Href {
  return `/(admin)/recurring-passes/${passId}` as Href;
}

type QrHandle = {
  toDataURL: (callback: (data: string) => void) => void;
};

function dataUrlToBase64(data: string): string {
  return data.includes(",") ? data.split(",")[1] ?? "" : data;
}

export default function AdminRecurringPassQrScreen() {
  const router = useRouter();
  const { passId } = useLocalSearchParams<{ passId: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";
  const qrRef = useRef<QrHandle | null>(null);

  const [item, setItem] = useState<AdminRecurringVisitorPassListItem | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hasActiveCredential, setHasActiveCredential] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !jwtSocietyId || !passId) {
      setIsLoading(false);
      setErrorMessage("Recurring visitor pass not found.");
      return;
    }

    setIsLoading(true);
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
      setItem(found);
      setHasActiveCredential(status.hasActiveCredential);
      setToken(
        status.hasActiveCredential
          ? peekIssuedRecurringPassQrToken(passId)
          : null,
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the recurring visitor QR pass.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, jwtSocietyId, passId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const exportQrImage = async (
    mode: "share" | "save",
  ): Promise<void> => {
    if (!qrRef.current || !item) {
      return;
    }

    setIsSharing(true);
    setErrorMessage(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        try {
          qrRef.current?.toDataURL((data) => resolve(data));
        } catch (error) {
          reject(error);
        }
      });
      const base64 = dataUrlToBase64(dataUrl);
      if (!base64) {
        throw new Error("Unable to export the QR image.");
      }

      if (Platform.OS === "web") {
        const webDocument = (
          globalThis as {
            document?: {
              createElement: (tag: string) => {
                href: string;
                download: string;
                click: () => void;
              };
            };
          }
        ).document;
        if (!webDocument) {
          throw new Error("Unable to save the QR image on this browser.");
        }
        const anchor = webDocument.createElement("a");
        anchor.href = `data:image/png;base64,${base64}`;
        anchor.download = "recurring-visitor-qr.png";
        anchor.click();
        return;
      }

      const FileSystem = await import("expo-file-system");
      const Sharing = await import("expo-sharing");
      const path = `${FileSystem.cacheDirectory}recurring-visitor-qr.png`;
      await FileSystem.writeAsStringAsync(path, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (mode === "save" || !(await Sharing.isAvailableAsync())) {
        return;
      }

      await Sharing.shareAsync(path, {
        mimeType: "image/png",
        dialogTitle: RECURRING_PASS_QR_SCREEN_TITLE,
        UTI: "public.png",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to share the QR image.",
      );
    } finally {
      setIsSharing(false);
    }
  };

  const confirmReplace = async () => {
    if (!accessToken || !passId) {
      return;
    }
    setIsReplacing(true);
    setErrorMessage(null);
    try {
      const issued = await replaceAdminRecurringPassQr(accessToken, passId);
      rememberIssuedRecurringPassQrToken(issued.passId, issued.token);
      setToken(issued.token);
      setHasActiveCredential(true);
      setReplaceOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to replace the QR credential.",
      );
    } finally {
      setIsReplacing(false);
    }
  };

  if (isLoading) {
    return (
      <AdminScrollScreen
        title={RECURRING_PASS_QR_SCREEN_TITLE}
        subtitle="Secure recurring visitor credential."
        footer={
          <Button
            label="Back to Pass Details"
            variant="secondary"
            onPress={() =>
              router.replace(passId ? detailsRoute(passId) : ("/(admin)/recurring-passes" as Href))
            }
          />
        }
      >
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading QR pass...</Text>
        </View>
      </AdminScrollScreen>
    );
  }

  if (!item) {
    return (
      <AdminScrollScreen
        title={RECURRING_PASS_QR_SCREEN_TITLE}
        subtitle="Secure recurring visitor credential."
        footer={
          <Button
            label="Back to Recurring Passes"
            variant="secondary"
            onPress={() => router.replace("/(admin)/recurring-passes" as Href)}
          />
        }
      >
        <ErrorBanner message={errorMessage ?? "Recurring visitor pass not found."} />
      </AdminScrollScreen>
    );
  }

  const effective = resolveAdminRecurringPassEffectiveStatus(item);
  const actions = resolveRecurringPassAdminActions({
    ...item,
    hasActiveCredential,
    hasSessionQrToken: Boolean(token),
  });

  return (
    <AdminScrollScreen
      title={RECURRING_PASS_QR_SCREEN_TITLE}
      subtitle="The QR encodes only an opaque credential. Visitor details stay outside the code."
      footer={
        <>
          {token ? (
            <>
              {Platform.OS === "web" ? (
                <Button
                  label="Save QR"
                  loading={isSharing}
                  disabled={isSharing}
                  onPress={() => void exportQrImage("save")}
                />
              ) : (
                <Button
                  label="Share QR"
                  loading={isSharing}
                  disabled={isSharing}
                  onPress={() => void exportQrImage("share")}
                />
              )}
            </>
          ) : null}
          {actions.replaceQr ? (
            <Button
              label="Generate New QR"
              variant={token ? "secondary" : "primary"}
              style={token ? styles.stacked : undefined}
              onPress={() => setReplaceOpen(true)}
            />
          ) : null}
          <Button
            label="Back to Pass Details"
            variant="secondary"
            style={styles.stacked}
            onPress={() => router.replace(detailsRoute(item.id))}
          />
        </>
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
          Visitor photo is retrieved privately and is not encoded in the QR.
        </Text>
      </View>
      <InfoCard label="Visitor name" value={item.visitorName} />
      <InfoCard
        label="Visitor type"
        value={formatStoredRecurringVisitorType(item)}
      />
      <InfoCard label="Destination" value={item.destinationLabel || "—"} />
      <InfoCard
        label="Effective status"
        value={formatRecurringPassEffectiveStatus(item)}
      />
      <InfoCard
        label="Valid until"
        value={formatRecurringPassCalendarDate(item.validUntil)}
      />
      {effective === "suspended" ? (
        <Text style={styles.warning}>{RECURRING_PASS_SUSPENDED_QR_WARNING}</Text>
      ) : null}
      {token ? (
        <View style={styles.qrCard}>
          <QRCode
            value={token}
            size={220}
            getRef={(element) => {
              qrRef.current = element as QrHandle | null;
            }}
          />
          <Text style={styles.warning}>{RECURRING_PASS_QR_ASSIGNMENT_WARNING}</Text>
        </View>
      ) : (
        <Text style={styles.recover}>{RECURRING_PASS_QR_CANNOT_RECOVER_MESSAGE}</Text>
      )}
      <AdminConfirmModal
        visible={replaceOpen}
        title="Generate New QR"
        message="The previous QR will stop working immediately. A new credential will be issued."
        confirmLabel="Replace QR"
        isSubmitting={isReplacing}
        onCancel={() => setReplaceOpen(false)}
        onConfirm={() => void confirmReplace()}
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
  qrCard: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  warning: {
    ...typography.caption,
    color: colors.error,
    textAlign: "center",
  },
  recover: {
    ...typography.body,
    color: colors.textSecondary,
  },
  stacked: {
    marginTop: 8,
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

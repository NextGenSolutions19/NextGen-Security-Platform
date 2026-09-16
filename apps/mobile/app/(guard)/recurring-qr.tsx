import { useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import {
  GUARD_RECURRING_VALIDATION_MESSAGES,
  parseGuardRecurringQrPayload,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { useGuardOnDutyRequired } from "@/features/duty/useGuardOnDutyRequired";
import { decodeQrPayloadFromImageUri } from "@/features/guard-recurring/decodeImportedQr";
import { validateGuardRecurringQr } from "@/features/guard-recurring/guardRecurringService";
import { rememberPendingRecurringCheckin } from "@/features/guard-recurring/pendingRecurringCheckinStore";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { colors, radius, typography } from "@/constants/theme";

const HOME_ROUTE = "/(guard)/home" as Href;
const SEARCH_ROUTE = "/(guard)/recurring-search" as Href;
const VERIFY_ROUTE = "/(guard)/recurring-verify" as Href;

export default function GuardRecurringQrScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const { isOffDuty, offDutyMessage } = useGuardOnDutyRequired(accessToken);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<"menu" | "scan">("menu");
  const [statusText, setStatusText] = useState("Ready.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const lockedRef = useRef(false);

  const validateAndOpen = async (
    rawPayload: string,
    source: "CAMERA_QR" | "IMPORTED_QR",
  ) => {
    if (isOffDuty) {
      setErrorMessage(offDutyMessage);
      return;
    }
    const parsed = parseGuardRecurringQrPayload(rawPayload);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      setStatusText("Invalid QR");
      return;
    }

    setStatusText("Validating...");
    setIsBusy(true);
    try {
      const result = await validateGuardRecurringQr(
        accessToken,
        parsed.token,
        source,
      );
      rememberPendingRecurringCheckin({
        source,
        token: parsed.token,
        passId: result.pass.passId,
        preview: result.pass,
      });
      setStatusText("Valid pass");
      router.push(VERIFY_ROUTE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : GUARD_RECURRING_VALIDATION_MESSAGES.INVALID_QR,
      );
      setStatusText("Invalid QR");
    } finally {
      setIsBusy(false);
      lockedRef.current = false;
    }
  };

  const startScan = async () => {
    if (isOffDuty) {
      setErrorMessage(offDutyMessage);
      return;
    }
    setErrorMessage(null);
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setErrorMessage("Camera permission required");
        setStatusText("Camera permission required");
        return;
      }
    }
    lockedRef.current = false;
    setStatusText("Scanning...");
    setMode("scan");
  };

  const importQr = async () => {
    if (isOffDuty) {
      setErrorMessage(offDutyMessage);
      return;
    }
    setErrorMessage(null);
    setStatusText("Importing...");
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]?.uri) {
      setStatusText("Ready.");
      return;
    }

    setIsBusy(true);
    try {
      const decoded = await decodeQrPayloadFromImageUri(
        picked.assets[0].uri,
        picked.assets[0].file,
      );
      if (!decoded.ok) {
        setErrorMessage(decoded.message);
        setStatusText("No QR found in image");
        return;
      }
      setStatusText("QR detected");
      await validateAndOpen(decoded.payload, "IMPORTED_QR");
    } finally {
      setIsBusy(false);
    }
  };

  if (mode === "scan") {
    return (
      <ScrollScreen
        title="Scan QR"
        subtitle="Point the camera at the recurring visitor QR."
        footer={
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => {
              setMode("menu");
              setStatusText("Ready.");
              lockedRef.current = false;
            }}
          />
        }
      >
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        <Text style={styles.status}>{statusText}</Text>
        <View style={styles.cameraWrap}>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                if (lockedRef.current || isBusy) {
                  return;
                }
                lockedRef.current = true;
                setStatusText("QR detected");
                void validateAndOpen(data, "CAMERA_QR");
              }}
            />
          ) : (
            <Text style={styles.status}>Camera permission required</Text>
          )}
        </View>
        {isBusy ? <ActivityIndicator color={colors.primary} /> : null}
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen
      title="QR Scanner"
      subtitle="Scan, import, or search a recurring visitor."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          onPress={() => router.replace(HOME_ROUTE)}
        />
      }
    >
      {isOffDuty ? <ErrorBanner message={offDutyMessage} /> : null}
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      <Text style={styles.status}>{statusText}</Text>
      {isBusy ? <ActivityIndicator color={colors.primary} /> : null}
      <Button
        label="Scan QR"
        disabled={isBusy || isOffDuty}
        onPress={() => void startScan()}
      />
      <Button
        label="Import QR"
        variant="secondary"
        disabled={isBusy || isOffDuty}
        onPress={() => void importQr()}
      />
      <Button
        label="Forgot QR / Search"
        variant="secondary"
        disabled={isBusy || isOffDuty}
        onPress={() => router.push(SEARCH_ROUTE)}
      />
      {Platform.OS === "web" ? (
        <Text style={styles.hint}>
          Camera scanning may not work on desktop. Use Import QR with a saved QR image.
        </Text>
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  status: {
    ...typography.body,
    color: colors.textSecondary,
  },
  hint: {
    ...typography.caption,
  },
  cameraWrap: {
    height: 320,
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  camera: {
    flex: 1,
  },
});

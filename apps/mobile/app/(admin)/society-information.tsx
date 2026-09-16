import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  SOCIETY_SAVE_SUCCESS_MESSAGE,
  parseSocietyContactNumber,
  parseSocietyEmail,
  parseSocietyInformationSave,
  parseSocietyName,
  parseSocietyPinCode,
  type SocietyInformation,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { replaceAdminDashboard } from "@/features/admin-dashboard/adminDashboardModules";
import {
  getSocietyInformation,
  saveSocietyInformation,
} from "@/features/admin-management/adminManagementService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing, typography } from "@/constants/theme";

interface SocietyDraft {
  name: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  contactNumber: string;
  email: string;
}

function toDraft(society: SocietyInformation): SocietyDraft {
  return {
    name: society.name,
    address: society.address ?? "",
    city: society.city ?? "",
    state: society.state ?? "",
    pinCode: society.pinCode ?? "",
    contactNumber: society.contactNumber ?? "",
    email: society.email ?? "",
  };
}

function draftsEqual(left: SocietyDraft, right: SocietyDraft): boolean {
  return (
    left.name.trim() === right.name.trim() &&
    left.address.trim() === right.address.trim() &&
    left.city.trim() === right.city.trim() &&
    left.state.trim() === right.state.trim() &&
    left.pinCode.trim() === right.pinCode.trim() &&
    left.contactNumber.trim() === right.contactNumber.trim() &&
    left.email.trim() === right.email.trim()
  );
}

export default function AdminSocietyInformationScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [loaded, setLoaded] = useState<SocietyInformation | null>(null);
  const [draft, setDraft] = useState<SocietyDraft>({
    name: "",
    address: "",
    city: "",
    state: "",
    pinCode: "",
    contactNumber: "",
    email: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SocietyDraft, string>>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadSociety = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const society = await getSocietyInformation(accessToken);
      setLoaded(society);
      setDraft(toDraft(society));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load society information.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadSociety();
  }, [loadSociety]);

  const updateDraft = (key: keyof SocietyDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setSuccessMessage(null);
  };

  const handleSave = async () => {
    if (!accessToken || isSaving) {
      return;
    }

    const nameParsed = parseSocietyName(draft.name);
    const pinParsed = parseSocietyPinCode(draft.pinCode);
    const contactParsed = parseSocietyContactNumber(draft.contactNumber);
    const emailParsed = parseSocietyEmail(draft.email);
    const nextErrors: Partial<Record<keyof SocietyDraft, string>> = {};
    if (!nameParsed.ok) {
      nextErrors.name = nameParsed.message;
    }
    if (!pinParsed.ok) {
      nextErrors.pinCode = pinParsed.message;
    }
    if (!contactParsed.ok) {
      nextErrors.contactNumber = contactParsed.message;
    }
    if (!emailParsed.ok) {
      nextErrors.email = emailParsed.message;
    }

    const parsed = parseSocietyInformationSave(draft);
    if (!parsed.ok || Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      if (!parsed.ok && Object.keys(nextErrors).length === 0) {
        setErrorMessage(parsed.message);
      }
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const society = await saveSocietyInformation(accessToken, parsed.value);
      setLoaded(society);
      setDraft(toDraft(society));
      setSuccessMessage(SOCIETY_SAVE_SUCCESS_MESSAGE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save society information.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const canSave =
    loaded != null && !isLoading && !isSaving && !draftsEqual(draft, toDraft(loaded));

  return (
    <AdminScrollScreen
      title="Society Information"
      subtitle="Details for your own society. Society Code cannot be changed."
      footer={
        <View style={styles.footer}>
          <Button
            label={isSaving ? "Saving..." : "Save Changes"}
            loading={isSaving}
            disabled={!canSave}
            onPress={() => void handleSave()}
          />
          <Button
            label="Back to Dashboard"
            variant="secondary"
            disabled={isSaving}
            onPress={() => replaceAdminDashboard(router as never)}
          />
        </View>
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {successMessage ? <SuccessBanner message={successMessage} /> : null}

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading society information...</Text>
        </View>
      ) : null}

      {!isLoading && errorMessage && !loaded ? (
        <Button label="Retry" variant="secondary" onPress={() => void loadSociety()} />
      ) : null}

      {loaded ? (
        <>
          <InfoCard label="Society Code" value={loaded.societyCode} />
          <InfoCard
            label="Status"
            value={loaded.status === "disabled" ? "Disabled" : "Active"}
          />
          <TextField
            label="Society Name"
            value={draft.name}
            onChangeText={(value) => updateDraft("name", value)}
            error={fieldErrors.name}
            editable={!isSaving}
            autoCapitalize="words"
          />
          <TextField
            label="Address"
            value={draft.address}
            onChangeText={(value) => updateDraft("address", value)}
            error={fieldErrors.address}
            editable={!isSaving}
            autoCapitalize="words"
            multiline
          />
          <TextField
            label="City"
            value={draft.city}
            onChangeText={(value) => updateDraft("city", value)}
            error={fieldErrors.city}
            editable={!isSaving}
            autoCapitalize="words"
          />
          <TextField
            label="State"
            value={draft.state}
            onChangeText={(value) => updateDraft("state", value)}
            error={fieldErrors.state}
            editable={!isSaving}
            autoCapitalize="words"
          />
          <TextField
            label="PIN Code"
            value={draft.pinCode}
            onChangeText={(value) => updateDraft("pinCode", value)}
            error={fieldErrors.pinCode}
            editable={!isSaving}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TextField
            label="Society Contact Number"
            value={draft.contactNumber}
            onChangeText={(value) => updateDraft("contactNumber", value)}
            error={fieldErrors.contactNumber}
            editable={!isSaving}
            keyboardType="phone-pad"
          />
          <TextField
            label="Society Email"
            value={draft.email}
            onChangeText={(value) => updateDraft("email", value)}
            error={fieldErrors.email}
            editable={!isSaving}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </>
      ) : null}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: spacing.sm,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
  },
});

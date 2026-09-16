import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ADMIN_PASSWORD_CHANGED_MESSAGE,
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_PROFILE_SAVED_MESSAGE,
  formatAdminRoleLabel,
  parseAdminProfileSave,
  type AdminProfile,
} from "@nextgen/shared";
import { changeCredentialsSchema } from "@nextgen/validation";
import { useAuth } from "@/features/auth/AuthProvider";
import { replaceAdminDashboard } from "@/features/admin-dashboard/adminDashboardModules";
import {
  getAdminProfile,
  saveAdminProfile,
} from "@/features/admin-management/adminManagementService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { PasswordField } from "@/components/ui/PasswordField";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing, typography } from "@/constants/theme";

interface ProfileDraft {
  adminName: string;
  mobileNumber: string;
  email: string;
}

function toDraft(profile: AdminProfile): ProfileDraft {
  return {
    adminName: profile.adminName ?? "",
    mobileNumber: profile.mobileNumber ?? "",
    email: profile.email ?? "",
  };
}

export default function AdminProfileScreen() {
  const router = useRouter();
  const { session, changeCredentials, clearError } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({
    adminName: "",
    mobileNumber: "",
    email: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadProfile = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await getAdminProfile(accessToken);
      setProfile(result);
      setDraft(toDraft(result));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load admin profile.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const updateDraft = (key: keyof ProfileDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
    setSuccessMessage(null);
  };

  const handleProfileSave = async () => {
    if (!accessToken || isSavingProfile) {
      return;
    }

    const parsed = parseAdminProfileSave(draft);
    if (!parsed.ok) {
      setFieldErrors({
        adminName: /name/i.test(parsed.message) ? parsed.message : "",
        mobileNumber: /mobile/i.test(parsed.message) ? parsed.message : "",
        email: /email/i.test(parsed.message) ? parsed.message : "",
      });
      return;
    }

    setIsSavingProfile(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await saveAdminProfile(accessToken, parsed.value);
      setProfile(result);
      setDraft(toDraft(result));
      setSuccessMessage(ADMIN_PROFILE_SAVED_MESSAGE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save admin profile.",
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSave = async () => {
    clearError();
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    const parsed = changeCredentialsSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        currentPassword: flattened.currentPassword?.[0] ?? "",
        newPassword: flattened.newPassword?.[0] ?? "",
        confirmPassword: flattened.confirmPassword?.[0] ?? "",
      });
      return;
    }

    setIsSavingPassword(true);
    try {
      await changeCredentials({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage(ADMIN_PASSWORD_CHANGED_MESSAGE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update password.",
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  const loadedDraft = profile ? toDraft(profile) : null;
  const profileDirty =
    loadedDraft != null &&
    (draft.adminName.trim() !== loadedDraft.adminName.trim() ||
      draft.mobileNumber.trim() !== loadedDraft.mobileNumber.trim() ||
      draft.email.trim() !== loadedDraft.email.trim());
  const isBusy = isSavingProfile || isSavingPassword;

  return (
    <AdminScrollScreen
      title="Admin Profile"
      subtitle="Your own admin account. Login ID, role, and society cannot be changed here."
      footer={
        <View style={styles.footer}>
          <Button
            label={isSavingProfile ? "Saving..." : "Save Profile"}
            loading={isSavingProfile}
            disabled={isLoading || isBusy || !profileDirty}
            onPress={() => void handleProfileSave()}
          />
          <Button
            label={isSavingPassword ? "Updating..." : "Update Password"}
            loading={isSavingPassword}
            disabled={isLoading || isBusy || !currentPassword || !newPassword}
            onPress={() => void handlePasswordSave()}
          />
          <Button
            label="Back to Dashboard"
            variant="secondary"
            disabled={isBusy}
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
          <Text style={styles.loadingText}>Loading admin profile...</Text>
        </View>
      ) : null}

      {!isLoading && errorMessage && !profile ? (
        <Button label="Retry" variant="secondary" onPress={() => void loadProfile()} />
      ) : null}

      {profile ? (
        <>
          <TextField
            label="Admin Name"
            value={draft.adminName}
            onChangeText={(value) => updateDraft("adminName", value)}
            error={fieldErrors.adminName}
            editable={!isBusy}
            autoCapitalize="words"
          />
          <TextField
            label="Mobile Number"
            value={draft.mobileNumber}
            onChangeText={(value) => updateDraft("mobileNumber", value)}
            error={fieldErrors.mobileNumber}
            editable={!isBusy}
            keyboardType="phone-pad"
          />
          <TextField
            label="Email"
            value={draft.email}
            onChangeText={(value) => updateDraft("email", value)}
            error={fieldErrors.email}
            editable={!isBusy}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <InfoCard label="Login ID" value={profile.loginId} />
          <InfoCard label="Role" value={formatAdminRoleLabel(profile.isAuthorizedAdmin)} />
          <InfoCard
            label="Society"
            value={`${profile.societyName} (${profile.societyCode})`}
          />
          <InfoCard
            label="Status"
            value={profile.status === "disabled" ? "Disabled" : "Active"}
          />
          <Text style={styles.sectionTitle}>Change password</Text>
          <Text style={styles.caption}>
            Enter your current password. Stored passwords are never shown. Minimum{" "}
            {ADMIN_PASSWORD_MIN_LENGTH} characters.
          </Text>
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            error={fieldErrors.currentPassword}
            editable={!isBusy}
          />
          <PasswordField
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            error={fieldErrors.newPassword}
            editable={!isBusy}
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={fieldErrors.confirmPassword}
            editable={!isBusy}
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
  caption: {
    ...typography.caption,
  },
  sectionTitle: {
    ...typography.subtitle,
    marginTop: spacing.sm,
  },
});
